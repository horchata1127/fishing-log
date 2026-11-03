import 'fake-indexeddb/auto'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { localTypeScript } from './load-local-typescript.mjs'

const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/audit-moca-catalog.mjs BACKUP.json [OUTPUT.json]')
const bytes = await readFile(input), source = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
const loader = await localTypeScript()
try {
  const { lureMasterManifest } = await loader.load('src/data/lureMasterManifest.ts')
  const { planLureMaster } = await loader.load('src/utils/lureMasterPlanner.ts')
  const targets = lureMasterManifest.targets.filter(t => t.revisions.includes('RC37'))
  const snapshot = Object.fromEntries(['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures', 'lureVisualProfiles'].map(k => [k, source.data[k] ?? []]))
  const plan = planLureMaster(snapshot, {}, { ...lureMasterManifest, targets, pending: lureMasterManifest.pending.filter(p => p.revision === 'RC37') })
  const makers = source.data.lureManufacturers.filter(m => /rodio|ロデオ/i.test(m.name))
  const series = source.data.lureSeries.filter(s => makers.some(m => m.id === s.manufacturerId) && /moca|モカ/i.test(s.name) && !/mocaron|モカロン/i.test(s.name))
  const models = source.data.lureModels.filter(m => series.some(s => s.id === m.seriesId))
  const variants = source.data.lureVariants.filter(v => models.some(m => m.id === v.modelId))
  const owned = source.data.myLures.filter(m => variants.some(v => v.id === m.variantId))
  const audit = { checkedAt: '2026-11-03', inputSha256: createHash('sha256').update(bytes).digest('hex'), backupVersion: source.version,
    existing: { manufacturers: makers, series, models, variants, owned,
      visualProfiles: (source.data.lureVisualProfiles ?? []).filter(p => variants.some(v => v.id === p.variantId)) },
    totals: { existingModels: models.length, existingColors: variants.length, owned: owned.length,
      addedModels: plan.addedModels, addedColors: plan.addedColors, retainedColors: plan.retainedColors, heldColors: plan.heldColors },
    targets: targets.map(t => ({ model: t.model, sourceUrl: t.sourceUrl, weight: t.weight, buoyancy: t.buoyancy, rattle: t.rattle,
      rows: plan.rows.filter(r => r.targetKey === t.key).map(r => ({ code: r.color.code, name: r.color.label, action: r.catalog, existingId: r.existingId, reason: r.reason })) })), pending: plan.pending }
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(audit, null, 2) + '\n')
  console.log(JSON.stringify({ totals: audit.totals, targets: audit.targets.map(t => ({ model: t.model, colors: t.rows.length, added: t.rows.filter(r => r.action === 'add').length, kept: t.rows.filter(r => r.action === 'keep').length, held: t.rows.filter(r => r.action === 'hold').length })) }))
} finally { await loader.close() }
