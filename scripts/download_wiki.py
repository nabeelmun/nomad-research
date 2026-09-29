import os
import sys
import time
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)
WIKI_PATH = os.path.join(DATA_DIR, "wiki.db")
URL = "https://huggingface.co/datasets/rammingaway/androidlm-corpus/resolve/main/wiki.db"

def download_with_resume(url, filepath):
    existing_bytes = 0
    if os.path.exists(filepath):
        existing_bytes = os.path.getsize(filepath)

    req = urllib.request.Request(url)
    if existing_bytes > 0:
        req.add_header("Range", f"bytes={existing_bytes}-")
        print(f"Resuming download from byte {existing_bytes:,} ({existing_bytes / (1024**3):.2f} GB)...")
    else:
        print("Starting download of wiki.db (~21.3 GB)...")

    try:
        with urllib.request.urlopen(req) as response:
            content_range = response.headers.get("Content-Range")
            if content_range:
                # Content-Range: bytes START-END/TOTAL
                total_bytes = int(content_range.split("/")[-1])
            else:
                total_bytes = int(response.headers.get("Content-Length", 0)) + existing_bytes

            mode = "ab" if existing_bytes > 0 else "wb"
            start_time = time.time()
            downloaded = existing_bytes
            last_print_time = start_time

            with open(filepath, mode) as f:
                chunk_size = 4 * 1024 * 1024 # 4MB chunks
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)

                    now = time.time()
                    if now - last_print_time >= 5.0: # Print every 5 seconds
                        elapsed = now - start_time
                        speed_mb = (downloaded - existing_bytes) / (1024 * 1024) / max(elapsed, 0.001)
                        pct = (downloaded / total_bytes) * 100 if total_bytes > 0 else 0
                        remaining_mb = (total_bytes - downloaded) / (1024 * 1024)
                        eta_sec = remaining_mb / max(speed_mb, 0.001)
                        eta_min = eta_sec / 60
                        print(
                            f"\rProgress: {pct:.1f}% ({downloaded / (1024**3):.2f} GB / {total_bytes / (1024**3):.2f} GB) "
                            f"@ {speed_mb:.1f} MB/s | ETA: {eta_min:.1f} min",
                            end="",
                            flush=True
                        )
                        last_print_time = now

        print(f"\nDownload finished successfully! Saved to {filepath}")
    except Exception as e:
        print(f"\nDownload interrupted: {e}")
        sys.exit(1)

if __name__ == "__main__":
    download_with_resume(URL, WIKI_PATH)
