const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const { nativeAdapters } = require('./sqlite-adapter.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-assets-test-'));
const adapters = nativeAdapters(root);
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === 'expo-file-system/legacy') return adapters.filesystem;
  if (name === 'expo-file-system') return {};
  if (name === 'react-native') return { Platform: { OS: 'android' } };
  if (name === 'expo-sqlite') return adapters.sqlite;
  return original.call(this, name, ...args);
};
const { AssetManager } = require('../src/assets/AssetManager.ts');
const { MODELS, CORPORA } = require('../src/assets/manifest.ts');
const { CORPUS_SCHEMA } = require('../src/rag/schema.ts');
const uri = (file) => pathToFileURL(file).href;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
test('asset imports validate bytes/hash/schema before replacing files and serialize work', async () => {
  const manager = new AssetManager();
  try {
    const input = path.join(root, 'incoming.gguf');
    fs.writeFileSync(input, Buffer.from('GGUF' + 'valid test payload'.repeat(10)));
    const model = {
      id: 'fixture-model',
      kind: 'model',
      filename: 'fixture.gguf',
      label: 'Fixture',
      url: 'unused',
      bytes: fs.statSync(input).size,
      sha256: hash(input),
      license: 'MIT',
    };
    MODELS.push(model);
    const first = manager.importFile(uri(input), model.filename, () => {});
    await assert.rejects(
      manager.importFile(uri(input), model.filename, () => {}),
      /Wait/,
    );
    await first;
    await manager.validate(model);
    const canonical = path.join(root, 'models', model.filename);
    const legacyPath = path.join(root, model.filename);
    fs.renameSync(canonical, legacyPath);
    await manager.ensureDirs();
    assert.ok(fs.existsSync(canonical));
    assert.equal(fs.existsSync(legacyPath), false);

    const installed = fs.readFileSync(path.join(root, 'models', model.filename));
    fs.writeFileSync(input, Buffer.alloc(model.bytes));
    await assert.rejects(
      manager.importFile(uri(input), model.filename, () => {}),
      /invalid file/,
    );
    assert.deepEqual(fs.readFileSync(path.join(root, 'models', model.filename)), installed);
    await assert.rejects(
      manager.importFile(uri(input), '../../escape.gguf', () => {}),
      /Unrecognized/,
    );
    const packFile = path.join(root, 'incoming.db');
    const db = new DatabaseSync(packFile);
    db.exec(CORPUS_SCHEMA);
    db.prepare('INSERT INTO passages VALUES(1,1,?,?,?,?)').run(
      'Lisbon',
      'Eat',
      'A fully vegan restaurant described in a meaningful offline source passage.',
      'https://en.wikivoyage.org/wiki/Lisbon',
    );
    db.exec("INSERT INTO passages_fts(passages_fts) VALUES('rebuild')");
    const meta = db.prepare('INSERT INTO meta VALUES(?,?)');
    for (const [k, v] of Object.entries({
      complete: '1',
      source_sha256: CORPORA[0].sha256,
      corpus: 'voyage',
      source_date: '2026-09',
      license: 'CC BY-SA',
      articles_count: '1',
      passages_count: '1',
    }))
      meta.run(k, v);
    db.close();
    const pack = {
      id: 'voyage',
      filename: 'voyage.search.db',
      schemaVersion: 2,
      sourceSha256: CORPORA[0].sha256,
      bytes: fs.statSync(packFile).size,
      sha256: hash(packFile),
    };
    const manifest = path.join(root, 'incoming-manifest.json');
    fs.writeFileSync(manifest, JSON.stringify({ packs: [pack] }));
    await manager.importFile(uri(manifest), 'corpus-manifest.json', () => {});
    await manager.importFile(uri(packFile), pack.filename, () => {});
    await manager.checkIndex(CORPORA[0]);
    const before = fs.readFileSync(path.join(root, 'data', pack.filename));
    const corrupt = fs.readFileSync(packFile);
    corrupt[corrupt.length - 1] ^= 1;
    fs.writeFileSync(packFile, corrupt);
    await assert.rejects(
      manager.importFile(uri(packFile), pack.filename, () => {}),
      /checksum/,
    );
    assert.deepEqual(fs.readFileSync(path.join(root, 'data', pack.filename)), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
