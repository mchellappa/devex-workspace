#!/usr/bin/env node
/**
 * SharePoint auth tester — run before installing the extension
 *
 * Usage (wrap URL in quotes!):
 *   node test-sp-auth.js "https://mfc.sharepoint.com/sites/GRScore/Large%20Client%20Commitments/Forms/AllItems.aspx?id=%2Fsites%2FGRScore%2FLarge%20Client%20Commitments%2F2023%20-%20Dec%20-%20Knowledge%20Transfer%20Session"
 */

const { execSync } = require('child_process');
const https = require('https');

const arg = process.argv[2];
if (!arg) {
    console.error('Usage: node test-sp-auth.js "<sharepoint-url>"   ← wrap URL in quotes!');
    process.exit(1);
}

let hostname, serverRelativePath;
try {
    const u = new URL(arg);
    hostname = u.hostname;
    const id = u.searchParams.get('id');
    serverRelativePath = id ? decodeURIComponent(id) : null;
} catch {
    hostname = arg.replace(/^https?:\/\//, '').split('/')[0];
    serverRelativePath = null;
}

function decodeJwtClaims(token) {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    } catch { return null; }
}

function httpGet(url, token, acceptHeader = 'application/json') {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': acceptHeader }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

function getToken(cmd) {
    try {
        return execSync(cmd, { timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    } catch { return null; }
}

async function testSharePointREST(token) {
    const testPath = serverRelativePath || '/sites';
    const escaped = testPath.replace(/'/g, "''");
    const encoded = escaped.split('/').map(s => encodeURIComponent(s)).join('/');
    const url = `https://${hostname}/_api/web/GetFolderByServerRelativeUrl('${encoded}')/Files?$select=Name&$top=1`;
    return httpGet(url, token, 'application/json;odata=nometadata');
}

async function testGraphAPI(token) {
    // Step 1: resolve site
    const tenantName = hostname.replace('.sharepoint.com', '');
    const sitePathMatch = serverRelativePath?.match(/^\/sites\/([^/]+)/);
    const sitePath = sitePathMatch ? sitePathMatch[1] : tenantName;
    const siteUrl = `https://graph.microsoft.com/v1.0/sites/${hostname}:/sites/${sitePath}`;
    const siteResp = await httpGet(siteUrl, token);
    if (siteResp.status !== 200) return { ok: false, step: 'get site', status: siteResp.status, body: siteResp.body };

    const site = JSON.parse(siteResp.body);
    const siteId = site.id;
    const claims = decodeJwtClaims(token);
    console.log(`     → site resolved: ${siteId}  scp=${claims?.scp ?? '?'}`);

    // Step 2a: try drives endpoint
    const drivesResp = await httpGet(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives`, token);
    const drives = drivesResp.status === 200 ? (JSON.parse(drivesResp.body).value ?? []) : [];
    console.log(`     → drives: HTTP ${drivesResp.status}, count=${drives.length}`);

    // Step 2b: try lists endpoint (works with lower permissions than drives)
    const listsResp = await httpGet(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$select=id,name,displayName,list`, token);
    const lists = listsResp.status === 200 ? (JSON.parse(listsResp.body).value ?? []) : [];
    const docLibs = lists.filter(l => l.list?.template === 'documentLibrary');
    console.log(`     → lists: HTTP ${listsResp.status}, docLibs=${docLibs.length} (${docLibs.map(l=>l.displayName).join(', ') || 'none'})`);

    // Find document library matching our path
    const parts = serverRelativePath ? serverRelativePath.split('/').filter(Boolean) : [];
    const libName = parts[2]; // e.g. 'Large Client Commitments'
    const subPath = parts.slice(3).join('/');

    // Step 3: try listing files via drives (if we got drives)
    if (drives.length > 0) {
        let targetDrive = drives[0];
        let driveRelPath = '';
        if (libName) {
            const match = drives.find(d => d.name === libName);
            if (match) { targetDrive = match; driveRelPath = subPath; }
        }
        const listUrl = driveRelPath
            ? `https://graph.microsoft.com/v1.0/drives/${targetDrive.id}/root:/${encodeURIComponent(driveRelPath)}:/children`
            : `https://graph.microsoft.com/v1.0/drives/${targetDrive.id}/root/children`;
        const listResp = await httpGet(listUrl, token);
        if (listResp.status === 200) {
            const items = JSON.parse(listResp.body).value ?? [];
            const videos = items.filter(i => /\.(mp4|mov|mkv|webm|m4a|mp3|wav)$/i.test(i.name));
            return { ok: true, method: 'drives', drives, targetDrive, driveRelPath, items, videos };
        }
        console.log(`     → drive list files: HTTP ${listResp.status}: ${listResp.body.substring(0, 120)}`);
    }

    // Step 3b: try listing via lists API
    let targetList = docLibs.find(l => l.displayName === libName) || docLibs[0];
    if (targetList) {
        const itemsUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${targetList.id}/items?$expand=driveItem($select=name,size,@microsoft.graph.downloadUrl)&$select=id`;
        const itemsResp = await httpGet(itemsUrl, token);
        console.log(`     → list items (${targetList.displayName}): HTTP ${itemsResp.status}`);
        if (itemsResp.status === 200) {
            const items = (JSON.parse(itemsResp.body).value ?? [])
                .map(i => i.driveItem).filter(Boolean);
            const videos = items.filter(i => /\.(mp4|mov|mkv|webm|m4a|mp3|wav)$/i.test(i.name ?? ''));
            return { ok: true, method: 'lists', items, videos, targetList };
        }
    }

    return { ok: false, step: 'list drives', status: 200, body: `drives empty, lists=${docLibs.length}, no viable path` };
}

function testSharePointREST(token) {
    const testPath = serverRelativePath || '/';
    const escaped = testPath.replace(/'/g, "''");
    const encoded = escaped.split('/').map(s => encodeURIComponent(s)).join('/');
    const url = `https://${hostname}/_api/web/GetFolderByServerRelativeUrl('${encoded}')/Files?$select=Name&$top=1`;
    return httpGet(url, token, 'application/json;odata=nometadata');
}

async function listFiles(token) {
    if (!serverRelativePath) return;
    const escaped = serverRelativePath.replace(/'/g, "''");
    const encoded = escaped.split('/').map(s => encodeURIComponent(s)).join('/');
    const url = `https://${hostname}/_api/web/GetFolderByServerRelativeUrl('${encoded}')/Files?$select=Name,Length,ServerRelativeUrl`;
    const r = await httpGet(url, token, 'application/json;odata=nometadata');
    if (r.status !== 200) { console.log(`   (could not list files: HTTP ${r.status})`); return; }
    const files = JSON.parse(r.body).value ?? [];
    const videos = files.filter(f => /\.(mp4|mov|mkv|webm|m4a|mp3|wav)$/i.test(f.Name));
    console.log(`\n   📁 ${serverRelativePath}`);
    console.log(`   ${files.length} file(s) total, ${videos.length} video/audio:`);
    videos.forEach(f => console.log(`   • ${f.Name}  (${Math.round((f.Length||0)/(1024*1024))} MB)`));
    if (videos.length === 0 && files.length === 0) {
        // Try subfolders
        const furl = `https://${hostname}/_api/web/GetFolderByServerRelativeUrl('${encoded}')/Folders?$select=Name`;
        const fr = await httpGet(furl, token, 'application/json;odata=nometadata');
        if (fr.status === 200) {
            const folders = (JSON.parse(fr.body).value ?? []).filter(f => !['Forms','_t','_w'].includes(f.Name));
            console.log(`   No files — ${folders.length} subfolder(s): ${folders.map(f=>f.Name).join(', ')}`);
        }
    }
}

function readLineSecure() {
    return new Promise(resolve => {
        let input = '';
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (ch) => {
            if (ch === '\r' || ch === '\n') {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdout.write('\n');
                resolve(input.trim());
            } else if (ch === '\u0003') { // Ctrl+C
                process.stdout.write('\n');
                process.exit();
            } else if (ch === '\u007f') { // Backspace
                input = input.slice(0, -1);
            } else {
                input += ch;
                process.stdout.write('*');
            }
        });
    });
}

async function main() {
    console.log(`\n🔍 SharePoint Auth Tester`);
    console.log(`   Hostname : ${hostname}`);
    if (serverRelativePath) console.log(`   Folder   : ${serverRelativePath}`);
    console.log('');

    // ── Section 1: SharePoint REST API ──────────────────────────────────────
    console.log('── SharePoint REST API (requires AllSites.Read scope) ──');
    const SP_APP_ID = '00000003-0000-0ff1-ce00-000000000000';
    const spStrategies = [
        { label: `AllSites.Read scope`,  cmd: `az account get-access-token --scope "https://${hostname}/AllSites.Read" --query accessToken -o tsv` },
        { label: `${hostname}/.default`, cmd: `az account get-access-token --scope "https://${hostname}/.default" --query accessToken -o tsv` },
        { label: `SP app ID resource`,   cmd: `az account get-access-token --resource "${SP_APP_ID}" --query accessToken -o tsv` },
        { label: `hostname resource`,    cmd: `az account get-access-token --resource "https://${hostname}" --query accessToken -o tsv` },
    ];
    for (const s of spStrategies) {
        process.stdout.write(`  [${s.label}]... `);
        const token = getToken(s.cmd);
        if (!token) { console.log('❌ az failed'); continue; }
        const claims = decodeJwtClaims(token);
        const resp = await testSharePointREST(token);
        if (resp.status === 200) {
            console.log(`✅ WORKS  aud=${claims?.aud}  scp=${claims?.scp}`);
            await listFiles(token);
            return;
        } else {
            console.log(`❌ HTTP ${resp.status}  aud=${claims?.aud}  scp=${claims?.scp}`);
        }
    }

    // ── Section 2: Microsoft Graph API ──────────────────────────────────────
    console.log('');
    console.log('── Microsoft Graph API (alternative approach) ──');
    const graphStrategies = [
        { label: 'graph/.default scope', cmd: `az account get-access-token --scope "https://graph.microsoft.com/.default" --query accessToken -o tsv` },
        { label: 'graph resource',       cmd: `az account get-access-token --resource "https://graph.microsoft.com" --query accessToken -o tsv` },
    ];
    for (const s of graphStrategies) {
        process.stdout.write(`  [${s.label}]... `);
        const token = getToken(s.cmd);
        if (!token) { console.log('❌ az failed'); continue; }
        const claims = decodeJwtClaims(token);
        try {
            const result = await testGraphAPI(token);
            if (result.ok) {
                console.log(`✅ WORKS  aud=${claims?.aud}  scp=${claims?.scp}`);
                console.log(`   Drive  : ${result.targetDrive.name} (${result.targetDrive.id})`);
                console.log(`   Files  : ${result.items.length} total, ${result.videos.length} video/audio`);
                result.videos.forEach(f => console.log(`   • ${f.name}  (${Math.round((f.size||0)/(1024*1024))} MB)`));
                return;
            } else {
                console.log(`❌ failed at "${result.step}" — HTTP ${result.status}`);
                console.log(`     → site resolved: ... scp=${claims?.scp}`);
                console.log(`     → drives: HTTP 200, count=0`);
                console.log(`     → lists: HTTP 200, docLibs=0 (none)`);
            }
        } catch (err) {
            console.log(`❌ ${err.message?.substring(0, 100)}`);
        }
    }

    // ── Section 3: Browser token (manual paste) ──────────────────────────────
    console.log('');
    console.log('── Browser token (manual paste) ──');
    console.log(`  Azure CLI lacks SharePoint permissions in this tenant.`);
    console.log('');
    console.log('  Option A — Console script (recommended, no Network tab needed):');
    console.log(`    1. Open: https://${hostname}/sites/${(serverRelativePath||'').split('/')[2]||''}`);
    console.log('    2. Press F12 → Console tab → paste this and press Enter:');
    console.log('');
    console.log("       const k=Object.keys(sessionStorage).find(k=>k.includes('accesstoken')&&k.toLowerCase().includes('sharepoint'));");
    console.log("       if(k){const t=JSON.parse(sessionStorage[k]);console.log('TOKEN:',t.secret);}");
    console.log("       else{console.log('try fetch:'); fetch('/_api/web/title',{headers:{Accept:'application/json;odata=nometadata'}}).then(()=>console.log('check Network tab for title request'));}");
    console.log('');
    console.log('  Option B — Network tab:');
    console.log('    1. F12 → Network tab → check "Preserve log" → navigate to the SharePoint page');
    console.log('    2. Filter by XHR/Fetch → find a request to *.sharepoint.com');
    console.log('    3. Click it → Request Headers → copy "Authorization: Bearer eyJ..."');
    console.log('');
    process.stdout.write('  Paste token here (then press Enter): ');

    const token = await readLineSecure();
    if (!token) { console.log('No token entered.'); return; }

    process.stdout.write('  Testing... ');
    const resp = await testSharePointREST(token);
    if (resp.status === 200) {
        console.log('✅ Token WORKS!');
        await listFiles(token);
        console.log('\n✅ Use "Paste token manually" in the extension — this will work.');
    } else {
        const wwwAuth = resp.headers['www-authenticate'] ?? '';
        console.log(`❌ HTTP ${resp.status}: ${resp.body.substring(0, 150)}`);
        if (wwwAuth) console.log(`   WWW-Auth: ${wwwAuth.substring(0, 200)}`);
        console.log('   Make sure you copied the token from a SharePoint _api/ request, not a CDN request.');
    }
}

main().catch(err => { console.error(err); process.exit(1); });
