const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { zstdCompressSync } = require('node:zlib');
const { nativeAdapters } = require('./sqlite-adapter.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-corpus-test-'));
fs.mkdirSync(path.join(root, 'data'));
const adapters = nativeAdapters(root);
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === 'expo-file-system') return {};
  if (name === 'react-native') return { Platform: { OS: 'android' } };
  if (name === 'expo-file-system/legacy') return adapters.filesystem;
  if (name === 'expo-sqlite') return adapters.sqlite;
  return original.call(this, name, ...args);
};
const { CORPORA, indexedFilename } = require('../src/assets/manifest.ts');
const { buildIndex, verifyCorpus } = require('../src/assets/CorpusIndexer.ts');
const { KnowledgeStore } = require('../src/rag/KnowledgeStore.ts');
const dataDir = adapters.filesystem.documentDirectory + 'data/';
function rawFixture(spec) {
  const db = new DatabaseSync(path.join(root, 'data', spec.filename));
  db.exec(
    'CREATE TABLE blocks(id INTEGER PRIMARY KEY,zdata BLOB); CREATE TABLE articles(id INTEGER PRIMARY KEY,title TEXT,block_id INTEGER,off INTEGER,len INTEGER); CREATE TABLE redirects(title TEXT,article_id INTEGER);',
  );
  const text = Buffer.from(
    'S\u00e3o Paulo \u{1f30d}\n\n## Eat\nVegan food in S\u00e3o Paulo uses vegetables and beans without dairy or eggs.',
  );
  db.prepare('INSERT INTO blocks VALUES(1,?)').run(zstdCompressSync(text));
  db.prepare('INSERT INTO articles VALUES(1,?,1,0,?)').run('S\u00e3o Paulo', text.length);
  db.prepare('INSERT INTO redirects VALUES(?,1)').run('Sampa');
  db.close();
}
test('on-device indexing and production retrieval use real SQLite FTS and preserve history', async () => {
  const store = new KnowledgeStore();
  try {
    for (const spec of CORPORA) {
      rawFixture(spec);
      await buildIndex(
        spec,
        dataDir,
        () => {},
        () => false,
      );
    }
    const legacy = new DatabaseSync(path.join(root, 'nomad_knowledge.db'));
    legacy.exec(
      'CREATE TABLE chat_history(id TEXT PRIMARY KEY,query TEXT NOT NULL,answer TEXT NOT NULL,citations_json TEXT NOT NULL,metrics TEXT,created_at INTEGER NOT NULL);',
    );
    legacy
      .prepare('INSERT INTO chat_history VALUES(?,?,?,?,?,?)')
      .run('legacy', 'old query', 'old answer', '[]', '', 1);
    legacy.close();
    await Promise.all([store.initialize(), store.initialize()]);
    const hits = await store.search('vegan Sampa');
    assert.ok(hits.length > 0);
    assert.equal(hits[0].title, 'S\u00e3o Paulo');
    assert.ok(hits[0].snippet.includes('Vegan'));
    assert.ok(hits[0].sourceUrl.includes('S%C3%A3o_Paulo'));
    assert.equal((await store.getChatHistory())[0].id, 'legacy');
    await store.saveChat('new', '50% query', 'a', '[]', '', '[]');
    await store.saveChat('new', 'updated 50% query', 'b', '[]', '', '[]');
    assert.equal((await store.getChatHistory()).length, 2);
    assert.equal((await store.getChatHistory(100, '%')).length, 1);
    await store.renameChat('new', 'My trip');
    assert.equal((await store.getChatHistory(100, 'My trip'))[0].title, 'My trip');
    assert.equal((await store.getChatHistory(100, '50%')).length, 1);
    await store.saveChat(
      'new',
      'latest question',
      'answer',
      '[]',
      '',
      JSON.stringify([{ role: 'user', content: 'earlier topic' }]),
    );
    assert.equal((await store.getChatHistory(100, 'earlier topic')).length, 1);
    await store.deleteChat('new');
    assert.equal((await store.getChatHistory()).length, 1);
    const info = await store.corpusInfo();
    assert.equal(info.length, 2);
    assert.equal(info[0].articles, 1);
  } finally {
    await store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
