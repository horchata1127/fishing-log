import { catalogFingerprint, sha256 } from './catalog-audit-fingerprint.mjs'
import { readFile, readdir, writeFile } from 'node:fs/promises'

const [backupPath] = process.argv.slice(2)
if (!backupPath) throw new Error('Pass the read-only device backup path')
const cache = '.rc50-palms.local/'
const output = 'docs/lure-external-links/'
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const raw = await readFile(backupPath)
const { data } = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
const policy = (await readJson(output + 'SOURCE_POLICIES.json')).sources.palms
if (policy.product !== 'plain-link') throw new Error('No reviewed product linking policy')
const pages = await Promise.all((await readdir(cache)).filter(name => name.endsWith('.json')).sort()
  .map(name => readJson(cache + name)))
const byUrl = new Map(pages.map(page => [page.url, page]))
const maker = data.lureManufacturers.find(row => row.name === 'PALMS')
const series = new Map(data.lureSeries.filter(row => row.manufacturerId === maker.id).map(row => [row.id, row.name]))
const normalize = value => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
const colorsByPage = new Map()
for (const page of pages.filter(page => page.httpStatus === 200)) {
  const location = new URL(page.url)
  const gallery = '/lures/product/' + location.searchParams.get('name') + '/color/'
  const colors = page.images.flatMap(image => {
    const url = new URL(image.url)
    const label = image.labels.find(Boolean)?.replace(/^New\s+/i, '')
    const match = label?.match(/^(.+)\s+([A-Z]+-?\d+[A-Z]?)$/)
    return url.origin === location.origin && url.pathname.startsWith(gallery) && match
      ? [{ name: match[1], code: match[2], url: image.url }] : []
  })
  colorsByPage.set(page.url, colors)
}

// T-4A appeared as かるべね in the earlier official Galette page (also indexed by web search).
// The current official page uses かべるね for the same GL-31F and T-4A combination.
const isGaletteRename = (model, code, previous, current) =>
  model === 'GL-31F' && code === 'T-4A' && previous === 'かるべね' && current === 'かべるね'

const rows = [], models = [], groups = new Map()
for (const model of data.lureModels.filter(row => series.has(row.seriesId))) {
  const variants = data.lureVariants.filter(row => row.modelId === model.id)
  const seriesName = series.get(model.seriesId)
  const modelUrls = [...new Set(variants.map(row => row.catalogEvidence?.manufacturerUrl))]
  const page = modelUrls.length === 1 ? byUrl.get(modelUrls[0]) : undefined
  const colors = colorsByPage.get(page?.url) ?? []
  const specs = page?.tables?.flatMap(table => table.rows).map(([name, length, weight, palette, buoyancy]) =>
    ({ name: name?.replace(/^New\s+/i, ''), lengthMm: Number(length?.replace(/mm$/, '')),
      weightG: Number(weight?.replace(/g$/, '')), colorCount: Number(palette?.replace(/色$/, '')), buoyancy })) ?? []
  const spec = specs.find(item => item.name === model.name && item.lengthMm === model.lengthMm && item.weightG === model.weightG)
  const sharedGallery = specs.length === 2 && specs.every(item => ['GA-24S', 'GA-24HS'].includes(item.name) &&
    item.colorCount === colors.length)
  models.push({ modelId: model.id, series: seriesName, model: model.name, colorRows: variants.length,
    candidateUrl: page?.url, spec, modelStatus: spec ? 'spec-matched' : 'spec-unconfirmed' })
  for (const variant of variants) {
    const evidence = variant.catalogEvidence
    const code = evidence?.colorCode
    const name = evidence?.originalName
    const verifiedSpec = !!spec && spec.buoyancy === evidence?.buoyancy && spec.lengthMm === evidence?.lengthMm &&
      spec.weightG === evidence?.weightG && !evidence?.rattle && spec.colorCount === colors.length &&
      (specs.length === 1 || sharedGallery)
    const matches = verifiedSpec && code && name && normalize(variant.colorName) === normalize(code + ' ' + name)
      ? colors.filter(color => color.code === code &&
        (normalize(color.name) === normalize(name) || isGaletteRename(model.name, code, name, color.name))) : []
    const match = matches.length === 1 ? matches[0] : undefined
    const row = { variantId: variant.id, modelId: model.id, series: seriesName, model: model.name, color: variant.colorName,
      colorCode: code, candidateUrl: page?.url, checkedAt: page?.checkedAt ?? policy.checkedAt,
      status: match ? 'matched' : 'held', reason: match ? undefined : !verifiedSpec ? 'official-model-spec-unconfirmed' : 'exact-color-match-unconfirmed' }
    if (match) {
      const modelDetails = { weightG: model.weightG, lengthMm: model.lengthMm, actionType: model.actionType, buoyancy: evidence.buoyancy }
      const productUrl = page.url + (page.colorAnchor ? '#color' : '')
      const basis = [model.name, spec.weightG + 'g', spec.lengthMm + 'mm', spec.buoyancy,
        code + ' ' + match.name, ...(isGaletteRename(model.name, code, name, match.name) ? ['旧公式表記: ' + name] : [])].join(' / ')
      Object.assign(row, { productUrl, kind: 'model-color-list', sourceName: 'PALMS', basis, officialColorName: match.name,
        image: { url: match.url, kind: sharedGallery ? 'weight-common-color-sample' : 'official-color-sample',
          conditions: 'held', reason: 'image-display-permission-unconfirmed' } })
      if (!groups.has(model.id)) groups.set(model.id, { seriesName, modelName: model.name, modelDetails,
        url: productUrl, checkedAt: page.checkedAt, colors: [] })
      groups.get(model.id).colors.push([variant.colorName, code, basis])
    }
    rows.push(row)
  }
}

const stats = { backupSha256: sha256(raw), catalogSha256: catalogFingerprint(data), series: series.size, models: models.length,
  colorRows: rows.length, productPagesReviewed: pages.length, matchedProductRows: rows.filter(row => row.productUrl).length,
  heldProductRows: rows.filter(row => !row.productUrl).length }
await writeFile(output + 'PALMS_REVIEW.json', JSON.stringify({ checkedAt: policy.checkedAt,
  policyReviewUrls: policy.policyReviewUrls, stats,
  pages: pages.map(({ url, httpStatus, checkedAt, sha256 }) => ({ url, httpStatus, checkedAt, sha256 })),
  models, rows }, null, 2) + '\n')

const definitions = [...groups.values()].map(({ colors, ...group }) => '  ' + JSON.stringify(group).slice(0, -1) +
  ', "colors": [\n' + colors.map(color => '    ' + JSON.stringify(color)).join(',\n') + '\n  ]}').join(',\n')
const referencePath = 'src/data/palmsExternalReferences.ts'
const references = [
  '// Generated by scripts/match-palms-rc50.mjs.',
  "import type { ExternalModelDetails, LureExternalReference } from './lureExternalReferences'", '',
  'const groups: readonly { seriesName: string; modelName: string; modelDetails: ExternalModelDetails; url: string;',
  '  checkedAt: string; colors: readonly (readonly [name: string, code: string, basis: string])[] }[] = [',
  definitions, ']', '',
  'export const palmsExternalReferences: readonly LureExternalReference[] = groups.flatMap(group =>',
  '  group.colors.map(([colorName, colorCode, verificationBasis]) => ({',
  "    manufacturerName: 'PALMS', seriesName: group.seriesName, modelName: group.modelName,",
  '    modelDetails: group.modelDetails, colorName, colorCode,',
  "    product: { url: group.url, verified: true, kind: 'model-color-list' },",
  "    sourceName: 'PALMS', sourceType: 'manufacturer', checkedAt: group.checkedAt,",
  '    evidenceUrl: group.url, verificationBasis,',
  '  })))', '',
].join('\n')
const previous = await readFile(referencePath, 'utf8').catch(error => {
  if (error.code !== 'ENOENT') throw error
})
if (previous?.replaceAll('\r\n', '\n') !== references) await writeFile(referencePath, references)
console.log(stats)
