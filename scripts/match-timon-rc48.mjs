import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const directory = 'docs/lure-external-links/'
const backup = process.argv[2]
if (!backup) throw new Error('Pass the path to the local backup')
const raw = await readFile(backup)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const { data } = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
const maker = data.lureManufacturers.find(row => row.name.normalize('NFKC').toUpperCase() === 'TIMON')
if (!maker) throw new Error('TIMON is missing from the catalog')
const series = data.lureSeries.filter(row => row.manufacturerId === maker.id)
const models = data.lureModels.filter(row => series.some(parent => parent.id === row.seriesId))
const variants = data.lureVariants.filter(row => models.some(model => model.id === row.modelId))
const cachedPages = await Promise.all((await readdir(directory + 'timon-pages')).filter(name => name.endsWith('.json'))
  .map(async name => JSON.parse(await readFile(directory + 'timon-pages/' + name))))
const pages = new Map(cachedPages
  .filter(page => page.httpStatus === 200 && new URL(page.url).hostname === 'www.jackall.co.jp')
  .map(page => [new URL(page.url).pathname.split('/').at(-2), page]))
const termsUrl = 'https://www.jackall.co.jp/terms-of-service/'

const seriesPage = new Map(Object.entries({
  'TC Reigen': 'tc-reigen', TAPDANCER: 'tapdancer', SLIDON: 'slidon', REKUZE: 'rekuze', Prikkey: 'prikkey',
  Pepino: 'pepino', 'PaniCra DR Rattle': 'panicra-dr-rattle', PaniCra: '2026-02-26-8768',
  'MITTS DRY 2Hook': 'mitts-dray2hook', Mitts: 'mitts-sr',
  'MICRO PANICRA': 'micro-panicra', 'METAL KUROBALL': 'metal-kuroball', 'KUROBALL γ': 'kuroball-gannma',
  'KUROBALL β': 'kuroball_beta', KUROBALL: 'kuroball', KIBIpani: 'kibipani', Futten: 'futten', FlaPani: 'flapani',
  'DEKA Mitts DRY': 'deka-mitts-dry', 'DEKA MITTS': 'deka-mitts-dry', DARTRUN: 'dartrun',
  'Chibi Pepino': 'chibi-pepino', 'Chibi PaniCra': 'chibi_panicra', 'BURIBURI MINNOW': '2026-08-28-11927',
  Tearo: 'tearo', 'Chibi Tearo': 'chibitearo', 'Apeed!': 'apeed', 'Chibi Quattro Spoon': 'cibi-quattro-spoon', Rhomy: 'rhomy',
}))
const modelPage = new Map(Object.entries({
  'DEKA Mitts DRY Rattle': 'deka-mitts-dry-rattle', 'CHIBI FUTTEN FS': 'chibi-futten',
  'BURIBURI MINNOW HF Rattle': 'buriburi-minnow-hf-rattle', 'CHIBI BURIBURI MINNOW': 'chibi_buriburi_monnow_1',
}))
const unweightedSpoonModels = new Set(['REKUZE','METAL KUROBALL','KUROBALL','Tearo','Chibi Tearo','Apeed!','Chibi Quattro Spoon','Rhomy'])
const fold = value => value.normalize('NFKC').toLowerCase().replace(/[\s‐‑–—−ｰ]/g, c=>/\s/.test(c)?'':'-')
  .replace(/(\d+)\.0g/g, '$1g')
const specsAliases = new Map(Object.entries({
  'DEKA Mitts DRY': ['デカミッツドライ'], 'DEKA Mitts DRY Rattle': ['デカミッツドライラトル'],
  'MICRO PANICRA MR-F Rattle': ['MICRO PANICRA MR-Fラトル'],
  'METAL KUROBALL': ['メタルクロボール'], 'KIBIpani MR': ['キビパニMR'], 'KIBIpani MR-SS': ['キビパニMR-SS'],
  'Chibi Quattro Spoon': ['Cibi Quattro Spoon'], 'CHIBI FUTTEN FS': ['ちびフッテンFS'],
  'DARTRUN': ['ダートラン'], 'Chibi DARTRUN': ['ちびダートラン'], 'DARTRUN HW': ['ダートランHW'],
  TAPDANCER: ['タップダンサー'], 'CHIBI TAPDANCER': ['ちびタップダンサー'],
  'Mitts SR-DRY': ['Mitts SR-DRY[ドライ]'],
}))
const multiModelMarker = new Map(Object.entries({
  'MITTS DRY 2Hook': 'ミッツドライ2Hook',
  'MITTS DRY RATTLE 2Hook': 'ミッツドライラトル2Hook',
  'MICRO PANICRA MR-F Rattle': 'MR-Fラトル',
  'MICRO PANICRA MR-SS': 'MR-SS',
}))
const parseNumericSpec = (value, suffix) => [...value.normalize('NFKC').matchAll(new RegExp('([0-9]+(?:\\.[0-9]+)?)\\s*'+suffix, 'gi'))].map(match=>Number(match[1]))

function modelContext(parent, model) {
  if (model.name === 'PaniCra DR-F Rodio Ver.') return { reason: 'collaboration-model-not-on-official-product-page' }
  const slug = modelPage.get(model.name) ?? seriesPage.get(parent.name)
  const page = pages.get(slug)
  if (!page) return { reason: 'official-product-page-unavailable' }
  if (model.weightG === undefined) return { page, reason: 'catalog-model-weight-unspecified' }
  const stripped = unweightedSpoonModels.has(parent.name) ? model.name.replace(/\s[\d.]+g$/i, '') : model.name
  const names = [model.name, stripped, ...(specsAliases.get(stripped) ?? [])].map(fold)
  const table = page.tables?.find(table=>table.rows[0]?.[0]==='Name' && table.rows[0].includes('Weight'))
  if (!table) return {page,reason:'official-spec-table-unavailable'}
  const [head,...body] = table.rows
  const spec = body.filter(row=>names.includes(fold(row[0] ?? '')) &&
    parseNumericSpec(row[head.indexOf('Weight')] ?? '', 'g').includes(model.weightG) &&
    (model.lengthMm === undefined || parseNumericSpec(row[head.indexOf('Length')] ?? '', 'mm').includes(model.lengthMm)))
  if (spec.length!==1) return {page,reason:'official-model-spec-not-exact'}
  const weightBased = unweightedSpoonModels.has(parent.name) || parent.name.startsWith('KUROBALL')
  const sharedPage = body.length>1 || parseNumericSpec(spec[0][head.indexOf('Weight')], 'g').length>1
  const marker = multiModelMarker.get(model.name) ?? model.name.match(/(?:DR-HF|MR-SS|SR-SS|DR-SS|SR|MR|DR)$/)?.[0]
  return {page,spec:Object.fromEntries(head.filter(h=>h!=='Price').map(h=>[h,spec[0][head.indexOf(h)]])),
    weightBased,sharedPage,marker}
}

function colorParts(label, explicitCode) {
  const value = label.normalize('NFKC').trim()
  const matched = value.match(/^#?(\d+)\s+(.+)$/)
  return { code:explicitCode || matched?.[1], name:matched?.[2] ?? value }
}
function matchingColor(row, photo, page) {
  const label=page.url.endsWith('/2026-02-26-8768/') ? photo.alt.replace(/[（(]パニクラ[）)]$/,'') : photo.alt
  const official = colorParts(label)
  const catalog = colorParts(row.colorName,row.catalogEvidence?.colorCode)
  return fold(official.name) === fold(catalog.name) &&
    !(official.code && catalog.code && Number(official.code) !== Number(catalog.code))
}
function cards(page) {
  const photos = new Map()
  for (const image of page.images ?? []) {
    if (image.group !== 'product-color-list__item' || !image.alt.trim()) continue
    const key = JSON.stringify([image.alt,image.url])
    if (!photos.has(key) || photos.get(key).label.length < image.label.length) photos.set(key,image)
  }
  return [...photos.values()]
}
const cardSets = new Map(cachedPages.map(page=>[page.url,cards(page)]))
function getSku(card, model, context) {
  const suffix = card.label.startsWith(card.alt) ? card.label.slice(card.alt.length).normalize('NFKC') : ''
  const all = [...suffix.matchAll(/JAN\s*:\s*(\d{13})(?!\d)/gi)].map(match=>match[1])
  if (!context.sharedPage) return { identified: true, jan: all.length===1 ? all[0] : undefined, sharedImage:false }
  if (context.weightBased) {
    const weights = [...suffix.matchAll(/(\d+(?:\.\d+)?)\s*g\s*JAN\s*:\s*(\d{13})(?!\d)/gi)]
    const exact = weights.filter(match=>Number(match[1])===model.weightG)
    return { identified: exact.length===1, jan:exact[0]?.[2], sharedImage:all.length>1 || weights.length>1 }
  }
  if (!context.marker) return { identified:false }
  const marker = fold(context.marker).replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')
  const caption = suffix.toLowerCase().replace(/[‐‑–—−ｰ]/g, '-')
  const pattern = '(?<![a-z0-9-])'+marker+/\s*jan\s*:\s*(\d{13})(?!\d)/.source
  const variants = [...caption.matchAll(new RegExp(pattern,'g'))]
  return { identified:variants.length===1,jan:variants[0]?.[1],sharedImage:all.length>1 || /(?:SR|MR|DR).{0,5}JAN/i.test(suffix.replace(/JAN\s*:\s*\d{13}.*$/i,'')) && /目玉/.test(suffix) }
}
function imageEvidence(card, sku, context) {
  const image = new URL(card.url)
  if (image.origin !== 'https://www.jackall.co.jp' || !/^\/timon\/wp-content\/uploads\//.test(image.pathname)) {
    return { status:'held-unconfirmed-image-host', candidateUrl:card.url }
  }
  return { status:'held-site-conditions', candidateUrl:card.url, verifiedHost:image.hostname,
    kind:sku.sharedImage ? context.weightBased ? 'weight-common-color-sample' : 'official-color-sample' : 'product-photo',
    conditionsEvidence:termsUrl, decoded:'unverified' }
}

const reviewedRows = []
const reviewedModels = []
for (const model of models) {
  const parent = series.find(s=>s.id===model.seriesId)
  const context = modelContext(parent,model)
  const page = context.page
  const modelVariants = variants.filter(v=>v.modelId===model.id)
  const modelRow = {manufacturer:'TIMON',series:parent.name,model:model.name,modelId:model.id,weightG:model.weightG,
    lengthMm:model.lengthMm,actionType:model.actionType,rows:modelVariants.length,officialUrl:page?.url,officialSpecs:context.spec,
    status:context.reason??'official-model-verified',checkedAt:page?.checkedAt}
  reviewedModels.push(modelRow)
  for (const variant of modelVariants) {
    const identity = {...modelRow,variantId:variant.id,color:variant.colorName,
      colorCode:colorParts(variant.colorName,variant.catalogEvidence?.colorCode).code,
      catalogJan:variant.catalogEvidence?.jan || undefined}
    const { officialSpecs, rows, status: modelStatus, ...base } = identity
    if (context.reason) {
      reviewedRows.push({...base,productStatus:'held',reason:context.reason})
      continue
    }
    const matching = cardSets.get(page.url).filter(card=>matchingColor(variant, card, page))
    const skuMatches = matching.map(card=>({card,sku:getSku(card,model,context)})).filter(x=>x.sku.identified)
    const filtered = skuMatches.filter(({sku})=>!base.catalogJan || sku.jan===base.catalogJan)
    const sameJan = filtered.length > 1 && !!filtered[0].sku.jan && filtered.every(({sku})=>sku.jan===filtered[0].sku.jan)
    if (filtered.length!==1 && !sameJan) {
      reviewedRows.push({...base,productStatus:'held',reason:!matching.length?'official-color-name-or-code-not-exact':
        !skuMatches.length?'official-color-variant-not-explicit':!filtered.length?'official-jan-missing-or-conflicting':'ambiguous-official-gallery-entry',
        colorCandidates:matching.map(({alt,label})=>({alt,label})), productCandidateKind:context.sharedPage?'shared-model-color-list':'model-color-list'})
      continue
    }
    const {card,sku}=filtered[0]
    reviewedRows.push({...base,officialSpecs,productStatus:'verified-activation-held',reason:'product-page-link-permission-not-obtained',
      productCandidateKind:context.sharedPage?'shared-model-color-list':'model-color-list',
      officialColor:card.alt,officialJan:sku.jan,colorVariantEvidence:card.label,
      image:sameJan ? { status:'held-ambiguous-gallery-image',
        candidateUrls:[...new Set(filtered.map(({card})=>card.url))],
        conditionsEvidence:termsUrl } : imageEvidence(card,sku,context)})
  }
}
if (reviewedRows.length!==variants.length || sha(await readFile(backup))!==sha(raw)) throw new Error('Backup or row coverage changed')
const matched = reviewedRows.filter(row=>row.productStatus==='verified-activation-held')
const stats = {backupSha256:sha(raw),models:models.length,modelsWithoutColors:reviewedModels.filter(m=>!m.rows).length,rows:variants.length,
  pages:cachedPages.length,matchedProductRows:matched.length,matchedProductPages:new Set(matched.map(row=>row.officialUrl)).size,
  productActivated:0,imageActivated:0,rawImageCandidates:matched.filter(r=>r.image?.candidateUrl).length,
  heldByReason:Object.fromEntries([...Map.groupBy(reviewedRows,row=>row.reason)].map(([reason,rows])=>[reason,rows.length]))}
await writeFile(directory+'TIMON_REVIEW.json',JSON.stringify({checkedAt:cachedPages.map(p=>p.checkedAt).sort().at(-1),termsUrl,stats,models:reviewedModels,rows:reviewedRows},null,2)+'\n')
console.log(stats)
