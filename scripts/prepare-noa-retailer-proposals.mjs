import { readFile, writeFile } from 'node:fs/promises'
const folder = 'docs/noa-retailer-product-links/'
const source = JSON.parse(await readFile(folder+'CASTING_DISCOVERY.json', 'utf8'))
const baseline = JSON.parse(await readFile('docs/noa-photo-coverage-followup/AUDIT.json', 'utf8'))
const fold = s => s.normalize('NFKC').replace(/\s/g, '').toLowerCase()
const models = [...new Set(baseline.rows.map(r => r.modelName))]
const modelFold = s => fold(s).replaceAll('ノア','noa').replaceAll('ジュニア','jr').replaceAll('(noa)','').replaceAll('.', '').replaceAll('noa-s', 'noas')
const spellings = new Map([
  ['和カラシ(マット)', '和からし(マット)'], ['Dオリーブ(マット)', 'ダークオリーブ(マット)'],
  ['グロー', 'グロー(夜光)'], ['鉄板!!南関東', '鉄板!南関東'], ['表蛍光レッド裏GD', '表蛍R/裏ゴールド'],
  ['蛍光R/ゴールド', '表蛍R/裏ゴールド'], ['表蛍光レッド/裏ゴールド', '表蛍R/裏ゴールド'],
  ['K.F6', 'K.F.VI'], ['K.F2', 'K.F II'], ['K.F4', 'K.F.IV'],
].map(([a,b])=>[fold(a), fold(b)]))
const proposals = []
for (const product of source.candidates) {
  const text = modelFold(product.title)
  const model = models.find(m => text.includes(modelFold(m)))
  if (!model) continue
  const suffix = product.title.normalize('NFKC').split(/\d+(?:\.\d+)?\s*g/i).slice(1).join('g').replace(/【.*?】/g,'').trim()
  const raw = suffix.replace(/^#\s*/, '').trim(), numbered = raw.match(/^(\d+)\s*(.*)$/)
  const code = numbered?.[1] ?? raw.match(/^(US-\d+)/i)?.[1] ?? ''
  const color = numbered?.[2] ?? raw
  const name = spellings.get(fold(color)) ?? fold(color)
  const matches = baseline.rows.filter(r => r.modelName === model &&
    (fold(r.sharedColorName) === name || fold(r.sharedColorName) === fold(color) || fold(r.colorName) === fold(suffix)) &&
    (!code || !r.colorCode || fold(r.colorCode) === fold(code)))
  if (!matches.length) continue
  // Valid exact-model photos already reviewed in PR45 stay at their existing URL.
  const needed = matches.filter(r => !r.imageKind || r.imageKind === 'weight-common-color-sample' || r.linkHealth.startsWith('404'))
    .filter(r => !(r.modelName === 'NOA 1.8g' && r.productUrl && r.linkHealth.startsWith('200') && !r.imageKind))
  if (!needed.length) continue
  proposals.push({ ...product, listingTitle: product.title, modelName: model, colorName: needed[0].colorName,
    matchedVariantIds: needed.map(r=>r.variantId), colorCode: needed[0].colorCode,
    matchBasis: spellings.has(fold(color)) ? '明示した表記候補。番号だけで承認しない。画像・仕様・商品コードの確認待ち。' : 'モデル・重量・色名の厳密一致候補。画像・仕様・商品コードの確認待ち。' })
}
await writeFile(folder+'PROPOSALS.json', JSON.stringify(proposals, null, 2)+'\n')
console.log({ candidates: source.candidates.length, matchingProducts: proposals.length,
  models: Object.fromEntries(models.map(m=>[m,proposals.filter(p=>p.modelName===m).length])) })
