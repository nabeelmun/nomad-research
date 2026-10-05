const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ftsQuery, resolveQuery, rankPassages } = require('../src/rag/retrieval.ts');
test('queries retain Unicode place names and quote operator words', () => {
  assert.match(ftsQuery('Vegan food in São Paulo'), /são/);
  assert.ok(!ftsQuery('"><script>').includes('<'));
});
test('follow-ups retain the previous city and subject', () => {
  assert.match(
    resolveQuery('Which ones are vegan?', [{ role: 'user', content: 'Restaurants in Lisbon' }]),
    /Lisbon/,
  );
  assert.throws(() => resolveQuery('Restaurants near me', []), /city/i);
});
test('vegetarian evidence is not promoted as vegan evidence', () => {
  const passage = {
    id: '1',
    articleId: 1,
    title: 'Lisbon',
    section: 'Eat',
    sourceUrl: 'https://en.wikivoyage.org/wiki/Lisbon',
    sourceDate: '2026',
    corpus: 'voyage',
    score: 0,
  };
  const r = rankPassages(
    [
      { ...passage, snippet: 'A vegetarian cafe with cheese' },
      { ...passage, id: '2', snippet: 'Lisbon has a vegan cafe' },
    ],
    'Vegan restaurants in Lisbon',
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].id, '2');
});

test('vegan city queries exclude generic city entries and other cities', () => {
  const base = {
    id: '1',
    articleId: 1,
    title: 'Lisbon',
    section: 'Eat',
    sourceUrl: 'url',
    sourceDate: '2026',
    corpus: 'voyage',
    score: 0,
  };
  const hits = rankPassages(
    [
      {
        ...base,
        snippet: 'Lisbon has many cafes and vegan food is not mentioned in these entries.',
      },
      {
        ...base,
        id: '2',
        title: 'Porto',
        snippet: 'A vegan cafe. Take a train from Lisbon to Porto.',
      },
      { ...base, id: '3', snippet: 'A vegetarian restaurant serving cheese.' },
      { ...base, id: '4', snippet: 'A fully vegan restaurant in Lisbon.' },
    ],
    'vegan restaurants in Lisbon',
  );
  assert.deepEqual(
    hits.map((h) => h.id),
    ['4'],
  );
});
test('a named encyclopedia article outranks incidental travel mentions', () => {
  const base = {
    id: '1',
    articleId: 1,
    section: 'History',
    sourceUrl: 'url',
    sourceDate: '2026',
    score: 0,
  };
  const hits = rankPassages(
    [
      {
        ...base,
        title: 'Stockholm',
        corpus: 'voyage',
        snippet: 'In 1973 the oil crisis happened.',
      },
      {
        ...base,
        id: '2',
        title: '1973 oil crisis',
        corpus: 'wiki',
        snippet: 'The 1973 oil crisis was caused by an embargo.',
      },
    ],
    '1973 oil crisis',
  );
  assert.equal(hits[0].id, '2');
});
test('saved city replaces relative location wording before filtering', () => {
  assert.equal(resolveQuery('Vegan food near me', [], 'Mumbai'), 'Vegan food in Mumbai');
});
