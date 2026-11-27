import 'fake-indexeddb/auto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { localTypeScript } from './load-local-typescript.mjs'

const backupPath = process.argv[2]
if (!backupPath) throw new Error('Pass the path to the device backup')
const raw = await readFile(backupPath)
const { data } = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
const output = 'docs/lure-external-links/'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const historical = JSON.parse(await readFile('docs/noa-retailer-product-links/IMAGE_RESTORATION_CHECKS.json', 'utf8'))
const health = JSON.parse(await readFile('docs/noa-retailer-product-links/AUDIT.json', 'utf8'))
const knownProducts = new Set(health.rows.flatMap(row => [row.productUrl, ...row.retainedOtherUrls.split(' | ')]).filter(Boolean))
const historicalChecks = new Map(historical.definitions.map(ref => [ref.imageUrl, ref]))
const loader = await localTypeScript()
const { db } = await loader.load('src/db/database.ts')
try {
  const { externalManufacturer } = await loader.load('src/utils/lureExternalCatalog.ts')
  const { imageReferenceForOption } = await loader.load('src/utils/noaPhotoCatalog.ts')
  const { resolveColorPhoto, currentPhotoCatalog } = await loader.load('src/utils/lurePhotos.ts')
  const { lureMasterManifest } = await loader.load('src/data/lureMasterManifest.ts')
  const makers = data.lureManufacturers.filter(m => externalManufacturer(m.name))
  const series = data.lureSeries.filter(s => makers.some(m => m.id === s.manufacturerId))
  const models = data.lureModels.filter(m => series.some(s => s.id === m.seriesId))
  const variants = data.lureVariants.filter(v => models.some(m => m.id === v.modelId))
  await db.open()
  await db.lureManufacturers.bulkAdd(makers)
  await db.lureSeries.bulkAdd(series)
  await db.lureModels.bulkAdd(models)
  await db.lureVariants.bulkAdd(variants)
  const rows = []
  const options = await currentPhotoCatalog()
  for (const option of options) {
    const variant = variants.find(v => v.id === option.variantId)
    const model = models.find(m => m.id === option.modelId)
    const resolved = await resolveColorPhoto(option)
    const image = imageReferenceForOption(option)
    const checkedImage = image && historicalChecks.get(image.imageUrl)
    const imageStatus = !image ? 'unreviewed' : !resolved?.imageReference ? 'held' : checkedImage?.status === 'success' ? 'historically-decoded' : 'decode-unverified'
    const urls = [resolved?.externalProductUrl, ...resolved?.additionalProductLinks.map(link => link.url) ?? []].filter(Boolean)
    rows.push({ manufacturer: externalManufacturer(option.manufacturerName), series: option.seriesName, model: option.modelName,
      weightG: model.weightG ?? '', lengthMm: model.lengthMm ?? '', actionType: model.actionType ?? '',
      buoyancy: variant.catalogEvidence?.buoyancy ?? '', rattle: variant.catalogEvidence?.rattle ?? '',
      variantId: option.variantId, modelId: option.modelId, color: option.colorName,
      colorCode: variant.catalogEvidence?.colorCode || resolved?.shared?.colorCode || '',
      productUrl: urls[0] ?? '', additionalProductUrls: urls.slice(1).join(' | '),
      productStatus: !urls.length ? 'unreviewed' : urls.every(url => knownProducts.has(url)) ? 'existing-reviewed' : 'existing-health-unverified',
      productEvidenceDate: urls.length && urls.every(url => knownProducts.has(url)) ? health.summary.checkedAt : '',
      imageUrl: image?.imageUrl ?? '', imageStatus, imageKind: image?.imageKind ?? '',
      imageEvidenceDate: checkedImage?.checkedAt ?? '', imageSourceName: image?.sourceName ?? '',
      imageHoldReason: imageStatus === 'held' ? checkedImage?.reason || 'Existing image policy hold' : '',
      sourceName: resolved?.sourceName ?? '',
      evidenceProductCandidate: variant.catalogEvidence?.productUrl ?? '',
      evidenceManufacturerCandidate: variant.catalogEvidence?.manufacturerUrl ?? '',
      evidenceRetailerCandidate: variant.catalogEvidence?.retailerUrl ?? '' })
  }
  const rollup = (label, list, modelCount) => {
    const product = list.filter(row => row.productUrl)
    const urls = product.flatMap(row => [row.productUrl, ...row.additionalProductUrls.split(' | ').filter(Boolean)])
    const image = list.filter(row => row.imageUrl)
    const display = list.filter(row => row.imageStatus === 'historically-decoded')
    const rate = count => list.length ? Number((100 * count / list.length).toFixed(2)) : null
    return { label, models: modelCount, rows: list.length, existingProductRows: product.length, newProductRows: 0,
      productOnlyRows: product.filter(row => !row.imageUrl).length, uniqueProductUrls: new Set(urls).size,
      repeatedProductUrlOccurrences: urls.length - new Set(urls).size,
      imageReferenceRows: image.length, uniqueImageUrls: new Set(image.map(row => row.imageUrl)).size,
      repeatedImageUrlOccurrences: image.length - new Set(image.map(row => row.imageUrl)).size,
      eligibleHistoricallyDecodedRows: display.length, heldImageRows: list.filter(row => row.imageStatus === 'held').length,
      unreviewedProductRows: list.length - product.length, unreviewedImageRows: list.length - image.length,
      productCoveragePercent: rate(product.length), displayCoveragePercent: rate(display.length) }
  }
  const inventory = makers.map(maker => {
    const name = externalManufacturer(maker.name)
    const parents = series.filter(s => s.manufacturerId === maker.id)
    const modelRows = models.filter(m => parents.some(s => s.id === m.seriesId))
    return { ...rollup(name, rows.filter(r => r.manufacturer === name), modelRows.length),
      series: parents.map(s => {
        const children = modelRows.filter(m => m.seriesId === s.id)
        return { ...rollup(s.name, rows.filter(r => children.some(m => m.id === r.modelId)), children.length),
          modelDetails: children.map(m => ({ modelId: m.id, weightG: m.weightG ?? null, lengthMm: m.lengthMm ?? null,
            ...rollup(m.name, rows.filter(r => r.modelId === m.id), 1) })) }
      }) }
  })
  const pages = new Map()
  function candidate(manufacturer, series, model, kind, url, origin) {
    if (!url) return
    const key = JSON.stringify([manufacturer, series, model, kind, url])
    if (!pages.has(key)) pages.set(key, { manufacturer, series, model, kind, url, origins: [], status: 'unreviewed' })
    const record = pages.get(key)
    if (!record.origins.includes(origin)) record.origins.push(origin)
  }
  for (const row of rows) {
    candidate(row.manufacturer, row.series, row.model, 'product', row.evidenceProductCandidate, 'backup-product')
    candidate(row.manufacturer, row.series, row.model, 'product', row.evidenceManufacturerCandidate, 'backup-manufacturer')
    candidate(row.manufacturer, row.series, row.model, 'product', row.evidenceRetailerCandidate, 'backup-retailer')
  }
  for (const target of lureMasterManifest.targets) {
    const manufacturer = externalManufacturer(target.manufacturer)
    if (!manufacturer) continue
    for (const color of target.colors) {
      candidate(manufacturer, target.series, target.model, 'product', color.sourceUrl, 'manifest-source')
      candidate(manufacturer, target.series, target.model, 'product', color.manufacturerUrl, 'manifest-manufacturer')
      candidate(manufacturer, target.series, target.model, 'product', color.retailerUrl, 'manifest-retailer')
      candidate(manufacturer, target.series, target.model, 'image', color.imageUrl, 'manifest-appearance-evidence')
    }
  }
  const csv = list => {
    if (!list.length) return ''
    const keys = Object.keys(list[0])
    return '\uFEFF' + [keys, ...list.map(row => keys.map(k => row[k]))].map(line =>
      line.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\n') + '\n'
  }
  if (rows.length !== variants.length || digest(await readFile(backupPath)) !== digest(raw)) throw new Error('Inventory or backup integrity check failed')
  await mkdir(output, { recursive: true })
  const write = (name, value) => writeFile(output + name, JSON.stringify(value, null, 2) + '\n')
  await write('INVENTORY.json', { backupSha256: digest(raw), imageEvidenceDate: historical.checkedAt, total: rollup('all', rows, models.length), manufacturers: inventory })
  await writeFile(output + 'ALL_COLORS.csv', csv(rows))
  await write('SOURCE_PAGES.json', [...pages.values()])
  const identity = ({ manufacturer, series, model, variantId, color }) => ({ manufacturer, series, model, variantId, color })
  await write('VERIFIED_LINKS.json', rows.filter(row => row.productStatus === 'existing-reviewed').map(row => ({
    ...identity(row), url: row.productUrl, additionalUrls: row.additionalProductUrls.split(' | ').filter(Boolean),
    sourceName: row.sourceName, checkedAt: row.productEvidenceDate,
  })))
  const imageRows = rows.filter(row => row.imageUrl).map(row => ({ ...identity(row), url: row.imageUrl,
    status: row.imageStatus, kind: row.imageKind, sourceName: row.imageSourceName,
    checkedAt: row.imageEvidenceDate, holdReason: row.imageHoldReason,
  }))
  await write('IMAGE_CHECKS.json', imageRows)
  await write('HELD.json', imageRows.filter(row => row.status === 'held'))
  console.log(inventory.map(({ label, models, rows, existingProductRows, eligibleHistoricallyDecodedRows }) =>
    ({ label, models, rows, existingProductRows, eligibleHistoricallyDecodedRows })))
} finally {
  db.close()
  await db.delete()
  await loader.close()
}
