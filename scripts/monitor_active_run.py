import urllib.request
import json
import time

url = 'https://api.github.com/repos/nabeelmun/nomad-research/actions/runs/36616210889/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'NomadLM-Monitor'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    for job in data.get('jobs', []):
        print(f"Job: {job['name']} | Status: {job['status']} | Conclusion: {job['conclusion']}")
        for step in job.get('steps', []):
            print(f"  [{step.get('status')}] {step.get('name')}")
