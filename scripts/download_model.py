"""
NomadLM Model & Knowledge Pack Downloader
Downloads recommended quantized GGUF weights optimized for 8GB Android devices.
"""

import os
import sys
import urllib.request

MODELS = {
    "llama-3.2-3b": {
        "name": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "url": "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "size_gb": 2.02,
        "ram_gb": 2.6
    },
    "qwen-2.5-3b": {
        "name": "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
        "url": "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
        "size_gb": 2.15,
        "ram_gb": 2.7
    }
}

def download_file(url, target_path):
    print(f"Downloading from {url} to {target_path}...")
    def reporthook(count, block_size, total_size):
        percent = int(count * block_size * 100 / total_size)
        sys.stdout.write(f"\rProgress: {percent}% ({count * block_size // (1024 * 1024)} MB / {total_size // (1024 * 1024)} MB)")
        sys.stdout.flush()

    urllib.request.urlretrieve(url, target_path, reporthook)
    print("\nDownload complete!")

if __name__ == "__main__":
    choice = "llama-3.2-3b"
    model_info = MODELS[choice]
    os.makedirs("models", exist_ok=True)
    target = os.path.join("models", model_info["name"])
    
    if os.path.exists(target):
        print(f"Model already downloaded at {target}")
    else:
        print(f"Selected: {model_info['name']} (~{model_info['size_gb']} GB, ~{model_info['ram_gb']} GB RAM)")
        download_file(model_info["url"], target)
        print("\nPush model to Android device with:")
        print(f"adb push {target} /sdcard/Download/")
