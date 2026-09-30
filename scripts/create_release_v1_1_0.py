import urllib.request
import json
import os

token = os.environ.get('GH_TOKEN', '')
repo = 'nabeelmun/nomad-research'
tag = 'v1.1.0'

release_url = f'https://api.github.com/repos/{repo}/releases'
payload = {
    'tag_name': tag,
    'target_commitish': 'main',
    'name': 'NomadLM v1.1.0 — In-App Setup Wizard & Travel RAG Engine',
    'body': """### ⛺ NomadLM v1.1.0 — In-App First-Launch Setup Wizard & Travel Engine

This release introduces an in-app first-launch setup wizard (inspired by BOAR app architecture), enabling 1-tap model & knowledge downloads directly on-device without requiring a PC or USB cable.

#### 🚀 What's New in v1.1.0:
- **In-App Setup Wizard:** On first launch, users can download the knowledge pack directly over Wi-Fi with live percentage and MB progress indicators.
- **Knowledge Pack Options:**
  - **Standard Research Pack (Recommended for 8GB+ RAM):** `Llama-3.2-3B-Instruct` (Q4_K_M, ~1.92 GB) + Wikivoyage World Travel Pack (`voyage.db`, 313.6 MB).
  - **Lightweight Pack (for 4GB–6GB RAM):** `Qwen2.5-1.5B-Instruct` (Q4_K_M, ~940 MB) + Wikivoyage World Travel Pack (`voyage.db`, 313.6 MB).
- **Dual Operating Modes:**
  - **1-Tap Direct Wi-Fi Download:** Automatic in-app download and installation.
  - **Zero-Network USB Sideload:** Users can still transfer `.gguf` and `.db` files directly into `/sdcard/Download/` to skip network downloads completely.
- **Ground Truth Offline Presets:** Integrated quick-tap benchmark queries for **Lisbon Travel & Vegan Dining**, **STARKs vs SNARKs**, **1973 Oil Shock**, and **Byzantine Fault Tolerance**.
- **100% Airplane Mode:** Fully verified local offline synthesis with zero internet requests after initial asset setup.

#### 📲 Installation:
1. Download **`NomadLM-v1.1.0.apk`** below and install it on your Android device (Android 10+, 8GB+ RAM recommended).
2. Open the app:
   - Select your preferred knowledge pack and tap **Download & Install**.
   - Or transfer `Llama-3.2-3B-Instruct-Q4_K_M.gguf` and `voyage.db` to your phone's `/sdcard/Download/` folder.
3. Switch on **Airplane Mode** and explore offline intelligence!
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

upload_url = None
try:
    with urllib.request.urlopen(req) as resp:
        rel_data = json.loads(resp.read().decode())
        print(f"Created Release: {rel_data['name']} (ID: {rel_data['id']})")
        upload_url = rel_data['upload_url'].split('{')[0]
except urllib.error.HTTPError as e:
    if e.code == 422:
        print("Release tag already exists, fetching existing release...")
        get_req = urllib.request.Request(
            f'https://api.github.com/repos/{repo}/releases/tags/{tag}',
            headers={'Authorization': f'Bearer {token}', 'User-Agent': 'NomadLM-Release'}
        )
        with urllib.request.urlopen(get_req) as resp:
            rel_data = json.loads(resp.read().decode())
            upload_url = rel_data['upload_url'].split('{')[0]
            print(f"Existing release ID: {rel_data['id']}")
    else:
        raise

# Upload NomadLM-v1.1.0.apk
apk_path = 'release/app-release.apk'
apk_size = os.path.getsize(apk_path)
print(f"Uploading NomadLM-v1.1.0.apk ({apk_size} bytes / {round(apk_size/(1024*1024), 1)} MB)...")

asset_url = f"{upload_url}?name=NomadLM-v1.1.0.apk"
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

with urllib.request.urlopen(asset_req) as resp:
    asset_res = json.loads(resp.read().decode())
    print(f"✓ Uploaded NomadLM-v1.1.0.apk: {asset_res['browser_download_url']}")
