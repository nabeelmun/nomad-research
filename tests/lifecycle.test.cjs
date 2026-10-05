const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RequestGate } = require('../src/inference/RequestGate.ts');
test('cancellation does not permit another request before settlement', () => {
  const gate = new RequestGate(),
    first = gate.begin();
  gate.cancel();
  assert.throws(() => gate.begin(), /running/);
  assert.equal(gate.isCancelled(first), true);
  assert.equal(gate.finish(first), true);
  assert.equal(gate.finish(first), false);
  const second = gate.begin();
  assert.equal(gate.finish(first), false);
  assert.equal(gate.isCurrent(second), true);
});
