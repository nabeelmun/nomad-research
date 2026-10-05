const { spawnSync } = require('node:child_process');
const path = require('node:path');
const npmCli =
  process.env.npm_execpath ||
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const result = spawnSync(process.execPath, [npmCli, 'audit', '--json'], { encoding: 'utf8' });
if (result.error) throw result.error;
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw new Error('npm audit did not return a valid report');
}
if (report.error || !report.vulnerabilities)
  throw new Error('npm audit failed: ' + JSON.stringify(report.error));
const known = require('../docs/audit-exceptions.json');
if (Date.now() > Date.parse(known.reviewBy))
  throw new Error('Dependency exceptions need review; reviewBy date has passed.');
const accepted = new Set(known.advisories.map((a) => a.url));
let failures = 0;
for (const [name, v] of Object.entries(report.vulnerabilities))
  for (const advisory of v.via.filter((a) => typeof a === 'object')) {
    const allowed = accepted.has(advisory.url) && advisory.severity !== 'critical';
    console.log(
      (allowed ? 'REVIEWED' : 'NEW') +
        ': ' +
        name +
        ' / ' +
        advisory.severity +
        ' / ' +
        advisory.url,
    );
    if (!allowed) failures++;
  }
if (failures) process.exitCode = 1;
else
  console.log(
    'No unreviewed advisories. Reviewed upstream issues remain; see docs/audit-exceptions.json.',
  );
