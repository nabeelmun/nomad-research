import urllib.request
import json
import time

url = 'https://api.github.com/repos/nabeelmun/nomad-research/actions/runs'
req = urllib.request.Request(url, headers={'User-Agent': 'NomadLM-Monitor'})

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print(f"Total workflow runs: {data.get('total_count')}")
        for r in data.get('workflow_runs', [])[:3]:
            print(f"ID: {r['id']}")
            print(f"Name: {r['name']}")
            print(f"Status: {r['status']}")
            print(f"Conclusion: {r['conclusion']}")
            print(f"Created At: {r['created_at']}")
            print(f"Run URL: {r['html_url']}")
except Exception as e:
    print(f"Error querying runs: {e}")
