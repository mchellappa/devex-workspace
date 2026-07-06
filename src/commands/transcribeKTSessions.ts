import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import * as https from 'https';
import * as http from 'http';
import { logger } from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecordingFile {
    name: string;
    size: number;
    downloadUrl?: string;  // URL to download from (pre-auth Graph URL or SharePoint direct URL)
    downloadToken?: string; // Bearer token needed if downloadUrl is a SharePoint direct URL
    localPath?: string;    // already on disk
}

interface PrereqResult {
    ok: boolean;
    pythonCmd?: string;
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function transcribeKTSessionsCommand(): Promise<void> {
    try {
        // 1. Check dependencies
        const prereqs = await checkPrerequisites();
        if (!prereqs.ok) { return; }

        // 2. Source: SharePoint or local
        const sourceChoice = await vscode.window.showQuickPick(
            [
                {
                    label: '$(link) SharePoint folder',
                    value: 'sharepoint',
                    description: 'Authenticate via Microsoft Graph and download recordings from SharePoint'
                },
                {
                    label: '$(folder) Local files',
                    value: 'local',
                    description: 'Select audio/video files already downloaded to your machine'
                }
            ],
            { title: 'KT Session Transcription — Recording Source', placeHolder: 'Where are your recordings?' }
        );
        if (!sourceChoice) { return; }

        let recordings: RecordingFile[];
        if (sourceChoice.value === 'sharepoint') {
            recordings = await getSharePointRecordings();
        } else {
            recordings = await getLocalRecordings();
        }

        if (recordings.length === 0) {
            vscode.window.showWarningMessage('No recordings selected.');
            return;
        }

        // 3. Whisper model
        const modelChoice = await selectWhisperModel();
        if (!modelChoice) { return; }

        const { model, estimateMins } = modelChoice;

        // 4. Output directory
        const outputDir = await getOutputDirectory();
        if (!outputDir) { return; }

        // 5. Launch detached batch process
        const launched = await launchDetachedTranscription({
            files: recordings,
            model,
            estimateMins,
            pythonCmd: prereqs.pythonCmd!,
            outputDir
        });
        if (!launched) { return; }

        const totalMins = estimateMins * recordings.length;
        const hrs = Math.floor(totalMins / 60);
        const remaining = totalMins % 60;
        const timeEst = hrs > 0 ? `~${hrs}h ${remaining}m` : `~${remaining}m`;

        const action = await vscode.window.showInformationMessage(
            `🚀 Transcription started in a separate window! ` +
            `${recordings.length} file(s) — estimated ${timeEst} total (${model} model). ` +
            `You can close VS Code. When done, run "DevEx: Structure KT Transcripts" to generate AI notes.`,
            'Structure Transcripts',
            'Open Output Folder'
        );
        if (action === 'Structure Transcripts') {
            await vscode.commands.executeCommand('devex.structureKTTranscripts');
        } else if (action === 'Open Output Folder') {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputDir));
        }

        logger.info(`[KT Transcription] Detached batch started: ${recordings.length} file(s), model=${model}`);

    } catch (err: any) {
        logger.error(`KT Transcription command failed: ${err.message}`);
        vscode.window.showErrorMessage(`KT Transcription failed: ${err.message}`);
    }
}

// ─── Prerequisites ────────────────────────────────────────────────────────────

async function checkPrerequisites(): Promise<PrereqResult> {
    // Find Python
    let pythonCmd: string | undefined;
    for (const cmd of ['python', 'python3']) {
        const r = await execCmd(`${cmd} --version`);
        if (r.code === 0) { pythonCmd = cmd; break; }
    }

    if (!pythonCmd) {
        const action = await vscode.window.showErrorMessage(
            'Python 3.8+ is required for Whisper transcription. Download from python.org.',
            'Download Python'
        );
        if (action === 'Download Python') {
            vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
        }
        return { ok: false };
    }

    // Check ffmpeg (required by Whisper for video files)
    const ffmpegResult = await execCmd('ffmpeg -version');
    if (ffmpegResult.code !== 0) {
        const action = await vscode.window.showErrorMessage(
            'ffmpeg is required to process video files. Install with: winget install ffmpeg',
            'Copy Install Command',
            'Visit Download Page'
        );
        if (action === 'Copy Install Command') {
            await vscode.env.clipboard.writeText('winget install ffmpeg');
            vscode.window.showInformationMessage('Command copied — paste and run it in your terminal.');
        } else if (action === 'Visit Download Page') {
            vscode.env.openExternal(vscode.Uri.parse('https://ffmpeg.org/download.html'));
        }
        return { ok: false };
    }

    // Check openai-whisper
    const whisperCheck = await execCmd(`${pythonCmd} -c "import whisper; print('ok')"`);
    const whisperOk = whisperCheck.code === 0 && whisperCheck.stdout.includes('ok');

    if (!whisperOk) {
        const action = await vscode.window.showWarningMessage(
            'openai-whisper is not installed. Install it now?',
            'Install in Terminal',
            'Cancel'
        );
        if (action !== 'Install in Terminal') { return { ok: false }; }

        const terminal = vscode.window.createTerminal({ name: 'DevEx: Install Whisper' });
        terminal.show();
        terminal.sendText(`${pythonCmd} -m pip install openai-whisper`);
        vscode.window.showInformationMessage(
            'Installing openai-whisper… Re-run "Transcribe KT Sessions" once the installation completes.'
        );
        return { ok: false };
    }

    return { ok: true, pythonCmd };
}

// ─── SharePoint source (SharePoint REST API, no Graph drives required) ────────

async function getSharePointRecordings(): Promise<RecordingFile[]> {
    const folderUrl = await vscode.window.showInputBox({
        title: 'SharePoint Folder URL',
        prompt: 'Paste the URL of the SharePoint folder containing the KT recordings',
        placeHolder: 'https://company.sharepoint.com/sites/Team/Large%20Client%20Commitments/Forms/AllItems.aspx?id=...',
        validateInput: (v) => (v && v.startsWith('https://')) ? null : 'Enter a valid https:// SharePoint URL'
    });
    if (!folderUrl) { return []; }

    // Extract hostname and server-relative folder path from the URL
    const parsed = parseSharePointUrl(folderUrl);
    if (!parsed) {
        vscode.window.showErrorMessage(
            'Could not parse the SharePoint URL. ' +
            'Navigate to the folder in SharePoint and copy the full browser URL (must include the ?id= parameter).'
        );
        return [];
    }

    const { hostname, serverRelativePath } = parsed;
    logger.info(`[SharePoint] hostname=${hostname}  path=${serverRelativePath}`);

    // Acquire a token — tries Azure CLI silently first, falls back to browser-guided flow
    const token = await acquireSharePointToken(hostname, folderUrl);
    if (!token) { return []; }

    // List files via SharePoint REST API
    const files = await listViaSharePointREST(hostname, serverRelativePath, token);
    if (files.length === 0) {
        return [];
    }

    const selected = await vscode.window.showQuickPick(
        files.map(f => ({
            label: `$(file-media) ${f.name}`,
            description: `${(f.size / (1024 * 1024)).toFixed(0)} MB`,
            picked: true,
            file: f
        })),
        {
            canPickMany: true,
            title: `Select recordings to transcribe (${files.length} found)`,
            placeHolder: 'Space to select/deselect, Enter to confirm'
        }
    );
    return selected ? selected.map(s => s.file) : [];
}

/**
 * Parses a SharePoint URL and returns the hostname plus the server-relative folder path.
 * The server-relative path comes from the `?id=` parameter (most reliable).
 */
function parseSharePointUrl(rawUrl: string): { hostname: string; serverRelativePath: string } | null {
    try {
        const u = new URL(rawUrl);
        const hostname = u.hostname;

        // Preferred: ?id= parameter contains the server-relative path
        const idParam = u.searchParams.get('id');
        if (idParam) {
            const serverRelativePath = decodeURIComponent(idParam);
            logger.info(`[SharePoint] Parsed server-relative path from ?id=: ${serverRelativePath}`);
            return { hostname, serverRelativePath };
        }

        // Fallback: derive from URL path (strip /Forms/AllItems.aspx etc.)
        const clean = u.pathname.replace(/\/Forms\/AllItems\.aspx$/i, '').replace(/\/$/, '');
        if (clean.startsWith('/sites/')) {
            logger.info(`[SharePoint] Parsed server-relative path from URL path: ${clean}`);
            return { hostname, serverRelativePath: clean };
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Lists files in a SharePoint folder using the SharePoint REST API.
 * Uses a token scoped to the SharePoint tenant (not graph.microsoft.com).
 * Also checks one level of subfolders so users can point to a parent folder.
 */
async function listViaSharePointREST(
    hostname: string,
    serverRelativePath: string,
    token: string
): Promise<RecordingFile[]> {
    const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.m4a', '.mp3', '.wav'];

    async function getFilesInFolder(folderPath: string): Promise<RecordingFile[]> {
        // Single-quote escape: ' → ''  (OData requirement)
        const escaped = folderPath.replace(/'/g, "''");
        const encodedPath = escaped.split('/').map(s => encodeURIComponent(s)).join('/');
        const url =
            `https://${hostname}/_api/web/GetFolderByServerRelativeUrl('${encodedPath}')` +
            `/Files?$select=Name,Length,ServerRelativeUrl`;
        logger.info(`[SharePoint REST] GET ${url}`);
        const body = await sharepointGet(url, token);
        const items: any[] = body?.value ?? [];
        return items
            .filter(i => VIDEO_EXTENSIONS.some(ext => (i.Name ?? '').toLowerCase().endsWith(ext)))
            .map(i => ({
                name: i.Name,
                size: i.Length ?? 0,
                downloadUrl: `https://${hostname}${i.ServerRelativeUrl}`,
                downloadToken: token
            }));
    }

    async function getSubfolders(folderPath: string): Promise<string[]> {
        const escaped = folderPath.replace(/'/g, "''");
        const encodedPath = escaped.split('/').map(s => encodeURIComponent(s)).join('/');
        const url =
            `https://${hostname}/_api/web/GetFolderByServerRelativeUrl('${encodedPath}')` +
            `/Folders?$select=Name,ServerRelativeUrl`;
        const body = await sharepointGet(url, token);
        return (body?.value ?? [])
            .filter((f: any) => f.Name !== 'Forms' && f.Name !== '_t' && f.Name !== '_w')
            .map((f: any) => f.ServerRelativeUrl as string);
    }

    // Try the specified folder first
    try {
        const direct = await getFilesInFolder(serverRelativePath);
        if (direct.length > 0) {
            logger.info(`[SharePoint REST] Found ${direct.length} video file(s) directly in folder.`);
            return direct;
        }

        // No files here — check one level of subfolders
        logger.info('[SharePoint REST] No videos in specified folder, checking subfolders…');
        const subfolders = await getSubfolders(serverRelativePath);

        if (subfolders.length === 0) {
            vscode.window.showWarningMessage(
                `No audio/video files and no subfolders found in:\n${serverRelativePath}\n` +
                'Make sure you are pasting the URL of the folder that contains the recordings.'
            );
            return [];
        }

        // Let user pick which subfolder(s) to search
        const subChoice = await vscode.window.showQuickPick(
            subfolders.map(sf => ({
                label: `$(folder) ${sf.split('/').pop()}`,
                description: sf,
                value: sf,
                picked: true
            })),
            {
                canPickMany: true,
                title: 'No videos found directly — select subfolders to search',
                placeHolder: 'These subfolders were found inside your chosen folder'
            }
        );
        if (!subChoice || subChoice.length === 0) { return []; }

        const allFiles: RecordingFile[] = [];
        for (const sub of subChoice) {
            const files = await getFilesInFolder(sub.value);
            allFiles.push(...files);
        }

        if (allFiles.length === 0) {
            vscode.window.showWarningMessage('No audio/video files found in the selected subfolders.');
        } else {
            logger.info(`[SharePoint REST] Found ${allFiles.length} video file(s) across subfolders.`);
        }
        return allFiles;

    } catch (err: any) {
        logger.error(`[SharePoint REST] Failed: ${err.message}`);
        vscode.window.showErrorMessage(
            `Could not list the SharePoint folder. Error: ${err.message}\n` +
            'Check the DevEx output channel for details.'
        );
        return [];
    }
}

// ─── SharePoint token acquisition ────────────────────────────────────────────

/**
 * Acquires a SharePoint Bearer token.
 * Silently tries Azure CLI first; if the tenant restricts CLI access (common in enterprise)
 * it falls through directly to the browser-guided manual token flow.
 */
async function acquireSharePointToken(hostname: string, folderUrl?: string): Promise<string | undefined> {
    // Try Azure CLI silently — if it works, great. If not, don't bother the user with errors.
    vscode.window.showInformationMessage(`Authenticating with SharePoint…`);
    const cliToken = await tryAzureCliToken(hostname);
    if (cliToken) { return cliToken; }

    // Azure CLI didn't have SharePoint permissions — guide the user through the browser flow
    logger.info('[SharePoint] Azure CLI could not get a valid SharePoint token — falling back to browser-guided manual token.');
    return acquireTokenViaBrowser(hostname, folderUrl);
}

/** Silently tries all Azure CLI strategies. Returns token on first success, undefined if all fail. */
async function tryAzureCliToken(hostname: string): Promise<string | undefined> {
    const azCheck = await execCmd('az --version');
    if (azCheck.code !== 0) {
        logger.info('[SharePoint] Azure CLI not installed — skipping.');
        return undefined;
    }

    const SP_APP_ID = '00000003-0000-0ff1-ce00-000000000000';
    const strategies = [
        `az account get-access-token --scope "https://${hostname}/AllSites.Read" --query accessToken -o tsv`,
        `az account get-access-token --scope "https://${hostname}/.default" --query accessToken -o tsv`,
        `az account get-access-token --resource "${SP_APP_ID}" --query accessToken -o tsv`,
        `az account get-access-token --resource "https://${hostname}" --query accessToken -o tsv`,
    ];

    for (const cmd of strategies) {
        const result = await execCmd(cmd);
        if (result.code !== 0 || !result.stdout.trim()) { continue; }
        const token = result.stdout.trim();
        // Quick validity check — test the token against the SharePoint root API
        const testResult = await testSharePointToken(hostname, token);
        if (testResult) {
            logger.info(`[SharePoint] Azure CLI token works for ${hostname}`);
            return token;
        }
        logger.info(`[SharePoint] Azure CLI token acquired but rejected by SharePoint (scp likely insufficient)`);
    }
    return undefined;
}

/** Returns true if the token can successfully call the SharePoint REST API. */
async function testSharePointToken(hostname: string, token: string): Promise<boolean> {
    try {
        const url = `https://${hostname}/_api/web?$select=Title`;
        const result = await sharepointGet(url, token);
        return !!(result?.Title !== undefined || result);
    } catch {
        return false;
    }
}

/**
 * Browser-guided manual token flow.
 * Opens the SharePoint site and guides the user through the browser console approach
 * to extract their Bearer token from MSAL's session storage.
 */
async function acquireTokenViaBrowser(hostname: string, folderUrl?: string): Promise<string | undefined> {
    const siteMatch = folderUrl ? new URL(folderUrl).pathname.match(/^\/sites\/([^/]+)/) : null;
    const siteUrl = siteMatch
        ? `https://${hostname}/sites/${siteMatch[1]}`
        : `https://${hostname}`;

    const proceed = await vscode.window.showInformationMessage(
        `Your organisation restricts programmatic SharePoint access. ` +
        `We'll extract a token from your active browser session (takes ~30 seconds).`,
        'Open Browser & Continue',
        'Cancel'
    );
    if (proceed !== 'Open Browser & Continue') { return undefined; }

    // Open the SharePoint site
    await vscode.env.openExternal(vscode.Uri.parse(siteUrl));

    // Copy the console script to clipboard so user can paste it easily
    const consoleScript =
        `const k=Object.keys(sessionStorage).find(k=>k.includes('accesstoken')&&k.toLowerCase().includes('sharepoint'));` +
        `if(k){const t=JSON.parse(sessionStorage[k]);console.log('TOKEN:',t.secret);}` +
        `else{fetch('/_api/web/title',{headers:{Accept:'application/json;odata=nometadata'}})` +
        `.then(()=>console.log('Check Network tab → title request → Request Headers → Authorization'));}`;
    await vscode.env.clipboard.writeText(consoleScript);

    await vscode.window.showInformationMessage(
        `Console script copied to clipboard! In your browser:\n` +
        `1. Press F12 → Console tab\n` +
        `2. Paste (Ctrl+V) and press Enter\n` +
        `3. Copy the TOKEN: value printed below\n` +
        `4. Come back here and paste it in the next prompt`,
        'OK — I have my token'
    );

    return vscode.window.showInputBox({
        title: 'Paste SharePoint Bearer Token',
        prompt: 'Paste the token value printed in the browser console (the long eyJ... string)',
        placeHolder: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJ...',
        password: true,
        validateInput: (v) => {
            if (!v || v.trim().length < 50) { return 'Token looks too short — paste the full eyJ... value'; }
            if (v.trim().startsWith('Bearer ')) { return 'Paste only the token itself, not the "Bearer " prefix'; }
            return null;
        }
    }).then(v => v?.trim());
}



async function getLocalRecordings(): Promise<RecordingFile[]> {
    const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'm4a', 'mp3', 'wav'];

    const mode = await vscode.window.showQuickPick(
        [
            { label: '$(folder) Select a folder', description: 'Scan a folder (and subfolders) for all video/audio files', value: 'folder' },
            { label: '$(file) Select individual files', description: 'Ctrl+click to pick multiple files', value: 'files' },
        ],
        { title: 'How would you like to select recordings?' }
    );
    if (!mode) { return []; }

    if (mode.value === 'folder') {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select folder containing KT recordings'
        });
        if (!uris || uris.length === 0) { return []; }

        const scanDir = (dir: string): string[] => {
            const results: string[] = [];
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results.push(...scanDir(full));
                } else if (VIDEO_EXTS.includes(path.extname(entry.name).slice(1).toLowerCase())) {
                    results.push(full);
                }
            }
            return results;
        };

        const found = scanDir(uris[0].fsPath);
        if (found.length === 0) {
            vscode.window.showWarningMessage('No video/audio files found in that folder.');
            return [];
        }
        vscode.window.showInformationMessage(`Found ${found.length} recording(s) in folder.`);
        return found.map(p => ({ name: path.basename(p), size: fs.statSync(p).size, localPath: p }));
    }

    // Individual file picker
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: { 'Audio / Video': VIDEO_EXTS },
        title: 'Select KT session recordings (Ctrl+click for multiple)'
    });
    if (!uris || uris.length === 0) { return []; }

    return uris.map(uri => ({
        name: path.basename(uri.fsPath),
        size: fs.statSync(uri.fsPath).size,
        localPath: uri.fsPath
    }));
}

// ─── Whisper model selection ──────────────────────────────────────────────────

async function selectWhisperModel(): Promise<{ model: string; estimateMins: number } | undefined> {
    // estimateMins = minutes of CPU time needed per 60-min recording (approximate)
    const choice = await vscode.window.showQuickPick(
        [
            { label: '$(zap) tiny    — 5–10 min / hr of audio',   value: 'tiny',   estimateMins: 8,  description: 'Fastest, less accurate. Good for testing.' },
            { label: '$(dashboard) base  — 10–20 min / hr',        value: 'base',   estimateMins: 15, description: 'Good for clear recordings with little background noise.' },
            { label: '$(star) small  — 20–35 min / hr',            value: 'small',  estimateMins: 28, description: 'Balanced. Recommended if you need results today.' },
            { label: '$(rocket) medium — 45–90 min / hr',          value: 'medium', estimateMins: 65, description: 'Best for technical speech. May take longer than the video itself.' },
            { label: '$(trophy) large  — 2–4 hrs / hr  ⚠ slow',   value: 'large',  estimateMins: 180, description: 'Highest accuracy. Only practical with a GPU.' }
        ],
        {
            title: 'Whisper Transcription Model — CPU Time Estimates',
            placeHolder: 'For a 60-min KT session, "small" is often the best CPU tradeoff'
        }
    );
    return choice ? { model: choice.value, estimateMins: choice.estimateMins } : undefined;
}

// ─── Output directory ─────────────────────────────────────────────────────────

async function getOutputDirectory(): Promise<string | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const defaultDir = workspaceRoot
        ? path.join(workspaceRoot, 'kt-transcripts')
        : path.join(os.homedir(), 'kt-transcripts');

    if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
    }

    const choice = await vscode.window.showQuickPick(
        [
            { label: `$(folder) ${defaultDir}`, value: defaultDir, description: 'Recommended' },
            { label: '$(folder-opened) Choose a different folder…', value: 'browse' }
        ],
        { title: 'Where should transcript files be saved?', placeHolder: 'Select output folder' }
    );
    if (!choice) { return undefined; }
    if (choice.value !== 'browse') { return choice.value; }

    const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        title: 'Select output folder for transcripts'
    });
    return uris?.[0]?.fsPath;
}

// ─── Detached batch launcher ──────────────────────────────────────────────────

interface DetachedLaunchOpts {
    files: RecordingFile[];
    model: string;
    estimateMins: number;
    pythonCmd: string;
    outputDir: string;
}

async function launchDetachedTranscription(opts: DetachedLaunchOpts): Promise<boolean> {
    const { files, model, pythonCmd, outputDir } = opts;

    // Locate the bundled Python runner (templates/ at extension root)
    const runnerSrc = path.join(__dirname, '..', '..', 'templates', 'kt-transcribe-runner.py');
    if (!fs.existsSync(runnerSrc)) {
        vscode.window.showErrorMessage(
            `kt-transcribe-runner.py not found at: ${runnerSrc}. Try reinstalling the extension.`
        );
        return false;
    }

    const runnerDest = path.join(outputDir, 'kt-transcribe-runner.py');
    fs.copyFileSync(runnerSrc, runnerDest);

    // Write config — Python script deletes this immediately after reading (contains tokens)
    const config = {
        outputDir,
        model,
        pythonCmd,
        files: files.map(f => ({
            name: f.name,
            downloadUrl: f.downloadUrl,
            downloadToken: f.downloadToken,
            localPath: f.localPath
        }))
    };
    const configPath = path.join(outputDir, '.kt-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });

    // Write .bat launcher
    const batPath = path.join(outputDir, 'kt-transcribe.bat');
    const bat =
        `@echo off\r\n` +
        `title KT Transcription — DevEx AI Assistant\r\n` +
        `cd /d "%~dp0"\r\n` +
        `echo Starting KT transcription batch...\r\n` +
        `"${pythonCmd}" kt-transcribe-runner.py .kt-config.json\r\n`;
    fs.writeFileSync(batPath, bat, 'utf-8');

    // Launch in new CMD window — /k keeps window open so user can read results
    const proc = cp.spawn(
        'cmd.exe',
        ['/c', 'start', 'KT Transcription', 'cmd.exe', '/k', batPath],
        { detached: true, stdio: 'ignore', cwd: outputDir }
    );
    proc.unref();

    logger.info(`[KT Transcription] Detached batch launched: ${batPath} (${files.length} files, model=${model})`);
    return true;
}

// ─── Download ─────────────────────────────────────────────────────────────────

function downloadRecording(downloadUrl: string, name: string, authToken?: string): Promise<string> {
    const tempDir = path.join(os.tmpdir(), 'devex-kt-recordings');
    if (!fs.existsSync(tempDir)) { fs.mkdirSync(tempDir, { recursive: true }); }
    const destPath = path.join(tempDir, name);

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        function doGet(url: string, isRedirect = false): void {
            const reqUrl = new URL(url);
            const options: https.RequestOptions = {
                hostname: reqUrl.hostname,
                port: reqUrl.port || 443,
                path: reqUrl.pathname + reqUrl.search,
                method: 'GET',
                headers: {}
            };
            // Add auth header on initial request only (redirects usually go to CDN, no auth needed)
            if (!isRedirect && authToken) {
                (options.headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
            }
            const mod: typeof https | typeof http = url.startsWith('https://') ? https : http;
            mod.request(options, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
                    if (res.headers.location) { doGet(res.headers.location, true); }
                    else { reject(new Error('Redirect with no Location header')); }
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`Download failed with HTTP ${res.statusCode}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(destPath); });
                file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
            }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); }).end();
        }

        doGet(downloadUrl);
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function execCmd(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise(resolve => {
        cp.exec(command, { timeout: 15_000 }, (error, stdout, stderr) => {
            const code = error
                ? (typeof error.code === 'number' ? error.code : 1)
                : 0;
            resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
        });
    });
}

/** Minimal Microsoft Graph GET wrapper using Node.js built-in https. */
function graphGet(url: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const reqUrl = new URL(url);
        const options: https.RequestOptions = {
            hostname: reqUrl.hostname,
            path: reqUrl.pathname + reqUrl.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`Graph API ${res.statusCode}: ${data.substring(0, 300)}`));
                    return;
                }
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`Invalid JSON from Graph API: ${data.substring(0, 200)}`)); }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/** SharePoint REST API GET — uses Accept: application/json;odata=nometadata for clean JSON. */
function sharepointGet(url: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const reqUrl = new URL(url);
        const options: https.RequestOptions = {
            hostname: reqUrl.hostname,
            path: reqUrl.pathname + reqUrl.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json;odata=nometadata'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    // Include WWW-Authenticate header to diagnose token audience mismatches
                    const wwwAuth = res.headers['www-authenticate'] ?? '';
                    const hint = res.statusCode === 401 && wwwAuth
                        ? `\nWWW-Authenticate: ${wwwAuth.substring(0, 300)}`
                        : '';
                    logger.info(`[SharePoint REST] ${res.statusCode} ${url}\n${data.substring(0, 400)}${hint}`);
                    reject(new Error(`SharePoint REST ${res.statusCode}: ${data.substring(0, 400)}${hint}`));
                    return;
                }
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`Invalid JSON from SharePoint REST: ${data.substring(0, 200)}`)); }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

