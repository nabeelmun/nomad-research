import base64
import os
from pathlib import Path
required = ['NOMAD_KEYSTORE_BASE64','NOMAD_STORE_PASSWORD','NOMAD_KEY_PASSWORD','NOMAD_KEY_ALIAS']
if not all(os.environ.get(key) for key in required):
    raise SystemExit('Tagged releases require all four NOMAD signing secrets. No debug-signed release will be published.')
target = Path(os.environ['RUNNER_TEMP']) / 'nomad-release.jks'
target.write_bytes(base64.b64decode(os.environ['NOMAD_KEYSTORE_BASE64'], validate=True))
target.chmod(0o600)
