import { backupFingerprints } from './catalog-audit-fingerprint.mjs'
import { readFile, readdir, writeFile } from 'node:fs/promises'

const [backupPath] = process.argv.slice(2)
if (!backupPath) throw new Error('Pass the read-only device backup path')
const audit = 'docs/lure-external-links/'
const cache = '.rc49-smith.local/'
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
const raw = await readFile(backupPath)
const backup = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
const { data } = backup
const pages = await Promise.all((await readdir(cache)).filter(name => name.endsWith('.html.json'))
  .sort().map(name => readJson(cache + name)))
const bySlug = new Map(pages.map(page => [new URL(page.url).pathname.split('/').at(-1).replace(/\.html$/, ''), page]))
const { url: termsUrl, checkedAt } = bySlug.get('201308-attetion')
const va = await readJson(cache + 'va-product.local.json')
const vaTerms = 'https://velvetarts.co.jp/policies/terms-of-service'
const vaSpecUrl = 'https://velvetarts.co.jp/pages/vapuppetsurface'
const maker = data.lureManufacturers.find(row => row.name === 'SMITH')
const series = new Map(data.lureSeries.filter(row => row.manufacturerId === maker.id).map(row => [row.id, row.name]))

// Exact catalog variants and the manufacturer pages that identify them.
// Each shared gallery follows the listed specifications for all mapped variants.
const bindings = new Map([
  ['STILL AREA 48HF', ['stillarea48hf', 'ハイフローティング']],
  ['STILL AREA T2', ['stillareat2', 'フローティング']],
  ['STILL AREA TUNE', ['stillarea', 'フローティング']],
  ['Puppet More', ['puppetmore', 'ハイフローティング']],
  ['PUPPET SURFACE', ['puppetsurface', 'ハイフローティング']],
  ['CALMO MR-F', ['calmo', 'フローティング ウェイトシール外貼り']],
  ['Large ZURUBEE', ['zurubee']],
  ['Small ZURUBEE', ['zurubee']],
  ['TICTAC LIPPER HS', ['tictaclipper', 'ヘビーシンキング']],
  ['TICTAC LIPPER S', ['tictaclipper', 'シンキング']],
  ['PANISH AREA 55R', ['panisharear', 'フローティング']],
  ['PANISH AREA 70R', ['panisharear', 'フローティング']],
  ['DD PANISH AREA 55R', ['ddpanisharear', 'フローティング']],
  ['DD PANISH AREA 65R', ['ddpanisharear', 'フローティング']],
  ['HIKINAMI F', ['hikinami', 'フローティング']],
  ['HIKINAMI HF', ['hikinami', 'ハイフローティング']],
  ['HIKARU! KOIKACHAN', ['hikarukoikachan', 'シンキング']],
  ['Caddis', ['caddis', 'フローティング']],
  ['AR-S SH 1.5g', ['arssh']],
  ['AR-S SH 2.0g', ['arssh']],
  ['くるん タイプ1', ['kurun']],
])
const zeroColorSources = new Map([
  ['PANISH', 'panish'], ['Drop Dia', 'dropdia'], ['Dangouo', 'dangouo'],
  ['DANGO UO', 'dangouo'], ['Daibisen', 'daibisen'], ['Bottom Knock Swimmer', 'btkswimmer'],
])
const normalize = value => value.normalize('NFKC').replace(/\s/g, '').toLowerCase()
function colorLabel(input) {
  const label = input.normalize('NFKC').trim().replace(/^(?:(?:NEW|[★☆])\s*)+/i, '')
  const numbered = label.match(/^#?(\d+)[.:\s]+(.+)$/)
  return { name: numbered?.[2].trim() ?? label, code: numbered?.[1] ?? '' }
}
function gallery(page) {
  return page.images.filter(image => image.parents.includes('pro_content_color')).flatMap(image => {
    const label = [...new Set(image.near)].sort((a, b) => a.length - b.length).find(value => value.trim())
    if (!label || new URL(image.url).origin !== new URL(page.url).origin) return []
    const color = colorLabel(label)
    return color.name ? [{ ...color, url: image.url }] : []
  })
}
function specFor(model, page, type) {
  const specs = page.tables.flatMap(table => {
    const fields = Object.fromEntries(table)
    const weight = fields.WEIGHT?.match(/^(\d+(?:\.\d+)?)g\b/)
    const length = (fields.LENGTH ?? fields['BODY LENGTH'])?.match(/^(\d+(?:\.\d+)?)mm\b/)
    if (!weight || !length) return []
    return [{ weightG: Number(weight[1]), lengthMm: Number(length[1]), type: fields.TYPE ?? '' }]
  })
  const matched = specs.filter(spec => spec.weightG === model.weightG && spec.lengthMm === model.lengthMm &&
    (type === undefined || spec.type === type))
  return matched.length === 1 ? { ...matched[0], sharedGallery: specs.length > 1 } : undefined
}

const rows = [], models = [], groups = new Map()
for (const model of data.lureModels.filter(row => series.has(row.seriesId))) {
  const variants = data.lureVariants.filter(row => row.modelId === model.id)
  const seriesName = series.get(model.seriesId)
  const [slug, type] = bindings.get(model.name) ?? []
  const isCollaboration = model.name === 'VA PUPPET SURFACE' && model.lengthMm === 31 && model.weightG === undefined
  const page = isCollaboration ? va : bySlug.get(slug)
  const spec = isCollaboration && va.httpStatus === 200 && va.title === 'VAパペットサーフェス'
    ? { weightG: 1.4, lengthMm: 31, type: '表層用／ラトルあり', sharedGallery: false }
    : page?.httpStatus === 200 && !isCollaboration ? specFor(model, page, type) : undefined
  const colors = !spec ? [] : isCollaboration ? va.variants.flatMap(variant => {
    const color = colorLabel(variant.title)
    if (!color.code || !variant.imageUrl?.startsWith('https://cdn.shopify.com/s/files/1/0666/0089/4752/')) return []
    return [{ ...color, url: variant.imageUrl, variantUrl: va.url + '?variant=' + variant.id }]
  }) : gallery(page)
  const zeroColorPage = bySlug.get(zeroColorSources.get(seriesName))
  models.push({ modelId: model.id, series: seriesName, model: model.name, weightG: model.weightG ?? null,
    lengthMm: model.lengthMm ?? null, colorRows: variants.length, candidateUrl: page?.url ?? zeroColorPage?.url,
    modelStatus: variants.length ? spec ? 'spec-matched' : 'spec-unconfirmed' : 'no-registered-colors', spec })
  for (const variant of variants) {
    const { name, code } = colorLabel(variant.colorName)
    const evidence = variant.catalogEvidence
    const expectedCode = evidence?.colorCode || code
    const candidates = colors.filter(color => normalize(color.name) === normalize(name) &&
      (!expectedCode || color.code && Number(expectedCode) === Number(color.code)))
    const match = candidates.length === 1 ? candidates[0] : undefined
    const row = { variantId: variant.id, modelId: model.id, series: seriesName, model: model.name, color: variant.colorName,
      checkedAt: page?.checkedAt ?? checkedAt, candidateUrl: page?.url, status: match ? 'matched' : 'held',
      reason: match ? undefined : !page ? 'official-exact-model-page-unconfirmed' : !spec ? 'official-model-spec-unconfirmed'
        : candidates.length > 1 ? 'official-color-ambiguous' : 'exact-color-name-and-code-not-confirmed' }
    if (match) {
      const modelDetails = { weightG: model.weightG, lengthMm: model.lengthMm, actionType: model.actionType,
        buoyancy: evidence?.buoyancy, rattle: evidence?.rattle }
      if (modelDetails.buoyancy || modelDetails.rattle) throw new Error('Verify catalog variant buoyancy or rattle against the source before adoption')
      const basis = [model.name, spec.weightG + 'g', spec.lengthMm + 'mm', spec.type, [match.code, match.name].filter(Boolean).join(' ')].filter(Boolean).join(' / ')
      const productUrl = match.variantUrl ?? page.url
      const kind = match.variantUrl ? 'individual-color' : 'model-color-list'
      const sourceName = isCollaboration ? 'SMITH × VELVET ARTS' : 'SMITH'
      const conditionsEvidence = isCollaboration ? vaTerms : termsUrl
      Object.assign(row, { productUrl, kind, basis, colorCode: match.code, sourceName, conditionsEvidence,
        ...(isCollaboration ? { specEvidenceUrl: vaSpecUrl } : {}), image: {
        url: match.url, kind: isCollaboration ? 'product-photo' : spec.sharedGallery ? 'weight-common-color-sample' : 'official-color-sample',
        conditions: 'held', reason: 'image-display-permission-unconfirmed',
      } })
      const key = JSON.stringify([seriesName, model.name, modelDetails, productUrl])
      if (!groups.has(key)) groups.set(key, { seriesName, modelName: model.name, modelDetails,
        url: productUrl, kind, sourceName, conditionsEvidence, checkedAt: page.checkedAt, colors: [] })
      groups.get(key).colors.push([variant.colorName, match.code, basis])
    }
    rows.push(row)
  }
}

const stats = { ...backupFingerprints(raw, backup), series: series.size,
  models: models.length, colorRows: rows.length, zeroColorModels: models.filter(model => !model.colorRows).length,
  productPagesReviewed: pages.filter(page => new URL(page.url).pathname.startsWith('/product/')).length + 2,
  matchedProductRows: rows.filter(row => row.status === 'matched').length,
  heldProductRows: rows.filter(row => row.status === 'held').length,
}
await writeFile(audit + 'SMITH_REVIEW.json', JSON.stringify({ checkedAt, termsUrl, stats,
  pages: [...pages, va, { url: vaSpecUrl, httpStatus: 200, checkedAt }].map(({ url, httpStatus, checkedAt, sha256 }) => ({ url, httpStatus, checkedAt, sha256 })),
  models, rows }, null, 2) + '\n')

const definitions = [...groups.values()].map(({ colors, ...group }) =>
  '  ' + JSON.stringify(group).slice(0, -1) + ', "colors": [\n' +
  colors.map(color => '    ' + JSON.stringify(color)).join(',\n') + '\n  ]}').join(',\n')
await writeFile('src/data/smithExternalReferences.ts', [
  '// Generated by scripts/match-smith-rc49.mjs.',
  "import type { ExternalModelDetails, LureExternalReference } from './lureExternalReferences'", '',
  'const groups: readonly { seriesName: string; modelName: string; modelDetails: ExternalModelDetails; url: string;',
  "  kind: 'individual-color' | 'model-color-list'; sourceName: string; conditionsEvidence: string;",
  '  checkedAt: string; colors: readonly (readonly [name: string, code: string, basis: string])[] }[] = [',
  definitions, ']', '',
  'export const smithExternalReferences: readonly LureExternalReference[] = groups.flatMap(group =>',
  '  group.colors.map(([colorName, colorCode, verificationBasis]) => ({',
  "    manufacturerName: 'SMITH', seriesName: group.seriesName, modelName: group.modelName,",
  '    modelDetails: group.modelDetails, colorName, colorCode,',
  '    product: { url: group.url, verified: true, kind: group.kind, conditionsEvidence: group.conditionsEvidence },',
  "    sourceName: group.sourceName, sourceType: 'manufacturer', checkedAt: group.checkedAt,",
  '    evidenceUrl: group.url, verificationBasis,',
  '  })))', '',
].join('\n'))
console.log(stats)
