const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fitPrompt } = require('../src/inference/PromptBudget.ts');
test('budget trims old exchanges then sources, retaining the current question once', async () => {
  const count = async (messages) => messages.reduce((sum, m) => sum + m.content.length, 0);
  const result = await fitPrompt(
    'rules',
    'new question',
    [
      { role: 'user', content: 'x'.repeat(60) },
      { role: 'assistant', content: 'y'.repeat(60) },
    ],
    ['s'.repeat(50), 't'.repeat(50)],
    count,
    260,
    40,
  );
  assert.equal(result.messages.filter((m) => m.content.includes('new question')).length, 1);
  assert.ok(result.tokens + 40 + 64 <= 260);
  assert.equal(result.messages.filter((m) => m.role === 'assistant').length, 0);
  assert.ok(result.sources.length > 0);
});
test('oversize questions fail explicitly rather than overflowing context', async () => {
  await assert.rejects(
    fitPrompt(
      'rules',
      'x'.repeat(300),
      [],
      [],
      async (m) => m.reduce((n, x) => n + x.content.length, 0),
      200,
      40,
    ),
    /shorten/,
  );
});
