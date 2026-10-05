// Runs the production retrieval code against real packs through a SQLite adapter.
// This checks data integration; it is not a native phone performance benchmark.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const Module = require('node:module');
const { nativeAdapters } = require('../tests/sqlite-adapter.cjs');
const directory = path.resolve(process.argv[2] || 'release/corpora');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-pack-check-'));
const adapters = nativeAdapters(root);
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === '../assets/AssetManager')
    return { assetManager: { dataDir: pathToFileURL(directory + path.sep).href } };
  if (name === 'expo-file-system/legacy') return adapters.filesystem;
  if (name === 'expo-sqlite') return adapters.sqlite;
  return original.call(this, name, ...args);
};
const { KnowledgeStore } = require('../src/rag/KnowledgeStore.ts');
(async () => {
  const store = new KnowledgeStore();
  try {
    await store.initialize();
    console.log(JSON.stringify({ corpora: await store.corpusInfo() }));
    for (const query of [
      'vegan restaurants in Lisbon',
      'attention transformer',
      'What caused the 1973 oil crisis?',
      'STARK SNARK',
      'visit Bombay',
    ]) {
      const hits = await store.search(query);
      console.log(
        JSON.stringify({
          query,
          hits: hits.map((p) => ({
            title: p.title,
            section: p.section,
            excerpt: p.snippet.slice(0, 180),
            corpus: p.corpus,
          })),
        }),
      );
      if (
        query.includes('vegan') &&
        hits.some((p) => !p.title.includes('Lisbon') || !/\bvegan\b/i.test(p.snippet))
      )
        throw new Error('Diet / city constraints were lost');
      if (query.includes('1973') && hits[0]?.title !== '1973 oil crisis')
        throw new Error('Named article did not rank first');
      if (!hits.length) throw new Error('No hits for integration query: ' + query);
    }
  } finally {
    await store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
