"""Build/test the actual approved working tree in an isolated copy; no release substitution."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile

source = Path(__file__).resolve().parents[1]
registry = source / 'src/data/stage6FacilityRelease.ts'
original = registry.read_bytes()
if not re.search(r"export const stage6FacilityRelease[^=]*=\s*\{\s*status:\s*'approved'", original.decode('utf-8')):
    raise SystemExit('This harness tests the actual approved release; it does not activate pending sources')
snapshot = Path(tempfile.mkdtemp(prefix='fishing-stage6-approved-review-')).resolve()
print(f'Isolated snapshot: {snapshot}', flush=True)
# Copy only tracked source files and the explicitly named new distribution artifacts.
# Existing untracked notes/backups are never copied or modified.
names = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=source).decode('utf-8').split('\0')) - {''}
names.update(['src/data/facility-master.v1.json', 'src/data/.gitattributes'])
for name in names:
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
if (snapshot / 'src/data/facility-master.v1.json').read_bytes() != candidate_bytes:
    raise SystemExit('Bundled release differs from the approved candidate')
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
print('PASS: actual approved source tested without substitution; working tree unchanged; no publish, merge, deployment or production data access', flush=True)
