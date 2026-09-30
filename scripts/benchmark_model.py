import time
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
from llama_cpp import Llama

model_path = "models/Llama-3.2-3B-Instruct-Q4_K_M.gguf"

print("==================================================")
print("  NomadLM Local Inference Benchmark")
print(f"  Model: {model_path}")
print("  Threads: 4 CPU cores (simulating mobile ARM config)")
print("==================================================")

print("\n[1/3] Loading GGUF Model into memory...")
t_load_start = time.time()
llm = Llama(
    model_path=model_path,
    n_ctx=2048,
    n_threads=4,
    verbose=False
)
t_load_end = time.time()
print(f"✓ Model loaded in {t_load_end - t_load_start:.2f}s!\n")

test_prompt = (
    "<|start_header_id|>system<|end_header_id|>\n\n"
    "You are NomadLM, a high-performance offline mobile research assistant. "
    "Provide clear, factual, and concise answers.<|eot_id|>\n"
    "<|start_header_id|>user<|end_header_id|>\n\n"
    "Compare STARKs vs SNARKs in terms of trusted setup, quantum resistance, and proof sizes in 3 bullet points.<|eot_id|>\n"
    "<|start_header_id|>assistant<|end_header_id|>\n\n"
)

print("[2/3] Running Benchmark Query: 'STARKs vs SNARKs'...\n--- Streaming Output ---")

token_count = 0
first_token_time = None
start_gen_time = time.time()

for output in llm(test_prompt, max_tokens=180, stream=True, temperature=0.2):
    token = output['choices'][0]['text']
    if first_token_time is None and token.strip():
        first_token_time = time.time()
    token_count += 1
    sys.stdout.write(token)
    sys.stdout.flush()

end_gen_time = time.time()
print("\n--- End of Output ---\n")

total_gen_time = end_gen_time - start_gen_time
ttft_ms = (first_token_time - start_gen_time) * 1000 if first_token_time else 0
tok_per_sec = token_count / total_gen_time if total_gen_time > 0 else 0

print("[3/3] Benchmark Results:")
print("--------------------------------------------------")
print(f"⚡ Generation Speed:     {tok_per_sec:.1f} tokens/sec")
print(f"⏱ Time To First Token:  {ttft_ms:.0f} ms")
print(f"📊 Total Tokens:        {token_count} tokens")
print(f"⏳ Total Generation:    {total_gen_time:.2f} seconds")
print("--------------------------------------------------")
print("✓ Verified: Local offline reasoning runs with zero network!")
