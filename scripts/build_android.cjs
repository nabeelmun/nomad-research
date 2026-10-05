const { spawnSync } = require('node:child_process');
const path = require('node:path');
const windows = process.platform === 'win32';
const result = spawnSync(
  windows ? 'gradlew.bat' : './gradlew',
  ['assembleRelease', '--no-daemon'],
  {
    cwd: path.resolve(__dirname, '../android'),
    stdio: 'inherit',
    shell: windows,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status || 0;
