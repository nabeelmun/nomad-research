import urllib.request

urls = [
    'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    'https://huggingface.co/rammingaway/androidlm-corpus/resolve/main/voyage.db'
]

for u in urls:
    filename = u.split('/')[-1]
    req = urllib.request.Request(u, method='HEAD', headers={'User-Agent': 'NomadLM-Tester'})
    try:
        with urllib.request.urlopen(req) as resp:
            size_mb = round(int(resp.headers.get('content-length', 0)) / (1024*1024), 1)
            print(f"OK: {filename} -> Status: {resp.status}, Size: {size_mb} MB")
    except Exception as e:
        print(f"FAIL: {filename} -> {e}")
