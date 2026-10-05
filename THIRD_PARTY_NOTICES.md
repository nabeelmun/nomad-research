# Third-party data and models

The MIT license covers application source only. Model weights and knowledge text retain their own licenses. Downloads are separate from the APK.

| Asset | Publisher / original | License |
|---|---|---|
| Qwen2.5-1.5B-Instruct Q4_K_M | [Qwen](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct), [Bartowski quantization](https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF) | Apache-2.0 |
| LFM2.5-1.2B-Instruct Q4_K_M | [Liquid AI](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF) | Liquid AI LFM Open License v1.0; consult publisher terms before redistribution |
| Qwen3.5-2B Q4_K_M | [Qwen](https://huggingface.co/Qwen/Qwen3.5-2B), [Unsloth quantization](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF) | Apache-2.0 |
| Wikivoyage guide text | [English Wikivoyage](https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft) contributors | CC BY-SA 4.0; individual pages may have additional notices |
| Wikipedia article text | [English Wikipedia](https://en.wikipedia.org/wiki/Wikipedia:Copyrights) contributors, August 2025 FineWiki extraction | CC BY-SA 4.0; individual pages may have additional notices |

The indexed packs transform original text into overlapping passages and searchable FTS tables. Corpus packs remain CC BY-SA and are not relicensed as MIT. Each passage records the original page URL, title and section; pack metadata records snapshot date, source digest and license. Page history and contributor attribution are accessible from the original page. The source sheet keeps this provenance available offline and lets users copy the URL. Do not remove attribution when redistributing a pack.

Runtime bindings: [llama.rn](https://github.com/mybigday/llama.rn) (MIT), llama.cpp (MIT), fzstd (MIT), decimal.js (MIT), @noble/hashes (MIT), Expo and React Native (MIT). See installed package LICENSE files for full dependency notices. Android release signing uses Android SDK apksigner.
