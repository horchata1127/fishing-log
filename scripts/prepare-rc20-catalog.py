"""Build reviewed RC20 assets from cached official pages. No database writes.

Usage: python scripts/prepare-rc20-catalog.py --source-dir <downloaded HTML directory>
Only factual color labels and model membership are extracted; images are not redistributed.
"""
import argparse
import csv
import hashlib
import json
import re
from functools import lru_cache
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/rc20'
args = argparse.ArgumentParser()
args.add_argument('--source-dir', type=Path, required=True)
cache = args.parse_args().source_dir

targets = []
evidence = []


@lru_cache(maxsize=None)
def read(slug, url):
    raw = (cache / f'{slug}.html').read_bytes()
    evidence.append(dict(file=f'{slug}.html', source_url=url,
                         sha256=hashlib.sha256(raw).hexdigest(), checked_on='2026-10-12'))
    return raw.decode('utf-8')


def target(manufacturer, series, model, weight, colors, url, **extra):
    row = dict(manufacturer=manufacturer, series=series, model=model,
               weight=weight, colors=colors, sourceUrl=url, allowNewModel=False,
               manufacturerAliases=[], seriesAliases=[], modelAliases=[])
    row.update(extra)
    targets.append(row)


hunt = list(csv.DictReader((OUT / 'HUNT_GRANDE_13G_OFFICIAL_COLORS.csv').open(encoding='utf-8-sig')))
assert [r['color_code'] for r in hunt] == [f'T-{i}' for i in range(1, 31)]
target('ニュードロワー', 'HUNT GRANDE', 'HUNT GRANDE 1.3g', 1.3,
       [dict(code=r['color_code'], name=r['color_name'],
             label=f"{r['color_code']} {r['color_name']}（{r['english_name']}）",
             aliases=[r['color_name'], r['english_name']], sourceUrl=r['source_url']) for r in hunt],
       hunt[0]['source_url'], allowNewModel=True, manufacturerAliases=['New Drawer'],
       seriesAliases=['ハントグランデ'], modelAliases=['ハントグランデ 1.3g'])
read('hunt', hunt[0]['source_url'])

# Each product's own color links determine membership. Never propagate a shared
# palette to all weights. The linked official color heading determines the label.
for family, japanese, weights in [('forte', 'フォルテ', ['06', '09', '15', '18', '21']),
                                  ('daisy', 'デイジー', ['04', '08', '13', '25']),
                                  ('golem', 'ゴーレム', ['22', '29'])]:
    for w in weights:
        slug = family + w
        url = 'https://velvetarts.co.jp/pages/' + slug
        html = read(slug, url)
        colors = []
        for code in sorted(set(re.findall(r'/blogs/color/(\d+)', html)), key=int):
            color_url = 'https://velvetarts.co.jp/blogs/color/' + code
            color_html = read('va-color-' + code, color_url)
            heading = re.search(r'<h1\b[^>]*>(.*?)</h1>', color_html, re.S)
            assert heading, code
            label = unescape(re.sub(r'<[^>]+>', '', heading.group(1))).strip()
            label = ' '.join(label.split())
            match = re.fullmatch(r'(\d+)\s+(.+)', label)
            assert match and int(match[1]) == int(code), label
            colors.append(dict(code=match[1], name=match[2], label=label,
                               aliases=[match[2]], sourceUrl=color_url))
        weight = int(w) / 10
        target('ベルベットアーツ', japanese, f'{japanese} {weight:g}g', weight,
               colors, url, manufacturerAliases=['VELVET ARTS'],
               seriesAliases=[family.upper()], modelAliases=[f'{family.upper()} {weight:g}g'])

chart_url = 'https://koubou1089.livedoor.blog/archives/22868720.html'
read('1089', chart_url)
for size, weight, names, image in [
    ('35FS', 2.1, ['クリアー', 'チャービン', 'トロピカル', 'GLOW&GLOW', None,
                  '夜光虫', 'ツレツレももちゃん', None, '派手ペレット', 'エビカニ', 'レッドグロー'], '19e2bda3.png'),
    ('60FS', 3.3, ['マンゴー', 'チャービン', 'にんじん', 'GLOW&GLOW', 'ずんだGLOW',
                  'コスモス', 'メロンソーダ', 'スケイカ', 'ペレット', 'エビカニ', 'レッドグロー'], '5b93465d.jpg'),
]:
    image_url = f'https://livedoor.blogimg.jp/koubou1089/imgs/{image[0]}/{image[1]}/{image}'
    evidence.append(dict(file=image, source_url=image_url, checked_on='2026-10-12',
                         sha256=hashlib.sha256((cache / image).read_bytes()).hexdigest()))
    colors = [dict(code=str(i + 1), name=name, label=name, aliases=[], sourceUrl=image_url)
              for i, name in enumerate(names) if name is not None]
    target('1089工房', 'さかさにょろ', f'さかさにょろ {size}', weight, colors, chart_url,
           modelAliases=[f'さかさにょろslim {size}'])

# These model/color facts are readable on official product pages. Missing models
# stay pending; no new Rob Lure models are authorized by the color-first policy.
rob = [
    ('S-Plug', 'S-Plug 1.8g', 1.8, 's-plug/', ['ゴールド', 'シルバー', 'ネーブル', 'ろっきゅ～', 'Go! Go! チャンス', 'スケスケオリーブ', 'GLG', 'MOOかりまっか', '壊滅ブラウン', '明滅ライム', '宴もたけなわ', 'ぽむプリ']),
    ('S-Plug', 'S-Plug 2.2g', 2.2, 's-plug/', ['ゴールド', 'シルバー', 'ネーブル', 'ろっきゅ～', 'Go! Go! チャンス', 'スケスケオリーブ', 'GLG', 'MOOかりまっか', '壊滅ブラウン', '明滅ライム', '宴もたけなわ', 'ぽむプリ']),
    ('チェルシー', 'チェルシー SS', 1.8, 'チェルシー/', ['スケスケオリーブ', 'スネーキーグロー', 'とんこつ', '玉ウキ', 'オリーブチャート', 'はいからさん', 'でん六', 'あずて〜ら', 'コンクリートグレー']),
    ('チェルシー', 'チェルシー F', 1.4, 'チェルシー/', ['スケスケオリーブ', 'スネーキーグロー', 'とんこつ', 'クリクリ', 'ブルーパールクリア', 'G6', 'カモフラペレット', 'キョンシー（グロー）']),
    ('パパバービー', 'パパバービー', 3.4, 'パパバービー/', ['クリクリ', 'スケスケオリーブ', 'スネーキーグロー', 'とんこつ', 'カビるん', 'オリーブチャート', 'クリピン', '玉ウキ', 'CG桜薫', 'ブルーパールクリア']),
    ('モーストバービー', 'モーストバービー', 3.4, 'モーストバービー/', ['クリクリ', 'スネーキーグロー', '青汁', 'FM5', 'グローセサミン', 'スケスケオリーブ', 'とんこつ', '黒坦々', '玉ウキ', 'カモフラオリーブ']),
    ('もぐたそ', 'もぐたそ', 4.2, 'もぐたそ/', ['凸ポンオリーブ', 'レッドグロー', 'とんこつ', 'スケスケオリーブ', '凸ポングロー', '黒坦々', 'ピン子', 'スネーキーグロー']),
]
from urllib.parse import quote
for series, model, weight, path, names in rob:
    url = 'https://rob-lure.com/work/' + quote(path)
    source_index = ['s-plug/', 'チェルシー/', 'パパバービー/', 'モーストバービー/', 'もぐたそ/'].index(path)
    html = read(f'rob-{source_index}', url)
    readable = unescape(re.sub(r'<[^>]+>', '', html))
    assert all(name in readable for name in names), model
    target('ロブルアー', series, model, weight,
           [dict(code='', name=n, label=n, aliases=[], sourceUrl=url) for n in names], url,
           manufacturerAliases=['rob lure', 'rob-lure'])

pack = dict(format='fishing-log-official-color-patch', version=1, catalogVersion='1.0-rc20',
            checkedOn='2026-10-12', targets=targets)
(OUT / 'RC20_OFFICIAL_CATALOG.json').write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(ROOT / 'src/data/rc20Catalog.ts').write_text(
    '// Generated from docs/rc20/RC20_OFFICIAL_CATALOG.json. No runtime network access.\n'
    + 'export const rc20Catalog = ' + json.dumps(targets, ensure_ascii=False, indent=2) + ' as const\n', encoding='utf-8')

# Baseline comparisons use the provided RC18 JSON. RC19 runtime IDs are not guessed.
baseline = json.loads((ROOT / 'docs/catalog-handoff/fishing_log_catalog_1886_only.json').read_text(encoding='utf-8'))['data']
rows = []
for t in targets:
    makers = [m for m in baseline['lureManufacturers'] if m['name'] == t['manufacturer']]
    series = [s for s in baseline['lureSeries'] if s['manufacturerId'] == makers[0]['id'] and s['name'] == t['series']]
    models = [m for m in baseline['lureModels'] if series and m['seriesId'] == series[0]['id'] and m['name'] == t['model']]
    for color in t['colors']:
        existing = [v for v in baseline['lureVariants'] if models and v['modelId'] == models[0]['id'] and v['colorName'] == color['label']]
        action = 'keep' if existing else 'add_color' if models or t['allowNewModel'] else 'hold_missing_model'
        if t['allowNewModel'] and color['code'] in ['T-15', 'T-18']:
            action = 'keep_rc19_runtime_id'
        rows.append(dict(manufacturer=t['manufacturer'], series=t['series'], model=t['model'], weight=t['weight'],
                         color_code=color['code'], color_name=color['label'], source_url=color['sourceUrl'],
                         verification_status='official_confirmed', existing_id=existing[0]['id'] if existing else '', action=action))
holds = [
    ('ベルベットアーツ', 'VAパペットサーフェス', 'VAパペットサーフェス', 'https://velvetarts.co.jp/pages/vapuppetsurface', 'hold_collaboration_missing_model_and_image_labels'),
    ('1089工房', 'さかさにょろ', 'さかさにょろ 35FS / チャート5・8', chart_url, 'hold_label_uncertain'),
    ('ベルベットアーツ', 'ゴーレム', 'ゴーレム 2.2g / 画像掲載色', 'https://velvetarts.co.jp/pages/golem22', 'hold_unlinked_label'),
    ('ロブルアー', 'チェルシー', 'チェルシー SS / 記載10色・名称確認9色', 'https://rob-lure.com/work/%E3%83%81%E3%82%A7%E3%83%AB%E3%82%B7%E3%83%BC/', 'hold_unnamed_color'),
    ('1089工房', 'さかさにょろ', 'さかさにょろ 45FS', 'https://koubou1089.livedoor.blog/archives/28699943.html', 'hold_missing_model'),
    ('1089工房', 'さかさにょろ', 'さかさにょろ 60S', chart_url, 'hold_missing_model'),
    ('1089工房', 'さかさにょろ', 'さかさにょろ 60XS', chart_url, 'hold_missing_model'),
    ('1089工房', 'okバブリー！', 'okバブリー！', chart_url, 'hold_missing_model'),
    ('1089工房', 'ボトムにょろ', 'ボトムにょろ37', 'https://koubou1089.livedoor.blog/archives/26289065.html', 'hold_missing_model'),
    ('1089工房', 'ボトムにょろ', 'ボトムにょろ30S', 'https://koubou1089.livedoor.blog/archives/29638928.html', 'hold_prototype_release_unconfirmed'),
    ('1089工房', 'さかさにょろ', 'さかさにょろ30', 'https://koubou1089.livedoor.blog/archives/29638928.html', 'hold_prototype_release_unconfirmed'),
    ('1089工房', 'さかさにょろ', 'さかさにょろ70XS', 'https://koubou1089.livedoor.blog/archives/29638928.html', 'hold_prototype_release_unconfirmed'),
    ('ロブルアー', 'バービー', 'バービー F / SS / SSS', 'https://rob-lure.com/work/berbie-%E3%83%90%E3%83%BC%E3%83%93%E3%83%BC/', 'hold_missing_models_and_image_labels'),
]
for maker, series, model, url, action in holds:
    rows.append(dict(manufacturer=maker, series=series, model=model, weight='', color_code='', color_name='',
                     source_url=url, verification_status='pending', existing_id='', action=action))
with (OUT / 'RC20_CATALOG_DIFF.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
(OUT / 'RC20_SOURCE_AUDIT.json').write_text(json.dumps(list({r['file']: r for r in evidence}.values()), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Review workbook mirrors the CSV. All cells are literal strings, never formulas.
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring
ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
sheet = Element('worksheet', xmlns=ns)
data = SubElement(sheet, 'sheetData')
for index, values in enumerate([list(rows[0])] + [list(r.values()) for r in rows], 1):
    row = SubElement(data, 'row', r=str(index))
    for column, value in enumerate(values):
        c = SubElement(row, 'c', r=f'{chr(65 + column)}{index}', t='inlineStr')
        SubElement(SubElement(c, 'is'), 't').text = str(value)
with zipfile.ZipFile(OUT / 'RC20_CATALOG_DIFF.xlsx', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
    z.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    z.writestr('xl/workbook.xml', f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="RC20差分" sheetId="1" r:id="rId1"/></sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
    z.writestr('xl/worksheets/sheet1.xml', tostring(sheet, encoding='utf-8', xml_declaration=True))
print(f'{len(targets)} models, {sum(len(t["colors"]) for t in targets)} verified color entries, {len(holds)} holds')
