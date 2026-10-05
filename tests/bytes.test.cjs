const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fromBase64, decodeUTF8 } = require('../src/assets/bytes.ts');
test('binary decoding retains zero bytes and Unicode code points', () => {
  const text = 'S\u00e3o Paulo \u{1f30d}';
  assert.equal(decodeUTF8(fromBase64(Buffer.from(text).toString('base64'))), text);
  assert.deepEqual([...fromBase64('AP8BAg==')], [0, 255, 1, 2]);
});
test('invalid UTF-8 is rejected, including overlong, surrogate and truncated encodings', () => {
  for (const bytes of [
    [0xc0, 0x80],
    [0xed, 0xa0, 0x80],
    [0xf0, 0x9f],
    [0xf4, 0x90, 0x80, 0x80],
  ])
    assert.throws(() => decodeUTF8(Uint8Array.from(bytes)), /UTF-8/);
});
