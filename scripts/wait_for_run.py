import urllib.request
import json
import time
import sys

run_id = 36676475790
url = f'https://api.github.com/repos/nabeelmun/nomad-research/actions/runs/{run_id}'
req = urllib.request.Request(url, headers={'User-Agent': 'NomadLM-Monitor'})

print(f"Waiting for GitHub Actions run {run_id} to complete...")
start = time.time()

while True:
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            status = data.get('status')
            conclusion = data.get('conclusion')
            elapsed = int(time.time() - start)
            print(f"[{elapsed}s] Status: {status} | Conclusion: {conclusion}")
            if status == 'completed':
                if conclusion == 'success':
                    print(f"✓ Run {run_id} completed successfully in {elapsed}s!")
                    sys.exit(0)
                else:
                    print(f"✗ Run {run_id} failed with conclusion: {conclusion}")
                    sys.exit(1)
    except Exception as e:
        print(f"Check error: {e}")
    
    time.sleep(25)
