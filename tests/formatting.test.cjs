const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
Module._load = function (name, ...rest) {
  if (name === 'expo-clipboard') return {};
  if (name === 'react-native')
    return { StyleSheet: { create: (x) => x }, Platform: { OS: 'android' } };
  return original.call(this, name, ...rest);
};
const { cleanLatexMath } = require('../src/ui/MarkdownView.tsx');
test('currency survives display formatting', () => {
  assert.equal(cleanLatexMath('Balance = $250'), 'Balance = $250');
});
test('ordinary mathematical text remains unchanged', () => {
  assert.equal(cleanLatexMath('₹1,000 - ₹750 = ₹250'), '₹1,000 - ₹750 = ₹250');
});
