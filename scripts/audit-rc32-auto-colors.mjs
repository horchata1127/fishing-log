import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createRc32Runtime } from './lib/rc32Runtime.mjs'

const args = process.argv.slice(2), input = args[args.indexOf('--input') + 1]
if (!args.includes('--input') || !input) throw new Error('Usage: node scripts/audit-rc32-auto-colors.mjs --input <exported catalog/backup JSON> [--through-rc31]')
const source = JSON.parse(await readFile(input, 'utf8')), tableNames = ['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants']
// Only these four public catalog arrays enter the isolated test DB. Personal arrays are not imported.
const catalog = Object.fromEntries(tableNames.map(name => {
  if (!Array.isArray(source.data?.[name])) throw new Error(`Missing catalog array: ${name}`)
  return [name, source.data[name]]
}))
const runtime = await createRc32Runtime(), { db } = runtime.database
try {
  for (const name of tableNames) await db.table(name).bulkAdd(catalog[name])
  const deltas = []
  if (args.includes('--through-rc31')) {
    for (const [version, preview, apply] of [['RC30', runtime.rc30.previewRc30Catalog, runtime.rc30.applyRc30Catalog], ['RC31', runtime.rc31.previewRc31Catalog, runtime.rc31.applyRc31Catalog]]) {
      const p = await preview(); await apply(p.comparisonToken)
      deltas.push({ version, added: p.addedColors, held: p.pendingColors })
    }
  }
  const beforeCatalog = Object.fromEntries(await Promise.all(tableNames.map(async n => [n, await db.table(n).toArray()])))
  const preview = await runtime.importer.previewAutoColors()
  const started = performance.now(); await runtime.importer.applyAutoColors(preview.comparisonToken)
  const elapsedMs = Math.round(performance.now() - started), repeated = await runtime.importer.previewAutoColors()
  await runtime.importer.applyAutoColors(repeated.comparisonToken)
  const backup = await runtime.backup.createBackup()
  await runtime.backup.importBackup(new File([JSON.stringify(backup)], 'synthetic-catalog-only-v8.json'))
  const catalogUnchanged = (await Promise.all(tableNames.map(async n => JSON.stringify(await db.table(n).toArray()) === JSON.stringify(beforeCatalog[n])))).every(Boolean)
  const nameInferences = preview.rows.filter(r => r.inference).length
  const metadataImages = runtime.data22.rc22Catalog.flatMap(t => t.colors).filter(c => c.imageUrl).length
  const groups = new Map()
  for (const row of preview.rows) {
    const key = JSON.stringify([row.manufacturer, row.series, row.model])
    const g = groups.get(key) ?? { manufacturer: row.manufacturer, series: row.series, model: row.model, total: 0, name: 0, unknown: 0 }
    g.total++; if (row.inference) g.name++; else g.unknown++; groups.set(key, g)
  }
  const report = { input: input.replaceAll('\\', '/'), inputCatalogSha256: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),
    isolation: 'fake-indexeddb; catalog arrays only; no browser DB or personal arrays restored', catalogDeltas: deltas,
    catalogCounts: Object.fromEntries(tableNames.map(n => [n, beforeCatalog[n].length])),
    total: preview.total, uniqueNames: preview.uniqueNames, nameInferences, photoInferences: 0, unknown: preview.total - nameInferences,
    uniqueNormalizedNames: new Set(preview.rows.map(r => runtime.inference.normalizeColorName(r.colorName))).size,
    attributeOnly: preview.rows.filter(r => r.inference && r.inference.appearance.regions.whole?.colors.length === 0).length,
    bundledImageUrlMetadata: metadataImages, verifiedPhotoInputs: 0,
    methods: { explicitTerms: preview.rows.filter(r => r.inference && !r.inference.basis.some(b => b.startsWith('conventional:'))).length,
      conventionalTerms: preview.rows.filter(r => r.inference?.basis.some(b => b.startsWith('conventional:'))).length, photo: 0, unknown: preview.total - nameInferences },
    confidenceCounts: Object.fromEntries([0.85, 0.65, 0.55].map(n => [String(n), preview.rows.filter(r => r.inference?.confidence === n).length])),
    firstApply: { added: preview.added, kept: preview.kept, protected: preview.protected, held: preview.held, unknown: preview.unknown, elapsedMs },
    secondApply: { added: repeated.added, kept: repeated.kept, protected: repeated.protected, held: repeated.held, unknown: repeated.unknown },
    profilesAfterRestore: await db.lureVisualProfiles.count(), backupVersion: backup.version, catalogUnchanged,
    heldReasons: Object.fromEntries([...new Set(preview.rows.filter(r => r.action === 'hold').map(r => r.reason))].map(reason => [reason, preview.rows.filter(r => r.action === 'hold' && r.reason === reason).length])),
    personalCounts: { myLures: await db.myLures.count(), catches: await db.catches.count(), trips: await db.trips.count() },
    byModel: [...groups.values()] }
  const out = resolve('docs/rc32'); await mkdir(out, { recursive: true })
  await writeFile(resolve(out, 'RC32_PHASE4_CATALOG_AUDIT.json'), JSON.stringify(report, null, 2) + '\n')
  const cell = v => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
  const rows = preview.rows.map(r => [r.manufacturer, r.series, r.model, r.colorName, r.colorCode, r.inference ? 'name' : 'unknown',
    r.inference?.appearance.regions.whole?.colors.join('|'), r.inference?.appearance.regions.whole?.attributes.join('|'), r.inference?.confidence, r.reason, r.inference?.basis.join('|'), r.action])
  await writeFile(resolve(out, 'RC32_PHASE4_CATALOG_AUDIT.csv'), '\uFEFF' + [['manufacturer','series','model','officialColor','colorCode','method','colors','attributes','confidence','reason','basis','action'], ...rows].map(r => r.map(cell).join(',')).join('\r\n'))
  const { byModel, ...summary } = report; console.log(JSON.stringify(summary, null, 2))
} finally { await runtime.dispose() }
