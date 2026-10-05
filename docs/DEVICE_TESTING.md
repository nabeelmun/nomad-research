# Phone validation and model comparison

Target phone: Nothing Phone (3a) Pro, 8 GB RAM. No on-device benchmark has been recorded yet. GrapheneOS needs a separate supported Pixel device; the Nothing phone cannot establish that claim.

## Build and install

Use Node 22.15+ (the current Node 22 LTS patch), Python 3.11+, Java 17 and an Android SDK configured with ANDROID_HOME. Expo Go cannot load llama.rn; build the native app.

```sh
npm ci --ignore-scripts
node node_modules/llama.rn/install/download-native-artifacts.js
python -m pip install -r requirements.txt
npm run check
npm run audit:review
npm run build:apk
```

For a review APK without a local toolchain, run the manual **Build Android APK** GitHub workflow. This creates a diagnostic artifact and does not publish a release. It uses the generated debug signing key; installability and upgrades from a previously signed APK need checking. Never uninstall merely to work around a signature mismatch if you need to retain old history.

Tagged releases require NOMAD_KEYSTORE_BASE64, NOMAD_STORE_PASSWORD, NOMAD_KEY_PASSWORD and NOMAD_KEY_ALIAS in GitHub repository secrets. Keep the existing signing key to retain upgrades. A tag must match package.json and app.json; versionCode must increase. Example next tag: v1.2.0. The workflow refuses to overwrite an existing release and publishes one APK plus SHA256SUMS and build.json. No signing key has been created or supplied by this implementation.

## Functional checks

1. Install, choose the default model and download assets. Check progress, pause, relaunch and resume. Interrupt during download, hashing and indexing separately. Completed files/indexes must be reused; unfinished indexing restarts for that corpus.
2. Import via the Android file picker. Test original raw assets, incorrect/truncated files, and prepared packs with corpus-manifest.json. Wrong size/hash/schema must produce a visible error without replacing a good file. Importing a third-party manifest establishes integrity against that manifest, not publisher authenticity; use your own builder output or a trusted release.
3. Research Lisbon, a less common city, and a science topic. Open each source sheet and compare its excerpt with the answer. Vegan queries must not become vegetarian-only recommendations. Check Bombay/Mumbai aliases and city-less "here" questions with/without a saved city.
4. Run arithmetic, currencies, decimals, negative balances, percentages, discounts, length/mass/volume/time/temperature conversion, division by zero, and ambiguous quantities. The interpreted expression must match the question. Unsupported wording must ask for an expression, never ask the LLM to guess a numeric answer.
5. Stop during prefill and streaming. Press Stop repeatedly, immediately attempt Send/History/Settings, and background the app. There must be one answer and one save; controls unlock only after native settlement.
6. Continue a multi-turn conversation, restart, restore from History, search, rename, edit the latest question and regenerate. Editing removes the old answer from the active conversation; the saved version changes when the replacement is saved. Test an old v1.1.0 history database migration.
7. Check keyboard/navigation insets, long input, large font scaling, TalkBack labels, tables, numbered lists, code copying, source buttons and reading earlier messages during streaming. Use Latest to return to the bottom; streaming does not force you away from earlier text.
8. Confirm loading failure, disk-full/download errors and model incompatibility are visible and recoverable. Changing models closes native inference and corpus handles and preserves chat history.

## Offline and resource evidence

After setup, disable Wi-Fi and cellular data and relaunch. Repeat questions and open source sheets. Generation, retrieval, history and the calculator must still work. Do not press Download while checking research traffic. Inspect network traffic with your device's network monitor or a test proxy before disconnection; no inference/chat request should leave the device. The INTERNET permission remains solely for explicit setup downloads. Android backup is disabled for private app data.

Use adb shell dumpsys meminfo xyz.nomad.research before loading, during prefill, during generation and after several turns. Record **TOTAL PSS**, not free system RAM. Capture peak PSS, crashes/OOMs, thermal status, battery percentage and storage before/after. Model mmap, 4 CPU threads and a 4096-token context are defaults to measure, not claims of optimality.

## Fair model comparison

Compare qwen25, lfm25 and qwen35 using the same corpus, context size, answer length and questions in benchmarks/questions.json. The last two are experimental. Qwen3-4B is a later candidate only; it is deliberately not downloadable until a pinned, compatible quantization and an acceptable phone memory/latency result are available.

Run each normal question at least three times. Note cold load separately; keep the phone cool and power conditions consistent. Follow-up and lifecycle cases require the specific preceding interaction. Grade correctness and citation support manually from excerpts; a bracketed reference alone does not establish truth.

Settings > Copy session for benchmark copies answers and metrics to the local clipboard. Each generated answer records modelId/mode. Legacy sessions have unknown model provenance. First-output milliseconds cover prompt formatting/tokenization/prefill up to the first callback; retrieval is a separate metric, and rendering is buffered by 50 ms. Tokens/second and generated-token counts come from native completion timings, not callback counts. Calculator and clarification answers have no invented inference metrics.

```sh
npm run benchmark -- --template results-qwen25.json
# Fill grades, answers and actual measurements from the phone.
npm run benchmark -- --input results-qwen25.json
```

Do not label the fastest model the winner if it fabricates more facts or fails the required memory/compatibility checks. Attach the APK digest, commit, OS build, dataset fingerprints, benchmark results and a screen recording to bounty evidence. This repository update does not assert bounty acceptance.
