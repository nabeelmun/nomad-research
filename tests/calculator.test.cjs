const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateExpression, calculateQuery } = require('../src/math/Calculator.ts');
test('decimal arithmetic is exact', () => {
  assert.equal(evaluateExpression('0.1 + 0.2').result, '0.3');
});
test('arithmetic observes precedence and parentheses', () => {
  assert.equal(evaluateExpression('(12 - 2) * 3 + 4 / 2').result, '32');
});
test('balance preserves currency and all expenses', () => {
  const r = calculateQuery(
    'I have ₹1000 and bought a shirt for ₹450 and pants for ₹300. How much is left?',
  );
  assert.equal(r.result, '250');
  assert.equal(r.currency, '₹');
});
test('negative balances are not clamped to zero', () => {
  assert.equal(calculateQuery('I have $100 and spent $150. How much remains?').result, '-50');
});
test('percentage and discount calculations', () => {
  assert.equal(calculateQuery('What is 15% of 200?').result, '30');
  assert.equal(calculateQuery('20% discount on ₹1500').result, '1200');
});
test('fixed unit conversions include temperature offsets', () => {
  assert.equal(calculateQuery('Convert 2.5 km to m').result, '2500');
  assert.equal(calculateQuery('Convert 32 F to C').result, '0');
});
test('invalid operations cannot run arbitrary code', () => {
  assert.throws(() => evaluateExpression('1 / 0'), /zero/i);
  assert.throws(() => evaluateExpression('process.exit()'), /expression|unsupported/i);
});
test('unrelated research and ambiguous currencies are not calculated', () => {
  assert.equal(calculateQuery('Explain the 1973 oil crisis'), null);
  assert.throws(() => calculateQuery('I have $100 and spent €20. How much remains?'), /currenc/i);
});

test('quantities, dates and percentage expenses cannot silently become prices', () => {
  assert.throws(
    () => calculateQuery('I had 1000 and bought 2 apples for 100. What is left?'),
    /clearer/,
  );
  assert.throws(
    () => calculateQuery('I had 1000 and spent 100 on 2026-09-01. What is left?'),
    /clearer/,
  );
  assert.throws(() => calculateQuery('I had 1000 and spent 10% on food. What is left?'), /clearer/);
});

test('percentage and cashback expenses require an explicit expression', () => {
  assert.throws(
    () => calculateQuery('I had 1000 and spent 10 percent on food. What is left?'),
    /clearer/,
  );
  assert.throws(
    () => calculateQuery('I had 1000 and spent 100 with 20 cashback. What is left?'),
    /clearer/,
  );
});

test('explicit arithmetic preserves currency without mixing units', () => {
  const result = calculateQuery('USD 100 - USD 20');
  assert.ok(result);
  assert.equal(result.result, '80');
  assert.equal(result.currency, 'USD');
  assert.throws(() => calculateQuery('USD 100 - EUR 20'), /Mixed currencies/);
});
