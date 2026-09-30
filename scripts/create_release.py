import urllib.request
import json
import os

token = os.environ.get('GH_TOKEN', '')
repo = 'nabeelmun/nomad-research'

# 1. Create Release
release_url = f'https://api.github.com/repos/{repo}/releases'
payload = {
    'tag_name': 'v1.0.0',
    'target_commitish': 'main',
    'name': 'NomadLM v1.0.0 - Offline AI Research Engine for Android',
    'body': """### NomadLM v1.0.0 — Offline Native Android Research Engine

This release provides the compiled, installable `.apk` for Android devices.

#### Key Specs:
- **100% Offline Inference:** Pinned to ARM64 NEON with 4 CPU threads via `llama.rn` (Llama-3.2-3B-Instruct Q4_K_M).
- **Dual-Layer Knowledge Store:** SQLite FTS5 lexical indexing over `voyage.db` (549k places) + `wiki_core.db` (top 120k Wikipedia articles).
- **Zero Network Permissions:** `android.permission.INTERNET` explicitly blocked.
- **Universal Android Compatibility:** Designed for Android 10+ with 8GB+ RAM.

#### Installation:
1. Download `app-release.apk` below and install it on your Android device.
2. Place the GGUF model and database files in your `/sdcard/Download/` folder.
""",
    'draft': False,
    'prerelease': False
}

req = urllib.request.Request(
    release_url,
    data=json.dumps(payload).encode('utf-8'),
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User-Agent': 'NomadLM-Release'
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        rel_data = json.loads(resp.read().decode())
        print(f"Created Release: {rel_data['name']} (ID: {rel_data['id']})")
        upload_url = rel_data['upload_url'].split('{')[0]
except urllib.error.HTTPError as e:
    if e.code == 422: # Already exists
        get_req = urllib.request.Request(f'https://api.github.com/repos/{repo}/releases/tags/v1.0.0', headers={'Authorization': f'Bearer {token}', 'User-Agent': 'NomadLM-Release'})
        with urllib.request.urlopen(get_req) as resp:
            rel_data = json.loads(resp.read().decode())
            upload_url = rel_data['upload_url'].split('{')[0]
            print(f"Release v1.0.0 already exists (ID: {rel_data['id']})")
    else:
        raise

# 2. Upload app-release.apk asset
apk_path = 'release/app-release.apk'
apk_size = os.path.getsize(apk_path)
print(f"Uploading app-release.apk ({apk_size} bytes) to GitHub Release...")

asset_url = f"{upload_url}?name=NomadLM-v1.0.0.apk"
with open(apk_path, 'rb') as f:
    apk_data = f.read()

asset_req = urllib.request.Request(
    asset_url,
    data=apk_data,
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': str(apk_size),
        'User-Agent': 'NomadLM-Release'
    }
)

try:
    with urllib.request.urlopen(asset_req) as resp:
        asset_data = json.loads(resp.read().decode())
        print(f"Successfully uploaded: {asset_data['browser_download_url']}")
except Exception as e:
    print(f"Error uploading asset: {e}")
