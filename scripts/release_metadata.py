import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
app = json.loads((root / 'app.json').read_text())['expo']
if app['version'] != version: raise SystemExit('Package / app version mismatch')
ref = os.environ.get('GITHUB_REF_NAME','')
if os.environ.get('GITHUB_REF','').startswith('refs/tags/') and ref != 'v' + version:
    raise SystemExit('Tag must match app version v' + version)
commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
source = root / 'android/app/build/outputs/apk/release/app-release.apk'
output = root / 'release/apk'; output.mkdir(parents=True,exist_ok=True)
filename = 'NomadLM-v' + version + '-' + commit[:7] + '.apk'
target = output / filename; shutil.copyfile(source,target)
digest = hashlib.sha256()
with target.open('rb') as file:
    for chunk in iter(lambda: file.read(1024*1024),b''): digest.update(chunk)
sha = digest.hexdigest()
(output / 'SHA256SUMS').write_text(sha + '  ' + filename + '\n')
(output / 'build.json').write_text(json.dumps({'version':version,'versionCode':app['android']['versionCode'],'commit':commit,'filename':filename,'bytes':target.stat().st_size,'sha256':sha,'signedRelease':os.environ.get('GITHUB_REF','').startswith('refs/tags/v')},indent=2)+'\n')
notes = 'Built from commit ' + commit + '. Verify SHA256SUMS before installing. Model and corpus downloads are separate from the APK.\n\nPhone performance, GrapheneOS compatibility and bounty completion are not asserted by this build.\n'
(output / 'release-notes.md').write_text(notes)
verification = root / 'signing-verification.txt'
if verification.exists(): shutil.copyfile(verification, output / verification.name)
