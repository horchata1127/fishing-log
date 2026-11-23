"""Prepare exact model/color candidates for visual review; never approve automatically."""
import hashlib
import json
import pathlib
import re
import tempfile
import time
import unicodedata
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'docs/noa-color-photos'
source = json.loads((out / 'SOURCE_PAGES.json').read_text(encoding='utf8'))
catalog = json.loads((out / 'CATALOG.json').read_text(encoding='utf8'))
baseline = json.loads((root / 'docs/rc43/NOA_COLOR_AUDIT.json').read_text(encoding='utf8'))
cache = pathlib.Path(tempfile.gettempdir()) / 'fishing-log-noa-research'
fold = lambda s: re.sub(r'\s', '', unicodedata.normalize('NFKC', s)).lower()
# Explicit source spellings, never a general Roman numeral/number-only merge.
aliases = {'72 K.F VI': 'K.F.VI', '79 K.F IV': 'K.F.IV',
           'US-8 イエロー/OR 裏OR': 'US-8 イエロー/オレンジ 裏オレンジ',
           'US-11 グローOLBD/DKOL': 'US-11 表グローオリーブ ブルードット 裏ダークオリーブ',
           '2024 井野カラー': '2024井野カラー', '2024 福田カラー': '2024福田カラー'}
aliases = {fold(k): v for k, v in aliases.items()}
rows = []
for item in source['candidates']:
    title = item['title']
    model = next((m for m in catalog['models'] if fold(m['name']).replace('.', '') in
                  fold(title.split('#')[0]).replace('.', '').replace('noa-s', 'noas')), None)
    if not model:
        continue
    label = title.split('#')[-1].split('【')[0].strip()
    label = unicodedata.normalize('NFKC', label)
    name = aliases.get(fold(label), re.sub(r'^\d+\s+', '', label))
    group = next((g for g in baseline['groups'] if fold(g['colorName']) == fold(name) and
                  any(v['modelId'] == model['id'] for v in g['variants'])), None)
    if group and group.get('externalProductUrl'):
        continue
    if not group and name != 'エルドラド':
        continue
    if not item.get('imageUrl'):
        continue
    pid = re.search(r'pid=(\d+)', item['url'])[1]
    path = cache / (pid + '.jpg')
    try:
        if not path.exists():
            time.sleep(1)
            path.write_bytes(urllib.request.urlopen(item['imageUrl'], timeout=20).read())
        rows.append(dict(**item, modelName=model['name'], colorName=group['colorName'] if group else name,
                         catalogModelId=model['id'], imageSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                         inspectionFile=path.name, approved=False))
    except Exception as error:
        print(pid, str(error), flush=True)
(out / 'REVIEW_CANDIDATES.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print([(re.search(r'pid=(\d+)', r['url'])[1], r['modelName'], r['colorName']) for r in rows])
