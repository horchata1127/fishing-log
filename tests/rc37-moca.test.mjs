import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'

const loader = await localTypeScript()
const { db } = await loader.load('src/db/database.ts')
const { rc37Fixture } = await loader.load('tests/rc37Fixture.ts')
const { lureMasterManifest } = await loader.load('src/data/lureMasterManifest.ts')
const { planLureMaster } = await loader.load('src/utils/lureMasterPlanner.ts')
const { createLureMasterUpdater } = await loader.load('src/utils/lureMasterApply.ts')
const { createBackup, importBackup, validateBackup } = await loader.load('src/utils/backup.ts')
const manifest = { ...lureMasterManifest, targets: lureMasterManifest.targets.filter(t => t.revisions.includes('RC37')), pending: [] }
const snapshot = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
const preserve = (before, after) => {
  for (const [table, rows] of Object.entries(before)) {
    if (!['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'lureMasterImportHistory'].includes(table)) assert.deepEqual(after[table], rows, table)
    else for (const row of rows) assert.deepEqual(after[table].find(x => x.id === row.id), row, `${table}/${row.id}`)
  }
}
beforeEach(async () => { await db.delete(); await db.open(); await importBackup({ text: async () => JSON.stringify(rc37Fixture()) }) })
after(async () => { db.close(); await db.delete(); await loader.close() })

test('audited source adds exactly 10 models/180 colors; preserves all records, MVP, colors, IDs and profiles; repeat adds zero', async () => {
  const before = await snapshot(), u = createLureMasterUpdater(db, manifest), p = await u.preview()
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual([p.addedModels, p.addedColors, p.retainedColors, p.heldColors], [10, 180, 9, 14])
  await u.apply(p.comparisonToken)
  const saved = await snapshot(); preserve(before, saved)
  assert.equal(saved.lureVariants.filter(v => v.catalogEvidence?.revision === 'RC37').length, 180)
  assert.ok(saved.lureVariants.filter(v => v.catalogEvidence?.revision === 'RC37').every(v => v.catalogEvidence.verified &&
    v.catalogEvidence.checkedAt === '2026-11-03' && v.catalogEvidence.verificationStatus === 'retailer-confirmed' &&
    v.catalogEvidence.retailerUrl.startsWith('https://') && !v.catalogEvidence.manufacturerUrl))
  assert.ok(!saved.lureVariants.some(v => v.colorName.includes('暫定')))
  assert.equal(saved.lureModels.find(m => m.id === 128).name, 'MOCA DR Rattle 2HOOK')
  const again = await u.apply((await u.preview()).comparisonToken)
  assert.ok(Object.values(again.counts).every(c => c.added === 0))
  preserve(saved, await snapshot())
})

test('backup v11 round trip preserves RC37 evidence and existing data; legacy v4 is still accepted', async () => {
  const u = createLureMasterUpdater(db, manifest); await u.apply((await u.preview()).comparisonToken)
  const saved = await snapshot(), exported = await createBackup()
  assert.equal(exported.version, 11); validateBackup(JSON.parse(JSON.stringify(exported)))
  await importBackup({ text: async () => JSON.stringify(exported) }); preserve(saved, await snapshot())
  assert.equal((await u.preview()).addedColors, 0)
  const legacy = rc37Fixture(); legacy.version = 4; delete legacy.data.trips[0].summaryMvp
  for (const key of ['lureVisualProfiles', 'temporaryLureColors', 'lureMasterImportHistory', 'fishSpecies', 'facilities', 'zones', 'appMetadata', 'tripWeatherLocations', 'tripWeatherHours', 'tripWeatherRequests']) delete legacy.data[key]
  validateBackup(legacy)
})

test('F/SS rattle identity stays ambiguous independent of weight; clean source can distinguish both products', async () => {
  const s = await snapshot(), rattle = manifest.targets.filter(t => t.model.startsWith('MOCA DR-') && t.rattle === 'rattle')
  for (const weight of [undefined, 2.1, 2.4]) {
    const copy = structuredClone(s); copy.lureModels.find(m => m.id === 128).weightG = weight
    assert.equal(planLureMaster(copy, {}, { ...manifest, targets: rattle }).heldColors, 14)
  }
  s.lureModels = s.lureModels.filter(m => m.id !== 128); s.lureVariants = s.lureVariants.filter(v => v.modelId !== 128)
  const p = planLureMaster(s, {}, { ...manifest, targets: rattle })
  assert.deepEqual([p.addedModels, p.addedColors, p.heldColors], [2, 14, 0])
})

test('same color code on different products is distinct; explicit code/name and limited-class conflicts hold whole product', async () => {
  const s = await snapshot(), t = manifest.targets.find(t => t.model === 'MOCA SR-SS'), one = { ...manifest, targets: [t] }
  assert.equal(planLureMaster(s, {}, one).addedColors, 2)
  const conflicting = structuredClone(s); conflicting.lureVariants.find(v => v.id === 327).colorName = '#34 別の色'
  assert.equal(planLureMaster(conflicting, {}, one).heldColors, t.colors.length)
  const limited = structuredClone(s); limited.lureVariants.find(v => v.id === 327).catalogEvidence = { colorClass: 'shop-limited' }
  assert.equal(planLureMaster(limited, {}, one).heldColors, t.colors.length)
  const newColor = structuredClone(s); newColor.lureVariants.find(v => v.id === 327).colorName = '#99 19早乙女'
  assert.equal(planLureMaster(newColor, {}, one).heldColors, t.colors.length)
})

const privateBackup = 'docs/rc37/RC36_fishing-log-backup-2026-11-03.json'
test('local full RC36 backup: every existing table row preserved and new catalog survives export/restore', { skip: !existsSync(privateBackup) }, async () => {
  const original = await readFile(privateBackup, 'utf8')
  await importBackup({ text: async () => original })
  const before = await snapshot(), u = createLureMasterUpdater(db, manifest)
  await u.apply((await u.preview()).comparisonToken); const saved = await snapshot(); preserve(before, saved)
  const exported = await createBackup(); assert.ok(exported.version >= 9); validateBackup(JSON.parse(JSON.stringify(exported)))
  await importBackup({ text: async () => JSON.stringify(exported) }); preserve(saved, await snapshot())
  assert.equal((await u.preview()).addedColors, 0)
})
