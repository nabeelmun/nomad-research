import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

url = 'https://api.github.com/repos/nabeelmun/nomad-research/releases/tags/v1.0.0'
req = urllib.request.Request(url, headers={'User-Agent': 'NomadLM-Tester'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    print(f"Release: {data['name']}")
    for a in data.get('assets', []):
        size_mb = round(a['size'] / (1024*1024), 1)
        print(f"  - {a['name']} ({size_mb} MB) -> {a['browser_download_url']}")
