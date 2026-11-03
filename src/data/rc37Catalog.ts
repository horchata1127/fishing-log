// Reviewed 2026-11-03. Product-specific retailer evidence; never infer a cross-product color matrix.
const backlash = (id: string) => `https://www.backlash.co.jp/item/${id}/`
const signatures = [
  ['34', '19早乙女'], ['35', '20井野'], ['36', '24ノブ'], ['37', 'ラーテル'], ['38', 'FOCUSオリーブ'],
  ['43', '21ノブ'], ['44', 'フォーカスおまめ'],
] as const
const recent = [['27', '16ノブ'], ['31', '19ノブ'], ['32', '20安塚'], ['33', 'RCポテトヘッド'], ...signatures] as const
type Color = { code: string; name: string; label: string; aliases: string[]; sourceUrl: string;
  sourceTier: string; colorClass: string; verified: boolean; notes: string }
function colors(rows: readonly (readonly string[])[], sourceUrl: string): Color[] {
  return rows.map(([code = '', name = '']) => ({ code, name, label: code ? `#${code} ${name}` : name,
    aliases: [name, ...(Number(code) >= 34 && Number(code) <= 36 ? [`#${code} '${name}`, `'${name}`, `’${name}`] : [])],
    sourceUrl, sourceTier: 'retailer', colorClass: 'standard', verified: true,
    notes: '2026-11-03 販売店の当該モデルの選択肢を確認。メーカー公式確認ではない。' }))
}
function product(series: string, model: string, weight: number, length: number, buoyancy: string,
  rattle: string, sourceUrl: string, rows: readonly (readonly string[])[], modelAliases: string[] = [], blockedModelAliases: string[] = []) {
  return { manufacturer: 'RODIO CRAFT', manufacturerAliases: ['ロデオクラフト', 'RodioCraft'],
    series, seriesAliases: series === 'Petit MOCA' ? ['プチモカ', 'Puchi MOCA'] : series === 'Fat MOCA Jr.' ? ['ファットモカJr.'] : ['モカ'],
    model, modelAliases, blockedModelAliases, weight, length, buoyancy, rattle, category: 'クランク',
    sourceUrl, productVerified: true, allowNewModel: true, colors: colors(rows, sourceUrl) }
}
const ambiguousDR = ['MOCA DR Rattle 2HOOK']
const petitF = ['クリアー（マット）', 'Ｋ．Ｆ３', 'Ｓ．Ｍ６', 'Ｍ．Ｍ３', 'ミルクココア', 'ＦＷＳ', '２０１４福田', '２０１４ノブ', '蛍光ピンク', 'さちおの茶', '１６ノブ', '１９ノブ', '２０安塚', 'ＲＣポテトヘッド', '１９早乙女', '２０井野', '２４ノブ', 'ラーテル', 'ＦＯＣＵＳオリーブ'].map(name => ['', name])
const petitF2 = ['クリアー（マット）', 'Ｓ．Ｍ　６', 'Ｋ．Ｆ　５', 'Ｍ．Ｍ　３', 'Ｋ．Ｙ　６', 'ベージュ', 'ピンクバックチャート', 'キャンディミックス', '１６ノブ', '１９ノブ', '２０安塚', 'ＲＣポテトヘッド', '１９早乙女', '２０井野', '２４ノブ', 'ラーテル', 'ＦＯＣＵＳオリーブ'].map(name => ['', name])

export const rc37Catalog = [
  product('MOCA', 'MOCA SR-HF 2HOOK', 1.6, 30, 'HF', 'none', backlash('4571385603859'), [
    ['1', 'クリアー'], ['2', 'KF3'], ['20', '2014ノブカラー'], ['22', 'さちおの茶'], ['23', '2015ノブカラー'],
    ['24', '黒まんじゅう'], ['33', 'RCポテトヘッド'], ['39', 'クリアーピンク'], ['40', 'マッディトップ'], ['41', 'カゲロウ'], ['42', 'まほ丸ダブル'],
  ]),
  product('MOCA', 'MOCA SR-FⅡ 2HOOK', 2.1, 30, 'FⅡ', 'none', backlash('4573151265520'), recent, ['MOCA SR-F2 2HOOK', 'MOCA SR-FII 2HOOK']),
  product('MOCA', 'MOCA SR-SS', 2.3, 30, 'SS', 'none', backlash('4573151265568'), recent, ['MOCA SR-SS 2HOOK']),
  product('MOCA', 'MOCA SR-SS Rattle', 2.4, 30, 'SS', 'rattle', backlash('4573151272429'), signatures, ['MOCA SR-SS Rattle 2HOOK']),
  product('MOCA', 'MOCA DR-F 2HOOK', 1.9, 30, 'F', 'none', 'https://www.kitiya.jp/?pid=83772673', [
    ['', 'クリアー（マット）'], ['', 'K.F 3（レッドグロー）'], ['', 'S.M 6'], ['', 'K.F 5（FKB）'], ['', 'M.M 3'],
    ['', 'ミルクココア'], ['', 'FWS'], ['', '黒ザリガニ'], ['', 'あおさ'], ['', 'キラキラ'], ['', '黄/緑'],
    ['', '2014福田カラー'], ['', '2014ノブカラー'], ['', '蛍光ピンク'], ['', 'さちおの茶'], ['', '2015 ノブカラー'],
    ['', '黒まんじゅう'], ['', 'ゆだお'], ['', 'UFO'], ...recent.filter(([code]) => !['43', '44'].includes(code)),
  ]),
  product('MOCA', 'MOCA DR-SS 2HOOK', 2.3, 30, 'SS', 'none', backlash('4573151265728'), recent),
  product('MOCA', 'MOCA DR-F Rattle 2HOOK', 2.1, 30, 'F', 'rattle', backlash('4573151272276'), signatures, [], ambiguousDR),
  product('MOCA', 'MOCA DR-SS Rattle 2HOOK', 2.4, 30, 'SS', 'rattle', backlash('4573151272320'), signatures, [], ambiguousDR),
  product('Fat MOCA Jr.', 'Fat MOCA Jr. SR-F', 1.4, 24, 'F', 'none', backlash('4573151272375'), signatures),
  product('Fat MOCA Jr.', 'Fat MOCA Jr. SR-SS', 1.6, 24, 'SS', 'none', backlash('4573151272122'), signatures),
  product('Fat MOCA Jr.', 'Fat MOCA Jr. DR-F', 1.5, 24, 'F', 'none', backlash('4573151272221'), signatures),
  product('Fat MOCA Jr.', 'Fat MOCA Jr. DR-SS', 1.6, 24, 'SS', 'none', backlash('4573151270371'), signatures),
  product('Fat MOCA Jr.', 'Fat MOCA Jr. SR-HF Rattle', 1.3, 24, 'HF', 'rattle', backlash('4573151269818'), [
    ['1', 'クリアー'], ['2', 'クリアーパール'], ['3', 'クリアーピンク'], ['4', 'ゴールデントップ'], ['5', 'マッディトップ'],
    ['6', '曇天'], ['7', 'カゲロウ'], ['8', 'まほ丸'], ['9', '2015ノブカラー'], ['10', '黒まんじゅう'], ['11', 'RCポテトヘッド'],
  ]),
  product('Petit MOCA', 'Petit MOCA SR-F', 1.0, 25, 'F', 'none', 'https://www.proshoptomo.com/?pid=95981385', petitF),
  product('Petit MOCA', 'Petit MOCA SR-FⅡ', 1.1, 25, 'FⅡ', 'none', 'https://www.proshoptomo.com/?pid=95981679', petitF2, ['Petit MOCA SR-F2', 'Petit MOCA SR-FII']),
  product('Petit MOCA', 'Petit MOCA SR-SS', 1.2, 25, 'SS', 'none', backlash('4573151265384'), recent),
]

// Additional model-specific evidence. Do not reuse these old colors on other models.
rc37Catalog.find(t => t.model === 'MOCA DR-SS 2HOOK')!.colors.push(...colors([
  ['', 'K.F 3（レッドグロー）'], ['', 'S.M 6'], ['', 'K.F 5（FKB）'], ['', 'M.M 3'], ['', 'K.Y 6'],
  ['', 'ベージュ'], ['', 'ピンクバックチャート'], ['', 'ミルクココア'], ['', 'FWS'], ['', '黒ザリガニ'],
  ['', 'あおさ'], ['', 'キラキラ'], ['', '黄/緑'], ['', '2014福田カラー'], ['', '2014ノブカラー'],
  ['', '蛍光ピンク'], ['', 'さちおの茶'], ['', '2015 ノブカラー'], ['', '黒まんじゅう'], ['', 'ゆだお'],
  ['', 'UFO'], ['', 'クリアー(マット)'],
], 'https://www.kitiya.jp/?pid=83772805'))
rc37Catalog.find(t => t.model === 'MOCA DR-F 2HOOK')!.colors.push(...colors(signatures.slice(-2), backlash('4573151265643')))

export const rc37Pending = [
  { series: 'MOCA', name: 'MOCA DR Rattle 2HOOK', reason: '既存モデルはF/SS未指定。DR-FとDR-SS両方のラトル製品が存在し同一性未確認。名称・IDを保持し両候補の追加を保留。' },
  { series: 'MOCA', name: '2026-11-03 多摩湖MVP ミルクココア（暫定）', reason: 'ユーザー申告の個体カラーは未確定。販売店の#11 ミルクココアと同一個体とは断定しない。釣果・MVPは自動変更しない。 https://bfarm.buyshop.jp/items/93854850' },
  { series: 'Petit MOCA', name: 'Petit MOCA DR-F', reason: '商品と8色の選択肢は確認。重量の一次販売資料を確認できず今回は保留。 https://www.proshoptomo.com/?pid=95982330' },
  { series: 'MOCA', name: 'MOCA / MOCA SR-F', reason: '既存のMOCAはタイプ未指定。旧SR-Fとの対応を推測しない。' },
]
