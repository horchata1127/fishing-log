"""Read public product captions; never generate a weight/color Cartesian product.

Run manually with Python requests + beautifulsoup4. Download cache is gitignored.
"""
import json
import re
import unicodedata
from pathlib import Path
import requests
from bs4 import BeautifulSoup

CACHE = Path('node_modules/.cache/rc28')
CACHE.mkdir(parents=True, exist_ok=True)
OUT = Path('docs/rc28')
OUT.mkdir(parents=True, exist_ok=True)

def page(url, key):
    path = CACHE / (key + '.html')
    if not path.exists():
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        try:
            html = response.content.decode('utf-8')
        except UnicodeDecodeError:
            html = response.content.decode(response.apparent_encoding)
        path.write_text(html, encoding='utf-8')
    return BeautifulSoup(path.read_text(encoding='utf-8'), 'html.parser')

def valid_jan(value):
    return len(value) == 13 and sum(int(n) * (1 if i % 2 == 0 else 3) for i, n in enumerate(value[:12])) % 10 == (10-int(value[-1])) % 10

def dump(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

targets, audit, pending = [], [], []
for slug, series, aliases in [
    ('tearo', 'Tearo', ['ティアロ']), ('chibitearo', 'Chibi Tearo', ['ちびティアロ']),
    ('apeed', 'Apeed!', ['アピード！', 'Apeed！']), ('rekuze', 'REKUZE', ['リクーゼ', 'Rekuze']),
    ('cibi-quattro-spoon', 'Chibi Quattro Spoon', ['ちびクワトロ', 'ちびクワトロスプーン']),
    ('rhomy', 'Rhomy', ['ロミー']),
]:
    url = 'https://www.jackall.co.jp/timon/products/lure/spoon/' + slug + '/'
    soup = page(url, slug)
    specs = [tr.get_text(' ', strip=True) for tr in soup.select('tr')]
    print(slug, 'SPEC', specs)
    # Lengths must come from this product's spec, not an inferred weight ratio.
    lengths = {}
    for tr in soup.select('tr'):
        cells = [c.get_text(' ', strip=True) for c in tr.select('td')]
        joined = ' '.join(cells)
        mm = re.search(r'(\d+(?:\.\d+)?)\s*mm', joined)
        if mm:
            for w in re.findall(r'(\d+(?:\.\d+)?)\s*g', joined):
                lengths[float(w)] = float(mm[1])
            # Rhomy's first grouped weight has no g before slash.
            for w in re.findall(r'(\d+(?:\.\d+)?)(?=/)', joined):
                lengths[float(w)] = float(mm[1])
    colors = {}
    seen = set()
    for cap in soup.select('.caption'):
        title = cap.select_one('.title')
        if not title:
            continue
        name, raw = title.get_text(' ', strip=True), cap.get_text(' ', strip=True)
        if (name, raw) in seen:
            continue
        seen.add((name, raw))
        pairs = re.findall(r'(\d+(?:\.\d+)?)\s*g\s*JAN\s*[:：]\s*(\d+)', unicodedata.normalize('NFKC', raw))
        audit.append(dict(series=series, name=name, caption=raw, url=url, pairs=pairs))
        if not pairs:
            pending.append(dict(series=series, name=name, reason='公式カラー説明に重量別の販売情報がありません', url=url, caption=raw))
        for weight, jan in pairs:
            w = float(weight)
            numbered = re.match(r'^(\d+)\s+(.+)$', name)
            color = dict(code=numbered[1] if numbered else '', name=numbered[2] if numbered else name, label=name, aliases=[], jan=jan if valid_jan(jan) else '',
                         sourceUrl=url, sourceTier='manufacturer', colorClass='standard', evidence=raw)
            if not valid_jan(jan):
                pending.append(dict(series=series, name=name, weight=w, jan=jan, reason='公式JANの桁数・チェック桁が不正です。重量と色は確認済みのため、JANを空欄で登録します', url=url))
            colors.setdefault(w, {})[name] = color
    for weight, palette in sorted(colors.items()):
        targets.append(dict(manufacturer='TIMON', manufacturerAliases=[], series=series, seriesAliases=aliases,
            model=f'{series} {weight:g}g', modelAliases=[f'{n} {weight:g}g' for n in aliases],
            weight=weight, length=lengths.get(weight), category='スプーン', sourceUrl=url,
            specEvidence=specs, colors=list(palette.values())))

dump(OUT / 'TIMON_CAPTIONS.json', audit)
dump(CACHE / 'timon-targets.json', targets)

# Model-specific retailer product cards. Each card explicitly carries weight,
# color and JAN; sold-out variants remain product evidence.
from urllib.parse import urljoin, quote
retail = []
for keyword in ['RCワウ', 'ちびクワトロ']:
    base = 'https://www.fishing-otsuka.co.jp/troutshopjp/ja/index.php?m=keyword&keyword=' + quote(keyword)
    first = page(base, 'retail-' + keyword + '-1')
    pages = [int(a.get_text(strip=True)) for a in first.select('a') if a.get_text(strip=True).isdigit() and '&p=' in a.get('href','')]
    print(keyword, 'pages', pages)
    for num in range(1, max(pages, default=1) + 1):
        url = base + '&p=' + str(num)
        soup = first if num == 1 else page(url, 'retail-' + keyword + '-' + str(num))
        for card in soup.select('.product-copy'):
            title, spec = card.select_one('.product-name'), card.select_one('.product-spec')
            if not title or not spec:
                continue
            model, detail = title.get_text(' ', strip=True), unicodedata.normalize('NFKC', spec.get_text(' ', strip=True))
            jan_match = re.search(r'JAN\s*:\s*(\d{13})', card.get_text(' ', strip=True))
            match = re.search(r'(\d+(?:\.\d+)?)mm\s+(\d+(?:\.\d+)?)g\s+(.+?)\s*/\s*#(.+)', detail)
            if not match or not jan_match:
                # Spoon cards may omit length but have explicit weight.
                match = re.search(r'(\d+(?:\.\d+)?)g\s*/\s*#(.+)', detail)
                if not match or not jan_match:
                    continue
                length, weight, action, caption = 22, float(match[1]), '', match[2]
            else:
                length, weight, action, caption = float(match[1]), float(match[2]), match[3], match[4]
            jan = jan_match[1]
            if not valid_jan(jan):
                continue
            badges = card.select_one('.item-badges')
            classification = badges.get_text(' ', strip=True) if badges else ''
            retail.append(dict(model=model, weight=weight, length=length, action=action, caption=caption,
                jan=jan, classification=classification, url=urljoin(url, title['href']), listingUrl=url, detail=detail))
dump(OUT / 'RETAILER_EVIDENCE.json', retail)

def target_wah(model, weight):
    return dict(manufacturer='Lucky Craft', manufacturerAliases=['ラッキークラフト'], series='Wah', seriesAliases=['ワウ'],
        model=model, modelAliases=['RCワウ37HF', 'RC WAH37HF'] if weight == 2 else ['RCワウ37 FⅡ', 'RC WAH37FII', 'WAH 37F2', 'ワウ37FⅡ'],
        weight=weight, length=37, category='クランク', actionType='F', reuseWithoutWeight=weight == 2,
        buoyancy='ハイフロート' if weight == 2 else 'スローフローティング', rattle='ガラスラトル×2',
        sourceUrl='https://www.fish-hook.net/products/lucky-craft-wah-37f' if weight == 2 else 'https://t-route.net/products/予約商品-2025年12月下旬頃お届け予定-rc-wah37fⅱ-ワウ37fii', colors=[])

wahs = [target_wah('WAH 37HF', 2), target_wah('WAH 37FⅡ', 2.5)]
shopify_audit = []

def shopify(url, cache_key, target, classification):
    path = CACHE / (cache_key + '.json')
    if not path.exists():
        r = requests.get(url + '.js', timeout=60)
        r.raise_for_status()
        dump(path, r.json())
    product = json.loads(path.read_text(encoding='utf-8'))
    shopify_audit.append(dict(url=url, model=target['model'], title=product['title'],
        specification=dict(lengthMm=target['length'], weightG=target['weight'], buoyancy=target['buoyancy'], rattle=target['rattle']) if product.get('description') else None,
        variants=[dict(title=v['title'], jan=v.get('barcode','')) for v in product['variants']]))
    for v in product['variants']:
        raw = v['title']
        m = re.match(r'^(?:No\.|#)\s*(\d+)\s+(.+)$', raw, re.I)
        code, name = (m[1].lstrip('0') or '0', m[2]) if m else ('', raw)
        jan = v.get('barcode') or ''
        target['colors'].append(dict(code=code, name=name, label=f'{code} {name}' if code else name, aliases=[],
            jan=jan if valid_jan(jan) else '', sourceUrl=url, sourceTier='retailer', colorClass=classification, evidence=raw))

shopify('https://www.fish-hook.net/products/lucky-craft-wah-37f', 'fishhook-hf', wahs[0], 'RC')
shopify('https://t-route.net/products/rc-wah37hf-rcワウ37hf', 'troute-hf', wahs[0], 'RC')
shopify('https://t-route.net/products/予約商品-2025年12月下旬頃お届け予定-rc-wah37fⅱ-ワウ37fii', 'troute-fii', wahs[1], 'RC')
shopify('https://t-route.net/products/rc-wah37hf-2025-1091-color-rcワウ37hf-2025-1091カラー', 'troute-1091', wahs[0], '1091')
shopify('https://t-route.net/products/rc-wah37hf-uchoten-color-rcワウ37hf-有頂天カラー', 'troute-uchoten', wahs[0], 'uchoten')

# This retailer explicitly presents the HF/F2 x three-color availability matrix.
uchoten_url = 'https://www.kitiya.jp/?pid=188884454'
uchoten = page(uchoten_url, 'kitiya-uchoten')
for name in ['オラオラオレンジ', 'スケスケピンク', 'ドンチャックドン']:
    matching = [tr.get_text(' ',strip=True) for tr in uchoten.select('tr') if name in tr.get_text()]
    if not matching or not all('1,760' in x for x in matching):
        raise ValueError('Uchoten matrix changed; inspect source')
    wahs[1]['colors'].append(dict(code='', name=name, label=name, aliases=[], jan='', sourceUrl=uchoten_url,
        sourceTier='retailer', colorClass='uchoten', evidence='HF / F2 matrix: ' + matching[0]))

# Merge aliases/JAN by product and normalized *name*, never by number alone.
def color_key(name):
    return re.sub(r"[\s.‘’']", '', unicodedata.normalize('NFKC',name)).casefold().replace('フォーカス','focus')

for r in retail:
    if r['model'] in ['RCワウ 37HF', 'RCワウ 37FII']:
        target = wahs[0 if r['model'].endswith('HF') else 1]
        classification = {'ヒーローズカラー':'heroes', 'シグネイチャーカラー':'signature', '1091カラー':'1091'}.get(r['classification'], 'RC')
    elif r['model'].startswith('ちびクワトロスプーン'):
        target = next((t for t in targets if t['series']=='Chibi Quattro Spoon' and t['weight']==r['weight']), None)
        if not target:
            target = dict(targets[next(i for i,t in enumerate(targets) if t['series']=='Chibi Quattro Spoon')])
            target.update(model=f"Chibi Quattro Spoon {r['weight']:g}g", weight=r['weight'],
                modelAliases=[r['model'],f"Cibi Quattro Spoon {r['weight']:g}g"], colors=[])
            targets.append(target)
        classification = 'standard'
    else:
        continue
    m = re.match(r'^(\d+)\s+(.+)$',r['caption'])
    code, name = (m[1],m[2]) if m else ('',r['caption'])
    found = next((c for c in target['colors'] if c['colorClass']==classification and
        (color_key(c['name'])==color_key(name) or c['jan']==r['jan'])),None)
    if found:
        if name != found['name']: found['aliases'].append(name)
        if not found['code'] and code: found['code']=code
        found['jan'] = r['jan']
    else:
        target['colors'].append(dict(code=code, name=name, label=f'{code} {name}' if code else name, aliases=[],
            jan=r['jan'], sourceUrl=r['url'], sourceTier='retailer', colorClass=classification, evidence=r['detail']))

for target in wahs:
    merged = {}
    for c in target['colors']:
        k = (c['colorClass'], color_key(c['name']))
        if k in merged:
            old=merged[k]
            old['aliases'] = list(dict.fromkeys(old['aliases'] + c['aliases'] + [c['label'],c['name']]))
            if c['jan']: old['jan']=c['jan']
        else: merged[k]=c
    target['colors']=list(merged.values())

targets = wahs + targets
for t in targets:
    t.setdefault('actionType',None)
    t.setdefault('reuseWithoutWeight',False)
    t.setdefault('buoyancy','')
    t.setdefault('rattle','')
    if t['series']=='Chibi Quattro Spoon':
        t['modelAliases'].append(t['model'].replace('Chibi','Cibi'))
    for c in t['colors']:
        assert t['length'] is not None

for item in pending:
    if item['series']=='Chibi Quattro Spoon':
        confirmed=[]
        for t in targets:
            if t['series']==item['series'] and any(color_key(item['name']) in [color_key(c['name']),*[color_key(a) for a in c['aliases']]] for c in t['colors']):
                confirmed.append(t['weight'])
        item['confirmedWeights']=confirmed
        item['unverifiedWeights']=[w for w in [0.4,0.6,0.8] if w not in confirmed]
        item['reason']='重量別の販売を確認できたものだけ追加します。未確認重量: ' + ', '.join(f'{w:g}g' for w in item['unverifiedWeights'])
pending=[p for p in pending if p.get('unverifiedWeights',True)]
pending.append(dict(series='Chibi Quattro Spoon', name='掲載サイズ数と仕様表の差', reason='公式見出しは5サイズ、現行仕様表は0.4g・0.6g・0.8gの3サイズです。残る2サイズは特定せず保留します'))
pending.append(dict(series='Wah', name='RCワウ37 FⅡ 1091', reason='FⅡ向け1091カラーの販売根拠は未確認です。HFの色を流用しません'))
pending.append(dict(series='REKUZE', name='重量未設定の既存REKUZE', reason='既存モデル226は重量不明でMK2SSS表記の色が登録されています。既存IDを保持し、重量別モデルとは統合しません'))
dump(OUT / 'SHOPIFY_EVIDENCE.json', shopify_audit)
dump(OUT / 'PENDING.json', pending)
dump(OUT / 'CATALOG.json', targets)
header = '''// Generated by scripts/prepare-rc28-catalog.py from explicit product evidence.
import type { LureCategory } from '../db/database'
export interface Rc28Target {
  manufacturer: string; manufacturerAliases: string[]; series: string; seriesAliases: string[]
  model: string; modelAliases: string[]; weight: number; length: number; category: LureCategory
  actionType: 'F' | undefined; reuseWithoutWeight: boolean; buoyancy: string; rattle: string; sourceUrl: string
  specEvidence?: string[]
  colors: { code: string; name: string; label: string; aliases: string[]; jan: string; sourceUrl: string;
    sourceTier: string; colorClass: string; evidence: string }[]
}
'''
text = json.dumps(targets,ensure_ascii=False,indent=2).replace('"actionType": null','"actionType": undefined')
Path('src/data/rc28Catalog.ts').write_text(header + 'export const rc28Catalog: Rc28Target[] = ' + text + '\nexport const rc28Pending = ' + json.dumps(pending, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Targets:', [(t['model'],t['length'],len(t['colors'])) for t in targets])
