#!/usr/bin/env python3
"""
SharePoint KT Recording Downloader
Uses Selenium to log you in, then extracts FedAuth cookies and uses urllib
for all REST API calls and downloads — no tokens, no admin rights needed.

Install: pip install selenium
Run:     python download-kt-recordings.py
"""

import os, sys, json, time, urllib.request, urllib.parse, urllib.error

VIDEO_EXTENSIONS = {'.mp4', '.mov', '.mkv', '.webm', '.m4a', '.mp3', '.wav'}
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'


# ── Browser setup ─────────────────────────────────────────────────────────────

def make_driver():
    """Launch Edge (or Chrome fallback) — just enough to capture the login session."""
    try:
        from selenium.webdriver.edge.options import Options
        from selenium import webdriver
        opts = Options()
        opts.add_argument('--start-maximized')
        driver = webdriver.Edge(options=opts)
        print('✓ Launched Microsoft Edge')
        return driver
    except Exception as e:
        print(f'Edge not available ({e}), trying Chrome...')

    try:
        from selenium.webdriver.chrome.options import Options
        from selenium import webdriver
        opts = Options()
        opts.add_argument('--start-maximized')
        driver = webdriver.Chrome(options=opts)
        print('✓ Launched Google Chrome')
        return driver
    except Exception as e:
        print(f'Chrome not available either: {e}')
        sys.exit(1)


def extract_cookies(driver) -> dict:
    """Pull all cookies from the current browser session."""
    return {c['name']: c['value'] for c in driver.get_cookies()}


# ── SharePoint REST (pure urllib — no async scripts, no CSP issues) ───────────

DEBUG = os.environ.get('SP_DEBUG', '').lower() in ('1', 'true', 'yes')


def sp_api(url: str, cookies: dict) -> dict:
    """Call a SharePoint REST endpoint using extracted FedAuth cookies."""
    cookie_header = '; '.join(f"{k}={v}" for k, v in cookies.items())
    req = urllib.request.Request(url, headers={
        'Cookie': cookie_header,
        'Accept': 'application/json;odata=nometadata',
        'User-Agent': USER_AGENT,
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode('utf-8')
            if DEBUG:
                print(f'    HTTP {resp.status}: {raw[:500]}')
            data = json.loads(raw)
            # SharePoint sometimes returns HTTP 200 with an odata.error body
            if 'odata.error' in data:
                msg = data['odata.error'].get('message', {}).get('value', str(data['odata.error']))
                return {'status': 500, 'error': f'OData error: {msg}'}
            return {'status': resp.status, 'data': data}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')[:400]
        if DEBUG:
            print(f'    HTTP {e.code}: {body}')
        return {'status': e.code, 'error': f'{e.reason}: {body}'}
    except json.JSONDecodeError as e:
        # Probably got HTML (login redirect) — cookies may be expired
        return {'status': -1, 'error': f'JSON parse failed (login redirect?): {e}'}
    except Exception as e:
        return {'status': -1, 'error': str(e)}


def build_sp_url(api_base: str, folder_path: str, endpoint: str, select: str) -> str:
    """Build SharePoint REST URL scoped to the correct site collection."""
    escaped = folder_path.replace("'", "''")
    path_enc = urllib.parse.quote(escaped, safe='/')
    return (f"{api_base}/web"
            f"/GetFolderByServerRelativeUrl('{path_enc}')"
            f"/{endpoint}?{select}")


def list_files(api_base: str, folder_path: str, cookies: dict):
    url = build_sp_url(api_base, folder_path, 'Files',
                       '$select=Name,Length,ServerRelativeUrl')
    print(f'  → {url[:120]}...')
    result = sp_api(url, cookies)
    status = result.get('status')
    if status != 200:
        return None, f"HTTP {status}: {result.get('error') or json.dumps(result.get('data',''))[:300]}"
    items = result['data'].get('value', [])
    print(f'     Files returned: {len(items)}')
    return items, None


def list_subfolders(api_base: str, folder_path: str, cookies: dict):
    url = build_sp_url(api_base, folder_path, 'Folders',
                       '$select=Name,ServerRelativeUrl')
    print(f'  → {url[:120]}...')
    result = sp_api(url, cookies)
    status = result.get('status')
    if status != 200:
        print(f'  ⚠ Subfolder error HTTP {status}: {result.get("error", "")[:200]}')
        return []
    folders = result['data'].get('value', [])
    print(f'     Folders returned: {len(folders)} (raw names: {[f.get("Name") for f in folders[:10]]})')
    return [f for f in folders if f.get('Name') not in ('Forms', '_t', '_w')]


def parse_sp_url(url: str):
    """Parse a SharePoint URL into (hostname, folder_path).

    Handles both URL formats:
    - ?id= param URLs (copied from Teams/browser folder view — preferred)
    - AllItems.aspx base URLs (strips /Forms/AllItems.aspx suffix)
    """
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname
    params = dict(urllib.parse.parse_qsl(parsed.query))  # parse_qsl auto-decodes values

    if 'id' in params:
        folder_path = params['id']   # already decoded
    else:
        path = urllib.parse.unquote(parsed.path)
        for suffix in ['/Forms/AllItems.aspx', '/Forms/DispForm.aspx', '/AllItems.aspx']:
            if path.lower().endswith(suffix.lower()):
                path = path[:-len(suffix)]
                break
        if path.lower().endswith('.aspx'):
            path = path.rsplit('/', 1)[0]
        folder_path = path

    return hostname, folder_path


def library_root(folder_path: str) -> str:
    """Return the document library root from a server-relative path.

    /sites/GRScore/Large Client Commitments/2023-Dec-KT  →  /sites/GRScore/Large Client Commitments
    /sites/GRScore/Large Client Commitments               →  /sites/GRScore/Large Client Commitments
    """
    parts = [p for p in folder_path.split('/') if p]
    # Site collections: /sites/{name} or /teams/{name} — library is 3rd segment
    if len(parts) >= 3 and parts[0] in ('sites', 'teams', 'portals', 'personal'):
        return '/' + '/'.join(parts[:3])
    return folder_path




def infer_api_base(hostname: str, folder_path: str) -> str:
    """Derive the site collection _api base URL."""
    parts = [p for p in folder_path.split('/') if p]
    if len(parts) >= 2 and parts[0] in ('sites', 'teams', 'portals', 'personal'):
        site_path = f'/{parts[0]}/{parts[1]}'
    else:
        site_path = ''
    return f'https://{hostname}{site_path}/_api'


def search_videos(hostname: str, api_base: str, site_url: str, cookies: dict) -> list:
    """Use SharePoint Search API to find video files anywhere in the site."""
    ext_clause = ' OR '.join(f'FileExtension:{e.lstrip(".")}' for e in VIDEO_EXTENSIONS)
    q = f"path:{site_url} AND ({ext_clause})"
    search_url = (f'{api_base}/search/query?'
                  + urllib.parse.urlencode({
                      'querytext':       f"'{q}'",
                      'selectproperties': "'Title,Path,FileExtension,Size'",
                      'rowlimit':        '50',
                  }))
    print(f'  Searching: {search_url[:120]}...')
    r = sp_api(search_url, cookies)
    if r.get('status') != 200:
        print(f'  Search failed HTTP {r.get("status")}: {r.get("error","")[:200]}')
        return []
    try:
        rows = (r['data'].get('PrimaryQueryResult', {})
                         .get('RelevantResults', {})
                         .get('Table', {})
                         .get('Rows', {})
                         .get('results', []))
        results = []
        for row in rows:
            cells = {c['Key']: c['Value']
                     for c in row.get('Cells', {}).get('results', [])}
            path = cells.get('Path', '')
            size = int(cells.get('Size', 0))
            print(f'  Found: {cells.get("Title", path.split("/")[-1])}  ({size // (1024*1024)} MB)')
            results.append({'Name': cells.get('Title', path.split('/')[-1]),
                             'Path': path, 'Length': size})
        if not results:
            print('  No videos found via Search.')
        return results
    except Exception as e:
        print(f'  Search parse error: {e}')
        return []


def find_videos_recursive(api_base: str, folder_path: str, cookies: dict,
                          depth: int = 0, max_depth: int = 6) -> list:
    """Recursively find all video files under folder_path."""
    if depth > max_depth:
        return []
    indent = '  ' * (depth + 1)

    files, err = list_files(api_base, folder_path, cookies)
    videos = []
    if files:
        for f in files:
            if any(f['Name'].lower().endswith(ext) for ext in VIDEO_EXTENSIONS):
                mb = int(f.get('Length', 0)) / (1024 * 1024)
                print(f'{indent}[video] {f["Name"]}  ({mb:.0f} MB)')
                videos.append(f)

    subfolders = list_subfolders(api_base, folder_path, cookies)
    for sf in subfolders:
        print(f'{indent}[dir]   {sf["Name"]}/')
        videos.extend(find_videos_recursive(api_base, sf['ServerRelativeUrl'],
                                            cookies, depth + 1, max_depth))
    return videos


def browse_library(api_base: str, lib_root: str, cookies: dict) -> list:
    """List subfolders of the library root, let the user pick, then recurse."""
    print(f'\nBrowsing library: {lib_root}')
    subfolders = list_subfolders(api_base, lib_root, cookies)
    if not subfolders:
        # No subfolders — try files at root directly
        return find_videos_recursive(api_base, lib_root, cookies)

    print(f'\nFound {len(subfolders)} subfolder(s) in library root:')
    for i, sf in enumerate(subfolders):
        print(f'  {i+1}. {sf["Name"]}')
    sel = input('\nWhich subfolders to search? (e.g. 1,2,3 or "all"): ').strip()
    if sel.lower() == 'all':
        selected = subfolders
    else:
        idxs = [int(x.strip()) - 1 for x in sel.split(',') if x.strip().isdigit()]
        selected = [subfolders[i] for i in idxs if 0 <= i < len(subfolders)]

    videos = []
    for sf in selected:
        print(f'\n  Scanning {sf["Name"]}...')
        videos.extend(find_videos_recursive(api_base, sf['ServerRelativeUrl'], cookies))
    return videos


def download_file(url: str, dest_path: str, cookies: dict):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    cookie_header = '; '.join(f"{k}={v}" for k, v in cookies.items())
    req = urllib.request.Request(url, headers={
        'Cookie': cookie_header,
        'User-Agent': USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=600) as resp:
        total = int(resp.headers.get('Content-Length', 0))
        downloaded = 0
        with open(dest_path, 'wb') as f:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = int(downloaded * 100 / total)
                    print(f'  {pct:3d}%  {downloaded/(1024*1024):.1f} / {total/(1024*1024):.1f} MB   ', end='\r')
    print()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    try:
        import selenium
    except ImportError:
        print('Installing selenium...')
        import subprocess
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'selenium'], check=True)
        print('Installed. Re-run the script.')
        sys.exit(0)

    print('=' * 60)
    print('  SharePoint KT Recording Downloader')
    print('  (browser login → cookie extract → urllib download)')
    print('=' * 60)

    # ── Inputs ────────────────────────────────────────────────────────────────
    sp_url = input('\nPaste your SharePoint folder URL:\n> ').strip()
    if not sp_url:
        print('No URL provided.')
        sys.exit(1)

    try:
        hostname, folder_path = parse_sp_url(sp_url)
    except Exception as e:
        print(f'Could not parse URL: {e}')
        sys.exit(1)

    api_base = infer_api_base(hostname, folder_path)
    lib_root = library_root(folder_path)

    print(f'\n  Host   : {hostname}')
    print(f'  Folder : {folder_path}')
    print(f'  Library: {lib_root}')
    print(f'  API    : {api_base}')

    default_dir = os.path.join(os.path.expanduser('~'), 'KT-Recordings')
    user_dir    = input(f'\nLocal download folder [{default_dir}]: ').strip()
    download_dir = user_dir if user_dir else default_dir
    os.makedirs(download_dir, exist_ok=True)

    # ── Browser: login only ───────────────────────────────────────────────────
    print('\nLaunching browser to capture your SharePoint session...')
    driver = make_driver()

    try:
        driver.get(f'https://{hostname}')
        print('\nIf a login page appeared, please sign in now.')
        input('Press Enter once you can see the SharePoint site (home page is fine): ')

        # Navigate to the exact folder so all folder-related cookies are set
        print('Navigating to your folder to ensure all cookies are captured...')
        driver.get(sp_url)
        time.sleep(3)

        print('Extracting session cookies...')
        cookies = extract_cookies(driver)
        print(f'  Got {len(cookies)} cookie(s): {", ".join(list(cookies.keys())[:8])}')

    finally:
        driver.quit()
        print('Browser closed.')

    if not cookies:
        print('No cookies captured — cannot continue.')
        sys.exit(1)

    # ── Find video files ──────────────────────────────────────────────────────
    print(f'\nListing files in: {folder_path}')
    files, err = list_files(api_base, folder_path, cookies)
    if err:
        print(f'  Error: {err}')
        files = []

    video_files = [f for f in (files or [])
                   if any(f['Name'].lower().endswith(ext) for ext in VIDEO_EXTENSIONS)]

    if not video_files:
        print('No videos at folder root. Scanning subfolders recursively...')
        video_files = find_videos_recursive(api_base, folder_path, cookies)

    if not video_files:
        # Library root browse: list library subfolders and let user pick
        if lib_root != folder_path:
            print(f'\nFolder empty. Falling back to library root: {lib_root}')
            video_files = browse_library(api_base, lib_root, cookies)

    if not video_files:
        # Last resort: SharePoint Search
        parts = [p for p in folder_path.split('/') if p]
        site_url = f'https://{hostname}/{parts[0]}/{parts[1]}' if len(parts) >= 2 else f'https://{hostname}'
        print(f'\nNo files found via folder API. Trying Search...')
        video_files = search_videos(hostname, api_base, site_url, cookies)

    if not video_files:
        print('\nNo video/audio files found. Check the URL or folder permissions.')
        sys.exit(0)

    # ── Confirm ───────────────────────────────────────────────────────────────
    print(f'\nFound {len(video_files)} video file(s):')
    for i, f in enumerate(video_files):
        mb = int(f.get('Length', 0)) / (1024 * 1024)
        print(f'  {i+1}. {f["Name"]}  ({mb:.0f} MB)')

    total_mb = sum(int(f.get('Length', 0)) for f in video_files) / (1024 * 1024)
    print(f'\n  Total: {total_mb:.0f} MB → {download_dir}')

    confirm = input('\nDownload all? (y/n): ').strip().lower()
    if confirm != 'y':
        print('Cancelled.')
        sys.exit(0)

    # ── Download ──────────────────────────────────────────────────────────────
    print(f'\nDownloading to: {download_dir}')
    skipped, done, failed = 0, 0, 0

    for i, f in enumerate(video_files):
        name = f['Name']
        dest = os.path.join(download_dir, name)
        # Support both folder-listing (ServerRelativeUrl) and search results (Path)
        if 'ServerRelativeUrl' in f:
            url = f'https://{hostname}' + urllib.parse.quote(f['ServerRelativeUrl'], safe='/')
        else:
            url = f['Path']  # search result has full URL
        tag  = f'[{i+1}/{len(video_files)}]'

        if os.path.exists(dest):
            existing_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f'{tag} Skipping (exists, {existing_mb:.0f} MB): {name}')
            skipped += 1
            continue

        print(f'{tag} Downloading: {name}')
        try:
            download_file(url, dest, cookies)
            saved_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f'  ✓ {dest} ({saved_mb:.1f} MB)')
            done += 1
        except Exception as e:
            print(f'  ✗ Failed: {e}')
            failed += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print('=' * 60)
    print(f'  Done: {done} downloaded, {skipped} skipped, {failed} failed')
    print(f'  Folder: {download_dir}')
    print()
    print('  Next step in VS Code:')
    print('  → DevEx: Transcribe KT Session Recordings')
    print('  → Source: Local files')
    print(f'  → Select files from: {download_dir}')
    print('=' * 60)

    input('\nPress Enter to close...')


if __name__ == '__main__':
    main()
