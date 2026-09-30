import urllib.request
import json

url = 'https://api.github.com/repos/nabeelmun/nomad-research/actions/runs/36616210889/artifacts'
req = urllib.request.Request(url, headers={'User-Agent': 'NomadLM-Monitor'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    print(f"Artifacts count: {data.get('total_count')}")
    for art in data.get('artifacts', []):
        size_mb = round(art['size_in_bytes'] / (1024 * 1024), 2)
        print(f"Artifact Name: {art['name']}")
        print(f"Size: {art['size_in_bytes']} bytes ({size_mb} MB)")
        print(f"Expires at: {art.get('expires_at')}")
