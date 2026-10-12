"""Build RC22 from reviewed item evidence and official gallery captions, never a DB.

Existing RC20/RC21 and user handoff files are never opened for writing.
Run from the repository root: python scripts/prepare-rc22-catalog.py
"""
import csv
import hashlib
import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/rc22'
retail = json.loads((OUT / 'RC22_RETAILER_EVIDENCE.json').read_text(encoding='utf-8'))['rows']
base = 'https://rob-lure.com/work/'
urls = [base + 'berbie-バービー/', base + 'バービーロング/', base + 'berbie_mama-バービー・ママ/']
official = []
for url in urls:
    encoded = urllib.parse.quote(url, safe=':/%')
    raw = urllib.request.urlopen(encoded, timeout=25).read()
    markup = raw.decode('utf-8')
    galleries = []
    for block in re.findall(r'<dl\b[^>]*class=[\'"]gallery-item[\'"][^>]*>(.*?)</dl>', markup, re.S):
        caption = re.search(r'<dd\b[^>]*class=[\'"][^\'"]*gallery-caption[^\'"]*[\'"][^>]*>(.*?)</dd>', block, re.S)
        if not caption:
            continue
        name = unescape(re.sub(r'<[^>]+>', '', caption[1])).strip()
        image = re.search(r'<a\b[^>]*href=[\'"]([^\'"]+)', block)
        galleries.append(dict(name=name, imageUrl=unescape(image[1]) if image else ''))
    official.append(dict(url=encoded, sha256=hashlib.sha256(raw).hexdigest(),
                         fetchedAt=datetime.now(timezone.utc).isoformat(), colors=galleries))
assert [len(p['colors']) for p in official] == [0, 10, 25]

def key(name):
    return unicodedata.normalize('NFKC', name).strip().lower()

models = [
    ('バービー', 'F', 1.4, 'バービー F', 0, 8),
    ('バービー', 'SS', 1.6, 'バービー SS', 0, 8),
    ('バービー', 'SSS', 1.5, 'バービー SSS', 0, 10),
    ('バービー・ロング', 'F', 1.6, 'バービー ロング', 1, 10),
    ('バービー・ロング', 'SS', 1.8, 'バービー ロングSS', 1, None),
    ('バービー・ママ', 'F', 2.6, 'ママバービー F', 2, 12),
    ('バービー・ママ', 'SS', 2.8, 'ママバービー SS', 2, 13),
    ('バービー・ガール', 'F', 0.7, 'バービー ガール F', None, None),
    ('バービー・ガール', 'SS', 0.9, 'バービー ガール SS', None, None),
]
targets = []
for series, action, weight, retailer_model, page, count in models:
    model = f'{series} {action}'
    source = official[page]['url'] if page is not None else ''
    hold = '公式SSS 1.5gと販売店1.6gの表記差が未解決。別モデルとして登録しない。' if action == 'SSS' else ''
    colors = []
    gallery = official[page]['colors'] if page in (1, 2) else []
    if page == 1 and action != 'F': gallery = []
    if page == 2: gallery = gallery[:12] if action == 'F' else gallery[12:]
    for c in gallery:
        colors.append(dict(code='', name=c['name'], label=c['name'], aliases=[], sourceUrl=source,
                           manufacturerUrl=source, retailerUrl='', imageUrl=c['imageUrl'], jan='',
                           colorClass='standard', sourceTier='manufacturer', verified=True, notes='公式 dd.gallery-caption 原文'))
    rows = [r for r in retail if r['model'] == retailer_model]
    # Name/code/JAN always come from the SAME retailer item block. No item count inference.
    for r in rows:
        detail = r['detail']
        assert float(re.search(r'(\d+(?:\.\d+)?)g', detail)[1]) == (1.6 if action == 'SSS' else weight)
        expected_type = {'F': 'フローティング', 'SS': 'スローシンキング', 'SSS': 'スーパースローシンキング'}[action]
        assert expected_type in detail
        raw_name = detail.split('/ #', 1)[1]
        match = re.match(r'^(\d+)\s+(.+)$', raw_name)
        code, name = (match[1], match[2]) if match else ('', raw_name)
        existing = next((c for c in colors if key(c['name']) == key(name)), None)
        if existing:
            existing.update(retailerUrl=r['url'], jan=r['jan'], code=code)
            if code: existing['aliases'].append(f'{code} {name}')
            continue
        # Similar retailer spellings on official palettes stay held, rather than double-add.
        uncertain = (page == 1 and action == 'F' and name == 'がーこちゃん') or (page == 2 and action == 'SS' and name == '担々麺')
        colors.append(dict(code=code, name=name, label=f'{code} {name}' if code else name,
                           aliases=[name], sourceUrl=r['url'], manufacturerUrl=source, retailerUrl=r['url'],
                           imageUrl='', jan=r['jan'], colorClass=r['colorClass'], sourceTier='retailer', verified=not uncertain,
                           notes='公式との表記差。同一色の可能性があるため保留。' if uncertain else '販売店の商品別モデル・タイプ・重量・実名・JANを照合。通常色／限定の明記がない場合はunknown。'))
    targets.append(dict(manufacturer='ロブルアー', series=series, model=model, weight=weight,
                        actionType=action, officialColorCount=count, manufacturerAliases=['rob lure', 'ロブ・ルアー'],
                        seriesAliases=[series.replace('・', ' ')] + (['ママバービー'] if page == 2 else []),
                        modelAliases=[retailer_model], productVerified=not hold, expectedManufacturerId=71,
                        category='クランク', sourceUrl=source or rows[0]['url'],
                        productSourceTier='retailer' if (page is None or (page == 1 and action == 'SS')) else 'manufacturer',
                        holdReason=hold, colors=colors))

pack = dict(version='RC22', checkedOn='2026-10-12', officialListedCount=61,
            officialNamedCount=35, targets=targets)
(OUT / 'RC22_CATALOG.json').write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(ROOT / 'src/data/rc22Catalog.ts').write_text('// Generated by scripts/prepare-rc22-catalog.py; offline, independent of RC20/21.\nexport const rc22Catalog = ' + json.dumps(targets, ensure_ascii=False, indent=2) + ' as const\n', encoding='utf-8')
(OUT / 'RC22_SOURCE_AUDIT.json').write_text(json.dumps(dict(official=official, retailerEvidence='RC22_RETAILER_EVIDENCE.json',
    limitations=['通常F/SS/SSSの公式画像から色名を推測しない。', '1091の検索キャッシュのみの掲載は現行の商品別照合ができず、パックに追加しない。', '商品写真は保存・転載せず公式画像URLだけを記録。']), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
fields = ['manufacturer','series','model','action_type','weight_g','color_code','color_name_original','color_name_normalized','color_class','jan','manufacturer_url','retailer_url','image_url','source_tier','verification_status','notes']
with (OUT / 'RC22_BARBiE_COLOR_AUDIT.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fields); writer.writeheader()
    for t in targets:
        for c in t['colors']:
            writer.writerow(dict(manufacturer=t['manufacturer'],series=t['series'],model=t['model'],action_type=t['actionType'],weight_g=t['weight'],color_code=c['code'],color_name_original=c['name'],color_name_normalized=key(c['name']),color_class=c['colorClass'],jan=c['jan'],manufacturer_url=c['manufacturerUrl'],retailer_url=c['retailerUrl'],image_url=c['imageUrl'],source_tier=c['sourceTier'],verification_status='confirmed' if c['verified'] and t['productVerified'] else 'hold',notes=t['holdReason'] or c['notes']))
for t in targets:
    print(t['model'].encode('unicode_escape').decode(), 'named',len(t['colors']), 'ready',sum(c['verified'] and t['productVerified'] for c in t['colors']), 'held',sum(not c['verified'] or not t['productVerified'] for c in t['colors']))
