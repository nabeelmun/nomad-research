import os
import sys
import time
import json
import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

TOKEN = os.environ.get('GH_TOKEN', '')
REPO = 'nabeelmun/nomad-research'
TAG = 'v1.1.0'
FILE_PATH = 'data/wiki_core.db'

if not os.path.exists(FILE_PATH):
    print(f"Error: {FILE_PATH} not found!")
    sys.exit(1)

file_size = os.path.getsize(FILE_PATH)
file_size_mb = round(file_size / (1024 * 1024), 1)

print(f"Preparing to upload {FILE_PATH} ({file_size_mb} MB / {file_size:,} bytes) to GitHub Releases {TAG}...")

# 1. Fetch release details to get upload_url and check if asset already exists
headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'NomadLM-Uploader'
}

resp = requests.get(f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}', headers=headers)
if resp.status_code != 200:
    print(f"Error fetching release: {resp.status_code} {resp.text}")
    sys.exit(1)

rel_data = resp.json()
upload_base = rel_data['upload_url'].split('{')[0]

# Check if wiki_core.db is already uploaded; if so, delete it first to replace cleanly
for asset in rel_data.get('assets', []):
    if asset['name'] == 'wiki_core.db':
        print(f"Found existing asset {asset['name']} (ID: {asset['id']}). Deleting old asset first...")
        del_resp = requests.delete(asset['url'], headers=headers)
        print(f"Delete status: {del_resp.status_code}")
        time.sleep(2)

# 2. Upload asset with streaming progress
asset_upload_url = f"{upload_base}?name=wiki_core.db"
print(f"Target upload URL: {asset_upload_url}")

class ProgressFile:
    def __init__(self, filename, total_size):
        self._f = open(filename, 'rb')
        self.total_size = total_size
        self.uploaded = 0
        self.start_time = time.time()
        self.last_print = self.start_time

    def read(self, size=-1):
        chunk = self._f.read(size)
        self.uploaded += len(chunk)
        now = time.time()
        if now - self.last_print >= 5.0 or self.uploaded == self.total_size:
            elapsed = now - self.start_time
            speed_mb = (self.uploaded / (1024 * 1024)) / max(elapsed, 0.001)
            pct = (self.uploaded / self.total_size) * 100
            rem_sec = (self.total_size - self.uploaded) / (1024 * 1024) / max(speed_mb, 0.001)
            print(f"\rUpload progress: {pct:.1f}% ({self.uploaded / (1024*1024):.1f} MB / {self.total_size / (1024*1024):.1f} MB) @ {speed_mb:.2f} MB/s | ETA: {rem_sec/60:.1f} min", end="", flush=True)
            self.last_print = now
        return chunk

    def __len__(self):
        return self.total_size

    def close(self):
        self._f.close()

stream_file = ProgressFile(FILE_PATH, file_size)

upload_headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/octet-stream',
    'Content-Length': str(file_size),
    'User-Agent': 'NomadLM-Uploader'
}

print("Starting streaming upload to GitHub Releases...")
try:
    up_resp = requests.post(asset_upload_url, headers=upload_headers, data=stream_file, timeout=1800)
    stream_file.close()
    print("\n")
    if up_resp.status_code in (200, 201):
        res_json = up_resp.json()
        print("SUCCESS! wiki_core.db uploaded successfully!")
        print(f"Download URL: {res_json.get('browser_download_url')}")
    else:
        print(f"Upload failed with status {up_resp.status_code}: {up_resp.text}")
        sys.exit(1)
except Exception as e:
    stream_file.close()
    print(f"\nUpload exception: {e}")
    sys.exit(1)
