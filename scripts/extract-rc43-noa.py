"""Extract only public lure catalog fields; never copy trip/ownership data."""
import csv
import hashlib
import json
import pathlib
import re
import unicodedata

root = pathlib.Path(__file__).resolve().parents[1]
raw = (root / 'docs/rc42/fishing-log-backup-2026-11-21.json').read_bytes()
data = json.loads(raw.decode('utf-8-sig'))['data']
makers = [m for m in data['lureManufacturers'] if m['name'] == 'RODIO CRAFT']
series = [s for s in data['lureSeries'] if s['manufacturerId'] in {m['id'] for m in makers} and s['name'].startswith('NOA')]
models = [m for m in data['lureModels'] if m['seriesId'] in {s['id'] for s in series}]
variants = [v for v in data['lureVariants'] if v['modelId'] in {m['id'] for m in models}]
out = root / 'docs/rc43'
out.mkdir(exist_ok=True)
(out / 'NOA_CATALOG.json').write_text(json.dumps(dict(checkedAt='2026-11-21', backupSha256=hashlib.sha256(raw).hexdigest(),
    manufacturers=makers, series=series, models=models, variants=variants), ensure_ascii=False, indent=2)+'\n', encoding='utf8')
# An explicit name/code dictionary, not a rule equating every similar spelling.
colors = []
for v in variants:
    if v['modelId'] != 133:
        continue
    name = unicodedata.normalize('NFKC', v['colorName'])
    match = re.match(r'^#(\d+)\s+(.+)$', name)
    code = match[1] if match else ''
    if match:
        name = match[2]
    elif re.match(r'^US-\d+\s', name):
        code = name.split(' ', 1)[0]
    colors.append(dict(name=name, code=code))
(root / 'src/data/noaSharedColors.ts').write_text('// RC43: exact catalog name/code pairs. No photo assets or retailer images.\n'
    + 'export const noaColorDefinitions = ' + json.dumps(colors, ensure_ascii=False, indent=2) + ' as const\n', encoding='utf8')
print([(m['name'], sum(v['modelId'] == m['id'] for v in variants)) for m in models])
print('variants', len(variants), 'definitions', len(colors))
