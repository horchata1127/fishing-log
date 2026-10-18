"""Build an approved release in an isolated HEAD snapshot; never activate the working tree."""
from pathlib import Path
import hashlib
import io
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

source = Path(__file__).resolve().parents[1]
registry = source / 'src/data/stage6FacilityRelease.ts'
original = registry.read_bytes()
if "= { status: 'pending' }" not in original.decode('utf-8'):
    raise SystemExit('This review harness requires a pending working-tree registry')
snapshot = Path(tempfile.mkdtemp(prefix='fishing-stage6-approved-review-')).resolve()
print(f'Isolated snapshot: {snapshot}', flush=True)
archive = subprocess.check_output(['git', 'archive', '--format=zip', 'HEAD'], cwd=source)
with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
    zipped.extractall(snapshot)
# Include the harness when reviewing it before its own first commit.
for name in ['playwright.stage6-review.config.ts', 'tests/stage6-review/approved.spec.ts']:
    destination = snapshot / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / name, destination)
if os.name == 'nt':
    subprocess.run(['cmd', '/c', 'mklink', '/J', str(snapshot / 'node_modules'), str(source / 'node_modules')], check=True, capture_output=True)
else:
    (snapshot / 'node_modules').symlink_to(source / 'node_modules', target_is_directory=True)
candidate_bytes = (snapshot / 'docs/stage6-pr4/facility-master.candidate.json').read_bytes()
audit = json.loads((snapshot / 'docs/stage6-pr4/audit.json').read_text(encoding='utf-8'))
if hashlib.sha256(candidate_bytes).hexdigest() != audit['candidateSha256']:
    raise SystemExit('Candidate hash differs from the reviewed artifact')
isolated_registry = snapshot / 'src/data/stage6FacilityRelease.ts'
isolated_source = isolated_registry.read_text(encoding='utf-8')
pending = "= { status: 'pending' }"
if isolated_source.count(pending) != 1:
    raise SystemExit('Unexpected snapshot registry; refusing activation')
isolated_registry.write_text(isolated_source.replace(pending, "= { status: 'approved', master: " + candidate_bytes.decode('utf-8').strip() + ' }'), encoding='utf-8')
commands = [
    ('build', ['npm.cmd' if os.name == 'nt' else 'npm', 'run', 'build']),
    ('approved', ['node', 'node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.stage6-review.config.ts']),
]
try:
    for label, command in commands:
        log_path = snapshot / f'review-{label}.log'
        with log_path.open('w', encoding='utf-8') as log:
            result = subprocess.run(command, cwd=snapshot, stdout=log, stderr=subprocess.STDOUT)
        print(f'{label}: exit={result.returncode}; log={log_path}', flush=True)
        if result.returncode:
            print('\n'.join(log_path.read_text(encoding='utf-8', errors='replace').splitlines()[-65:]))
            raise SystemExit(result.returncode)
finally:
    if registry.read_bytes() != original:
        raise SystemExit('Working-tree registry changed unexpectedly; inspect without overwriting it')
print('PASS: working tree remains pending; no publish, merge, deployment or production data access', flush=True)
