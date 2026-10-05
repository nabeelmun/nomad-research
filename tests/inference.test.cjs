const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
let completions = 0;
const native = {
  getFormattedChat: async (messages, template, options) => {
    assert.equal(template, null);
    assert.equal(options.jinja, true);
    assert.equal(options.enable_thinking, false);
    return { prompt: 'MODEL_TEMPLATE\n' + JSON.stringify(messages) };
  },
  tokenize: async (text) => ({ tokens: Array(Math.ceil(text.length / 4)).fill(1) }),
  completion: async (options, chunk) => {
    completions++;
    assert.ok(options.messages);
    assert.equal(options.prompt, undefined);
    assert.equal(options.enable_thinking, false);
    chunk({ token: 'Hello ' });
    chunk({ token: 'there [1] [99]' });
    return {
      content: 'Hello there [1] [99]',
      tokens_predicted: 8,
      tokens_evaluated: 50,
      timings: { predicted_per_second: 15.5 },
      truncated: false,
      context_full: false,
      stopped_limit: 0,
    };
  },
  release: async () => {},
  stopCompletion: async () => {},
};
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === 'llama.rn')
    return {
      initLlama: async (config) => {
        assert.equal(config.n_ctx, 4096);
        return native;
      },
    };
  if (name === '../assets/AssetManager')
    return {
      assetManager: {
        settings: async () => ({ modelId: 'qwen25', city: '' }),
        validate: async () => {},
        path: () => '/private/model.gguf',
      },
    };
  if (name === './KnowledgeStore')
    return {
      knowledgeStore: {
        search: async () => [
          {
            title: 'Source',
            snippet: 'Relevant topic facts',
            sourceUrl: 'https://example.org',
            sourceDate: '2025',
            corpus: 'wiki',
            section: 'Topic',
          },
        ],
      },
    };
  return original.call(this, name, ...args);
};
const { LlamaEngine } = require('../src/inference/LlamaEngine.ts');
const { researchSynthesizer, filterCitations } = require('../src/rag/ResearchSynthesizer.ts');
test('generation uses native templates and native token counts, not callback counts', async () => {
  const engine = new LlamaEngine();
  await Promise.all([engine.autoInitialize(), engine.autoInitialize()]);
  const chunks = [];
  const result = await engine.generate(
    'rules',
    'question',
    [],
    ['[1] source'],
    (text) => chunks.push(text),
    192,
    new AbortController().signal,
  );
  assert.equal(chunks.length, 2);
  assert.equal(result.metrics.totalTokens, 8);
  assert.equal(result.metrics.tokensPerSecond, 15.5);
  await engine.release();
});
test('aborted requests do not start native generation', async () => {
  const engine = new LlamaEngine();
  await engine.autoInitialize();
  const controller = new AbortController();
  controller.abort();
  const count = completions;
  await assert.rejects(
    engine.generate('rules', 'question', [], [], () => {}, 192, controller.signal),
    /stopped/,
  );
  assert.equal(completions, count);
  await engine.release();
});
test('deterministic math and ambiguous math never enter model generation', async () => {
  const count = completions;
  const result = await researchSynthesizer.executeResearch(
    '0.1 + 0.2',
    [],
    () => {},
    () => {},
    'balanced',
    new AbortController().signal,
  );
  assert.equal(result.calculation.result, '0.3');
  assert.equal(result.grounding, 'calculation');
  const unclear = await researchSynthesizer.executeResearch(
    'I spent 20 on food. What is left?',
    [],
    () => {},
    () => {},
    'balanced',
    new AbortController().signal,
  );
  assert.equal(unclear.grounding, 'unsupported');
  assert.equal(completions, count);
});
test('citation IDs outside supplied excerpts are removed without claiming verification', () => {
  const result = filterCitations('Claim [1], fabricated [99]', [{ id: 1, title: 'Source' }]);
  assert.equal(result.answer, 'Claim [1], fabricated ');
  assert.equal(result.citations.length, 1);
});
