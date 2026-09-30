import urllib.request
import json
import os

token = os.environ.get('GH_TOKEN', '')
repo = 'nabeelmun/nomad-research'

get_req = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/releases/tags/v1.0.0',
    headers={'Authorization': f'Bearer {token}', 'User-Agent': 'NomadLM-Uploader'}
)

with urllib.request.urlopen(get_req) as resp:
    rel_data = json.loads(resp.read().decode())
    upload_url = rel_data['upload_url'].split('{')[0]

file_path = 'data/voyage.db'
file_size = os.path.getsize(file_path)
print(f"Uploading {file_path} ({file_size} bytes / {round(file_size/(1024*1024), 1)} MB) to GitHub Releases v1.0.0...")

asset_url = f"{upload_url}?name=voyage.db"

with open(file_path, 'rb') as f:
    data = f.read()

asset_req = urllib.request.Request(
    asset_url,
    data=data,
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/octet-stream',
        'Content-Length': str(file_size),
        'User-Agent': 'NomadLM-Uploader'
    }
)

with urllib.request.urlopen(asset_req) as resp:
    res = json.loads(resp.read().decode())
    print("✓ Successfully uploaded voyage.db!")
    print(f"Public Download URL: {res['browser_download_url']}")
