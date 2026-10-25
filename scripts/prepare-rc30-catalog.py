"""Generate the reviewed additive catalog from frozen, model-specific retailer evidence."""
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/rc30'
route = json.loads((OUT / 'ROUTE_VARIANTS.json').read_text(encoding='utf8'))
targets = []
for option, model, weight, rattle in [
    ('S', 'USSA S', 2.7, 'なし'),
    ('XS Rattle/ラトル', 'USSA XS', 2.9, 'ガラスラトル×2'),
    ('XS No Rattle/ノンラトル', 'USSA XS Non Rattle', 2.9, 'なし'),
    ('Jr', 'Fat USSA Jr. XS', 1.7, 'ガラスラトル×1'),
]:
    targets.append(dict(manufacturer='RODIO CRAFT', manufacturerAliases=['ロデオクラフト', 'RodioCraft'],
        series='USSA', seriesAliases=['ウッサ'], model=model,
        modelAliases={'USSA S': ['ウッサS'], 'USSA XS': ['ウッサXS', 'USSA XS Rattle'],
                      'USSA XS Non Rattle': ['ウッサXSノンラトル', 'USSA XS NR'],
                      'Fat USSA Jr. XS': ['ファットウッサJr.XS', 'Fat USSA Jr. XS 1.7g']}[model],
        weight=weight, length=24 if option == 'Jr' else 30, category='クランク', actionType='S' if option == 'S' else 'XS',
        reuseWithoutWeight=True, buoyancy='シンキング' if option == 'S' else 'エキストラシンキング', rattle=rattle,
        sourceUrl='https://riverroad1091.shop/?pid=193025491' if option == 'Jr' else 'https://t-route.net/products/ussa-rodiocraft', colors=[]))
    for v in route['variants']:
        # Shared Shopify selectors contain placeholder combinations. Require a product JAN.
        if v['option1'] != option or not v['barcode']:
            continue
        code, raw = re.match(r'#(\d+)\s+(.*)', v['option2']).groups()
        name = raw.replace('S.MⅥ', 'S.M VI').replace('（FKB)', '（FKB）').replace("'19", '19').replace("'20", '20').replace("'24", '24').replace("'21", '21')
        aliases = [raw]
        if name == '黒まんじゅう': aliases.append('クロまんじゅう')
        targets[-1]['colors'].append(dict(code=code, name=name, label=f'{code} {name}', aliases=aliases,
            jan=v['barcode'], sourceUrl='https://t-route.net/products/ussa-rodiocraft', sourceTier='retailer', colorClass='通常・クリアリップ' if name.endswith('C') else '通常', evidence=v['title']))

def add(index, name, source, color_class, code='', evidence=None):
    aliases = {'三ケ日みかん': ['三ヶ日みかん'], '1091 オレンジクラウン': ['1091オレンジクラウン', 'オレンジクラウン'], '1091 18井野': ['18井野', '18井野/1091']} .get(name, [])
    if name.startswith('26'): aliases.append("'" + name)
    targets[index]['colors'].append(dict(code=code, name=name, label=f'{code} {name}'.strip(),
        aliases=['クロまんじゅう'] if name == '黒まんじゅう' else aliases, jan='', sourceUrl=source,
        sourceTier='retailer', colorClass=color_class, evidence=evidence or name))

fat = [(1,'クリアー（マット）'),(3,'S.M VI C'),(7,'さちおの茶'),(8,'キラキラ'),(11,'2014ノブカラー'),
       (12,'蛍光ピンク'),(14,'2015ノブカラー'),(15,'黒まんじゅう'),(20,'20安塚'),(21,'RCポテトヘッド'),
       (22,'19早乙女'),(23,'20井野'),(24,'24ノブ'),(25,'ラーテル'),(26,'FOCUSオリーブ C'),
       (27,'21ノブ'),(28,'FOCUSおまめ'),(29,'クリアーホロ'),(30,'まほ丸'),(31,'クリアーピンク')]
for code, name in fat:
    add(3, name, 'https://www.kitiya.jp/?pid=192717778', '通常', str(code))
# Number 13 is not asserted for Jr: this retailer lists the name but no number.
add(3, '大人の黒金', 'https://riverroad1091.shop/?pid=193025491', '通常', evidence='Jr XSの商品別選択肢に掲載。番号は未確認')
for index in [0, 1]:
    for name in ['スケスケクリアー', 'スケスケピンク', 'オラオラオレンジ']:
        add(index, name, 'https://island.shop-pro.jp/?pid=182831994', '有頂天')
    for name in ['26松本', '26福田', '26早乙女', '26井野']:
        add(index, name, 'https://riverroad1091.shop/?pid=193297586', '2026シグネイチャー')
    add(index, '26ノブ', 'https://andfield365.jp/products/ロデオクラフト-ウッサ-2026-シグネイチャーカラー', '2026シグネイチャー')
    add(index, '一網打尽', 'https://riverroad1091.shop/?pid=145456100', 'River Road別注')
for name in ['三ケ日みかん', '1091 オレンジクラウン', 'キラキラウォーターメロン', '1091 18井野']:
    add(0, name, 'https://any-netshop.shop-pro.jp/?pid=182928376', '1091')
    add(1, name, 'https://any-netshop.shop-pro.jp/?pid=182928518', '1091')
for index, product in [(0, 'y-4573151227955'), (1, 'y-4573151249339')]:
    for name in ['カフェシャレッドグロー', 'Gパン']:
        add(index, name, f'https://store.shopping.yahoo.co.jp/backlash/{product}.html', '1091')
for name in ['栃おとめ', 'スケペレット', '腹黒']:
    add(0, name, 'https://www.jointer.jp/product/detail/rodio_craft_ussa/', 'JOINTER別注')

pending = [dict(series='USSA', name=name, reason=reason) for name, reason in [
    ('26佐野', 'River Roadの列名は26佐野。他店の26ノブとの対応が不明なため保留。'),
    ('ハラオリ', '既存汎用USSAの色を保持。S/XS/NRへの割当根拠は未確認。'),
    ('クリアシルバー', 'ユーザー記録名を保持。クリアーホロとの同一性は未確認。'),
    ('XS/NR ミルクココア・NR C付き2色', '共通セレクターには存在するがJANがないため対象外。'),
]]
(OUT / 'CATALOG.json').write_text(json.dumps(targets, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
(OUT / 'PENDING.json').write_text(json.dumps(pending, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
with (OUT / 'COLOR_RESEARCH.csv').open('w', newline='', encoding='utf-8-sig') as f:
    writer = csv.writer(f); writer.writerow(['manufacturer','series','model','color','code','class','jan','sourceUrl','evidence','status'])
    for t in targets:
        for c in t['colors']: writer.writerow([t['manufacturer'],t['series'],t['model'],c['name'],c['code'],c['colorClass'],c['jan'],c['sourceUrl'],c['evidence'],'confirmed'])
    for p in pending: writer.writerow(['RODIO CRAFT','USSA','',p['name'],'','','','',p['reason'],'pending'])
header = "// Generated by scripts/prepare-rc30-catalog.py.\nimport type { LureCategory, LureModel } from '../db/database'\n"
header += "export interface Rc30Target { manufacturer: string; manufacturerAliases: string[]; series: string; seriesAliases: string[]; model: string; modelAliases: string[]; weight: number; length: number; category: LureCategory; actionType: LureModel['actionType']; reuseWithoutWeight: boolean; buoyancy: string; rattle: string; sourceUrl: string; colors: { code: string; name: string; label: string; aliases: string[]; jan: string; sourceUrl: string; sourceTier: string; colorClass: string; evidence: string }[] }\n"
(ROOT / 'src/data/rc30Catalog.ts').write_text(header + 'export const rc30Catalog: Rc30Target[] = '+json.dumps(targets,ensure_ascii=False,indent=2)+'\nexport const rc30Pending = '+json.dumps(pending,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print([(t['model'],len(t['colors'])) for t in targets])
audit = dict(researchedAtJst='2026-10-25', baselineCommit='627885e',
    routeEvidenceSha256=hashlib.sha256((OUT / 'ROUTE_VARIANTS.json').read_bytes()).hexdigest(),
    modelCounts={t['model']: len(t['colors']) for t in targets},
    modelColorPairs=sum(len(t['colors']) for t in targets),
    routePairs=len(route['variants']), routePairsWithoutJan=[v['title'] for v in route['variants'] if not v['barcode']],
    duplicatePairsRemoved=0, syntheticBaselineRetained=0, syntheticRepeatRetained=140,
    syntheticAliasRetained=3, pendingGroups=len(pending),
    note='Counts use synthetic baseline only. Device-specific additions/duplicates require the read-only app preview.')
(OUT / 'AUDIT.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
