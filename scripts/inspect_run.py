import urllib.request
import json

url = 'https://api.github.com/repos/nabeelmun/nomad-research/actions/runs/36614404720/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'NomadLM-Monitor'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    for job in data.get('jobs', []):
        print(f"Job: {job['name']} (ID: {job['id']}), Conclusion: {job['conclusion']}")
        for step in job.get('steps', []):
            print(f"  Step: {step['name']} -> {step.get('conclusion')}")
