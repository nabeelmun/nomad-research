import urllib.request
import json
import time

import sys

runs_url = 'https://api.github.com/repos/nabeelmun/nomad-research/actions/runs'
req0 = urllib.request.Request(runs_url, headers={'User-Agent': 'NomadLM-Monitor'})
with urllib.request.urlopen(req0) as resp0:
    latest_run = json.loads(resp0.read().decode())['workflow_runs'][0]
    run_id = latest_run['id']
    print(f"Tracking Run #{run_id} ({latest_run['status']}): {latest_run['head_commit']['message'][:50]}")

url = f'https://api.github.com/repos/nabeelmun/nomad-research/actions/runs/{run_id}/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'NomadLM-Monitor'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    for job in data.get('jobs', []):
        print(f"Job: {job['name']} | Status: {job['status']} | Conclusion: {job['conclusion']}")
        for step in job.get('steps', []):
            print(f"  [{step.get('status')}] {step.get('name')}")
