# NomadLM

Offline Android research with local Wikipedia/Wikivoyage sources and a deterministic practical calculator. This project targets the [POIDH research bounty](https://poidh.xyz/mainnet/bounty/31).

The v1.2.0 source update includes the changes described below. A signed v1.2.0 release and phone benchmarks have not yet been produced. Existing v1.1.0 APKs do not contain these changes.

## What works in this implementation

- In-app model/corpus downloads with pinned sizes and SHA-256 hashes, staging files, pause/resume and explicit repair. Android resumes partial downloads after process death against immutable model URLs; ignored Range responses are safely restarted by Expo's downloader.
- File-picker imports work with scoped storage. Import original files or trusted prebuilt .search.db packs with corpus-manifest.json. Private assets are replaced only after validation; a previous version is retained until the replacement succeeds.
- Search opens the downloaded corpus indexes. It no longer answers from the old 21 hand-written seed articles. Initial raw downloads are converted to bounded, section-aware FTS5 passage databases; prepared packs skip that conversion.
- Fixed arithmetic, percentages, discounts, currencies, balances and unit conversion use decimal.js without model generation. Ambiguous wording asks for an explicit expression. The result card shows exactly what was computed.
- Model-native chat templates, actual token-budget checks, a 4096-token context, short/standard/detailed output limits, guarded cancellation and native completion metrics.
- Dark green UI, safe-area layout, selectable answers, multiline input, virtualized chat, buffered streaming, offline source sheets, tables/code copy, history search/rename and edit/regenerate of the latest question.

A source reference establishes attribution, not independent fact verification. Offline sources may be old or incomplete, and the language model can still misread evidence. Unsupported research returns a clear lack-of-evidence response. No cloud inference or account is required.

## Models

| Model / Q4_K_M | Download | Status |
|---|---:|---|
| Qwen2.5-1.5B-Instruct | 986,048,768 bytes | Default baseline |
| Liquid LFM2.5-1.2B-Instruct | 730,895,168 bytes | Experimental phone candidate; separate Liquid license |
| Qwen3.5-2B | 1,280,835,840 bytes | Experimental phone candidate |

Model selection is in Setup; Settings returns there to change models. Qwen 2.5 is kept as the baseline, not declared the best. See [device testing](docs/DEVICE_TESTING.md) for a fair comparison on the Nothing Phone (3a) Pro / 8 GB. No tokens/second, RAM, battery or GrapheneOS performance claim is made before hardware testing.

## Knowledge and storage

Raw downloads are pinned to the existing v1.1.0 corpus assets: voyage.db (328,810,496 bytes) and wiki_core.db (223,997,952 bytes). The actual selection contains **34,004 travel articles** and **2,570 Wikipedia articles**. Passages are text windows, not unique places. New indexes display their actual article and passage counts in Settings.

The default raw model + corpus download totals 1,538,857,216 bytes (about 1.43 GiB). Private installed storage also includes the derived search indexes, history and any additional models. Setup conservatively requests roughly 5 GB of free space for initial staging/indexing; prepared-pack imports and repairs calculate remaining space separately. Setup time depends on download speed and device indexing performance.

Research uses local data. Network access is limited to explicit setup downloads from GitHub/Hugging Face. Source sheets show stored excerpts without opening a website. City context is entered manually; location and broad storage permissions are removed, and Android app-data backup is disabled.

## Development

Use Node 22.15+, Python 3.11+, Java 17 and an Android SDK. Expo SDK 57 / React Native 0.86.3 / llama.rn 0.12.9 are aligned in the lockfile. Expo Go cannot run the native model.

```sh
npm ci --ignore-scripts
node node_modules/llama.rn/install/download-native-artifacts.js
python -m venv .venv
# Activate .venv using your shell, then:
python -m pip install -r requirements.txt
npm run check
npm run audit:review
npm run build:apk
```

The native-artifact installer verifies downloaded artifact hashes. npm's upstream audit currently reports two reviewed build-tool advisories without published fixes; see [the dated exceptions](docs/audit-exceptions.json). New advisories fail the review check. Do not use npm audit fix --force to downgrade Expo.

## Build searchable packs on a computer

```sh
python scripts/fetch_corpora.py
python scripts/build_corpus.py release/raw/voyage.db --corpus voyage
python scripts/build_corpus.py release/raw/wiki_core.db --corpus wiki
node --require ./tests/register.cjs scripts/validate_packs.cjs
```

Outputs are in release/corpora/: voyage.search.db, wiki_core.search.db and corpus-manifest.json. Copy those plus your selected GGUF to the phone, choose Import files, then Finish setup with imported files. Import the manifest with its packs; the app orders the manifest first. Pack SHA/size/schema/origin metadata are checked. A user-supplied manifest is not a signature; use trusted packs. Existing raw assets remain downloadable for first-run setup.

Older extraction, upload and desktop benchmark scripts are retained as historical utilities. They are not the active app pipeline and their printed counts/prompt templates are not evidence for this version.

## Releases and validation

Checks run typechecking, behavioral tests, Python corpus fixtures, dependency review and Android bundling. The manual Android workflow builds a diagnostic APK for ARM64 phones and x86-64 emulators, matching the available llama native libraries. 32-bit devices are unsupported. Version-tag builds require the project's persistent signing secrets and publish one version/commit-named APK with SHA256SUMS, build.json and signing verification. Existing releases are never overwritten. iOS is an optional unsigned diagnostic workflow, not a tested supported release.

Follow [DEVICE_TESTING.md](docs/DEVICE_TESTING.md) for phone checks, 24 benchmark cases, offline traffic checks and release signing. See [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for implementation status and local verification evidence.

Application source: [MIT](LICENSE). Models and corpus text retain [their own licenses and attribution](THIRD_PARTY_NOTICES.md).
