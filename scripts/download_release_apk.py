import urllib.request
import zipfile
import os

token = os.environ.get('GH_TOKEN', '')
artifact_url = 'https://api.github.com/repos/nabeelmun/nomad-research/actions/artifacts/5370258167/zip'

# First get artifact ID from the list
url = 'https://api.github.com/repos/nabeelmun/nomad-research/actions/runs/36616210889/artifacts'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}', 'User-Agent': 'NomadLM-Downloader'})
with urllib.request.urlopen(req) as resp:
    import json
    data = json.loads(resp.read().decode())
    art_id = data['artifacts'][0]['id']
    download_url = data['artifacts'][0]['archive_download_url']
    print(f"Artifact ID: {art_id}")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(NoRedirect)
req2 = urllib.request.Request(download_url, headers={'Authorization': f'Bearer {token}', 'User-Agent': 'NomadLM-Downloader'})

redir = None
try:
    opener.open(req2)
except urllib.error.HTTPError as e:
    if e.code in (301, 302, 303, 307):
        redir = e.headers['Location']
    else:
        raise

if redir:
    print(f"Downloading APK artifact from Azure storage...")
    os.makedirs('release', exist_ok=True)
    zip_path = 'release/nomad-research-release-apk.zip'
    urllib.request.urlretrieve(redir, zip_path)
    print(f"Downloaded zip: {os.path.getsize(zip_path)} bytes")
    
    print("Extracting APK...")
    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall('release')
        for f in zf.namelist():
            print(f"Extracted: {f} ({os.path.getsize(os.path.join('release', f))} bytes)")
    print("Release APK successfully downloaded to release/ folder!")
