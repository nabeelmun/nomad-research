# Implementation status - 6 October 2026

Local checkout: C:/Users/Acer/nomad-research. Baseline commit: d39ddb5d35c565b3776aa0d461ea0bb3ae94b917. This report records the implemented source changes and local validation. The implementation is pushed to main. Both GitHub Actions native test builds passed; download links, build commits, hashes and signing details are recorded in TEST_BUILDS.md. Physical-device validation remains pending. The old v1.1.0 binary remains unchanged.

## Findings addressed

| Audit finding | Implemented change | Evidence |
|---|---|---|
| Downloaded databases were not the app's research sources; 21 seeded articles were searched | Production retrieval opens verified FTS5 passage indexes derived from the actual corpora | KnowledgeStore.ts, CorpusIndexer.ts; real SQLite runtime fixtures and full-data validation |
| Compressed blocks / byte offsets were incompatible with direct article search | Bounded zstd conversion, strict UTF-8 decoding, section metadata, overlapping Unicode passage windows, disk-backed metadata indexing | build_corpus.py and native indexer share schema; byte/Unicode and corrupt-offset fixtures |
| Weak retrieval confused diet/city and incidental topic mentions | Diet evidence filtering, city-title scoping, alias handling, title relevance and research-corpus preference | Retrieval regressions and real Lisbon / Bombay / 1973 oil crisis / attention / STARK queries |
| Model produced wrong arithmetic and lost currency formatting | Decimal parser without eval, deterministic balances/percentages/units, mixed-currency and ambiguity rejection; interpreted-expression card | Calculator tests; calculator/clarification routes never call inference |
| Hardcoded Qwen chat markup was used for other models | llama.rn model-native Jinja templates; Qwen 2.5 baseline plus two explicit experimental candidates | Native-boundary contract tests and publisher asset fingerprints; phone inference comparison still pending |
| History duplicated the current question and context could overflow | UI supplies prior turns only; actual model tokenizer budgets history, references, output and 64-token reserve | Prompt-budget tests; at least one supplied source must fit |
| Presence of [1] was labeled VERIFIED | References are labeled attribution, unknown IDs are removed, offline sheets show excerpt/date/URL | Citation regression; support is not automatically fact-checked |
| Stop/completion could both finalize, and history switching raced generation | Request ownership gate, AbortSignal, single finalization/save path; controls remain locked through native settlement | Lifecycle gate and aborted-generation tests; repeated Stop and OS lifecycle still require phone checks |
| Initialization/storage failures were hidden | Verified setup readiness, visible errors/retry, explicit asset repair; shared initialization promises | Typecheck, runtime migration tests and staged-import checks |
| Existence checks accepted incomplete assets and direct sdcard paths broke scoped storage | Pinned SHA/size/magic verification, staged replacement with recoverable previous file, file picker, verified adoption of old private root-level assets, bounded manifest validation | Asset tests reject corrupt files while preserving installed bytes; actual corpus SHA and model publisher metadata verified |
| Downloads had no safe resume | SDK 57 DownloadTask with pause persistence, Android partial-file recovery and safe ignored-Range handling; complete stages are reused after interrupted verification | Upstream native API inspected; real pause/process-death behavior must be verified on phone |
| UI had small controls, dense telemetry and long-chat rendering cost | Shared dark-green tokens, 16-point body text, 48-point controls, safe areas, multiline composer, modal length selector, virtualized history/chat, 50 ms stream buffer | Android production bundle and typecheck; visual/TalkBack checks pending hardware |
| Missing chat/source/settings features | History searches title and all turns, rename, latest-question edit/regenerate, city setting, model/asset manager, source provenance, table/quote/italic/code rendering and clipboard export | SQLite history regressions, formatter checks, compiled screens |
| SDK/dependencies and release workflow were outdated | SDK 57 / RN 0.86.3 / llama.rn 0.12.9, aligned lockfile, CI checks, immutable versioned APK metadata and mandatory persistent release key | Expo Doctor 21/21; audit review; generated Android project and Gradle plugin configuration |
| README overstated performance, article/place counts and footprint | Removed unmeasured claims; documented actual selection, download versus installed storage, licenses, model comparison and hardware testing | README, THIRD_PARTY_NOTICES.md, LICENSE, requirements.txt, 24 benchmark cases |

## Verified locally

- TypeScript strict typecheck passes.
- 30 JavaScript behavioral checks and three Python corpus checks pass (33 total).
- Expo dependency alignment check passes; Expo Doctor passes all 21 checks.
- Android production JavaScript/Hermes export succeeds.
- Native Android prebuild succeeds with the new splash/theme/SQLite configuration.
- Both published raw corpus files were downloaded and matched pinned sizes and SHA-256 digests.
- Both complete corpora were converted, SQLite/FTS integrity-checked and searched using the production retrieval implementation through a real SQLite adapter.
- All three GGUF sizes/digests were compared with Hugging Face publisher metadata at pinned revisions. We did not run these models on a phone.
- Git whitespace checks pass.

## Prepared data artifacts

The full builder produced release/corpora/corpus-manifest.json, voyage.search.db and wiki_core.search.db. They are kept locally under the ignored release directory, not added to Git. Copy the manifest and packs with a chosen GGUF to the phone to skip on-device indexing. Reproducible input fingerprints and this run's output digests are recorded in corpus-build.json.

| Pack | Articles | Passages | Bytes |
|---|---:|---:|---:|
| voyage.search.db | 34,004 | 716,041 | 624,455,680 |
| wiki_core.search.db | 2,570 | 153,224 | 270,299,136 |

## Remaining validation and release requirements

The local native APK attempt stopped because this Windows machine has no configured Android SDK. GitHub Actions subsequently compiled and packaged both the Android APK and unsigned iOS IPA successfully. All CI checks passed. Local verification confirmed both archive contents and checksums, ARM64/iOS bundle identity and the APK signature, actual manifest and supported native architectures. The Android SDK action now requests current packages explicitly, and builds exclude unsupported 32-bit targets. Installation and runtime behavior have not been tested on a phone.

The diagnostic APK uses the template debug key, whose certificate matches the published NomadLM-v1.1.0.apk, and has a higher version code. A normal update should be accepted for that signing identity; actual upgrade installation, history migration and file-picker behavior still need checking on hardware. Production publication requires the project's persistent signing key. No production release/tag was created or old release overwritten. The IPA is unsigned and requires re-signing for iPhone installation.

Phone measurements are still required for startup, generation, memory, thermals, battery, offline traffic, downloads/resume, accessibility, model compatibility and model choice. GrapheneOS requires a separate supported Pixel. The Nothing Phone (3a) Pro / 8 GB cannot establish that platform claim. Follow DEVICE_TESTING.md and the 24 benchmark cases; no speed or memory numbers have been invented.

npm audit still reports 16 high dependency findings stemming from two unpatched upstream build-tool advisories (braces and node-forge). The uuid advisory was removed via a tested xcode dependency override. Dated exceptions in audit-exceptions.json allow only those two advisory URLs; new or expired exceptions fail CI. This is a reviewed residual issue, not a clean security audit.

The corpus selection is finite, lexical retrieval is not semantic search, and numeric-reference filtering cannot prove that a model's claim is supported. The app deliberately labels citation support as unverified and refuses unsupported practical calculation wording. Broad research accuracy and optional model suitability need the phone benchmark rather than stronger claims in the README.
