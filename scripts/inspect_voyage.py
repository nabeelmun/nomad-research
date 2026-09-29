import os
import urllib.request
import sqlite3

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)
VOYAGE_PATH = os.path.join(DATA_DIR, "voyage.db")
URL = "https://huggingface.co/datasets/rammingaway/androidlm-corpus/resolve/main/voyage.db"

def download_voyage():
    if os.path.exists(VOYAGE_PATH):
        print(f"voyage.db already exists at {VOYAGE_PATH}")
    else:
        print("Downloading voyage.db (328 MB)...")
        def progress(count, block_size, total_size):
            pct = int(count * block_size * 100 / total_size)
            print(f"\r{pct}% ({count * block_size // (1024*1024)} MB / {total_size // (1024*1024)} MB)", end="")
        urllib.request.urlretrieve(URL, VOYAGE_PATH, progress)
        print("\nDownload finished.")

    conn = sqlite3.connect(VOYAGE_PATH)
    cursor = conn.cursor()
    tables = cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table';").fetchall()
    print("\nDatabase Tables:")
    for name, sql in tables:
        print(f"- {name}")
    conn.close()

if __name__ == "__main__":
    download_voyage()
