const fs = require('node:fs');
const questions = require('../benchmarks/questions.json');
const args = process.argv.slice(2);
const option = (flag) => args[args.indexOf(flag) + 1];
if (args.includes('--template')) {
  const file = option('--template');
  if (!file || file.startsWith('--')) throw new Error('Supply a template filename');
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        device: 'Nothing Phone (3a) Pro / 8 GB',
        os: '',
        modelId: '',
        commit: '',
        corpusDigests: {},
        airplaneMode: null,
        runs: questions.map((q) => ({
          questionId: q.id,
          repetition: 1,
          answer: '',
          correct: null,
          citationsSupported: null,
          metrics: null,
          peakPssMb: null,
          notes: '',
        })),
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  console.log(
    'Template created. Run questions on the phone and fill observations; no measurements were invented.',
  );
} else {
  const file = option('--input');
  if (!args.includes('--input') || !file || file.startsWith('--'))
    throw new Error(
      'Usage: npm run benchmark -- --input results.json (or --template results.json)',
    );
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.device || !data.modelId || !Array.isArray(data.runs) || !data.runs.length)
    throw new Error('Missing device, modelId or runs');
  const ids = new Set(questions.map((q) => q.id));
  for (const row of data.runs) {
    if (!ids.has(row.questionId) || typeof row.correct !== 'boolean')
      throw new Error('Every run needs a known question ID and a manual correctness grade');
    if (row.metrics)
      for (const name of ['totalTokens', 'tokensPerSecond', 'durationMs'])
        if (!Number.isFinite(row.metrics[name]) || row.metrics[name] < 0)
          throw new Error('Invalid native metric: ' + name);
  }
  const percentile = (rows, p) =>
    rows.length
      ? rows.sort((a, b) => a - b)[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)]
      : null;
  const collect = (key) => data.runs.map((r) => r.metrics?.[key]).filter((v) => Number.isFinite(v));
  const native = data.runs.filter((r) => r.metrics);
  const measuredPss = data.runs.map((r) => r.peakPssMb).filter((v) => Number.isFinite(v));
  console.log(
    JSON.stringify(
      {
        device: data.device,
        modelId: data.modelId,
        runCount: data.runs.length,
        questionsCovered: new Set(data.runs.map((r) => r.questionId)).size,
        totalQuestions: questions.length,
        correct: data.runs.filter((r) => r.correct).length,
        gradedCitationRuns: data.runs.filter((r) => typeof r.citationsSupported === 'boolean')
          .length,
        supportedCitations: data.runs.filter((r) => r.citationsSupported === true).length,
        nativeGenerationRuns: native.length,
        medianFirstTokenMs: percentile(collect('timeToFirstTokenMs'), 0.5),
        p95FirstTokenMs: percentile(collect('timeToFirstTokenMs'), 0.95),
        medianTokensPerSecond: percentile(collect('tokensPerSecond'), 0.5),
        p95DurationMs: percentile(collect('durationMs'), 0.95),
        peakPssMb: measuredPss.length ? Math.max(...measuredPss) : null,
        airplaneMode: data.airplaneMode === true,
      },
      null,
      2,
    ),
  );
}
