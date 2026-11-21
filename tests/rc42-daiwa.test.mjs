import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'

const loader = await localTypeScript()
const { db, visualIdentityForVariant, visualNaturalKey } = await loader.load('src/db/database.ts')
const { rc42Audit, rc42Fixture, rc42ComparisonManifest } = await loader.load('tests/rc42Fixture.ts')
const { planLureMaster } = await loader.load('src/utils/lureMasterPlanner.ts')
const { createLureMasterUpdater } = await loader.load('src/utils/lureMasterApply.ts')
const { createBackup, importBackup } = await loader.load('src/utils/backup.ts')
const manifest = rc42ComparisonManifest()
const snapshot = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])) )
function equalRestored(saved, restored) {
  for (const table of Object.keys(saved)) {
    if (table === 'lureMasterImportHistory') {
      for (const row of saved[table]) assert.deepEqual(restored[table].find(r => r.id === row.id), row)
      assert.equal(restored[table].length, saved[table].length + 2)
    } else assert.deepEqual(JSON.parse(JSON.stringify(restored[table])), JSON.parse(JSON.stringify(saved[table])), table)
  }
}
beforeEach(async () => {
  await db.delete(); await db.open(); await importBackup({ text: async () => JSON.stringify(rc42Fixture()) })
  const identity = visualIdentityForVariant(await db.lureVariants.get(1254), await db.lureModels.get(297),
    await db.lureSeries.get(24), await db.lureManufacturers.get(42))
  await db.lureVisualProfiles.add({ id: crypto.randomUUID(), variantId: 1254, identity, naturalKey: visualNaturalKey(identity),
    appearance: { version: 1, paletteVersion: 1, layout: 'body', regions: { dorsal: { colors: ['red'], attributes: ['pearl'] } } },
    origin: 'user', userEdited: true, confirmed: true, revision: 7, updatedAt: '2026-11-21T00:00:00.000Z' })
})
after(async () => { db.close(); await db.delete(); await loader.close() })

test('official SKU table and gallery cover 91 existing colors, six distinct models, two RG aliases, zero additions', async () => {
  assert.deepEqual(rc42Audit.models.map(m => [m.model, m.colors.length, m.existingCount, m.existingOnly.length]),
    [['45F1',17,17,0], ['45S',5,5,0], ['48F',19,19,0], ['60F1',23,23,0], ['60SHF',19,19,0], ['60SS',8,8,0]])
  const jans = new Set()
  let renamed = 0
  for (const m of rc42Audit.models) {
    assert.equal(m.images.length, m.colors.length)
    for (const c of m.colors) {
      assert.equal(c.status, 'existing'); assert.equal(c.existing.length, 1)
      assert.equal(c.existing[0].modelId, m.existingModel.id)
      assert.match(c.jan, /^\d{13}$/); assert.ok(!jans.has(c.jan)); jans.add(c.jan)
      assert.ok(c.imageUrl.startsWith('https://')); assert.equal(c.productCode, null)
      if (c.existing[0].colorName.endsWith('レッドグロー')) renamed++
    }
  }
  assert.equal(jans.size, 91); assert.equal(renamed, 2)
  const p = planLureMaster(await snapshot(), { includePurchases: true }, manifest)
  assert.deepEqual([p.addedModels, p.addedColors, p.retainedColors, p.heldColors, p.addedOwned], [0,0,91,0,0])
})

test('hypothetical one missing color is restored only to its model, repeat and backup imports are idempotent', async () => {
  await db.lureVariants.delete(1255)
  const before = await snapshot(), u = createLureMasterUpdater(db, manifest), p = await u.preview()
  assert.deepEqual([p.addedModels, p.addedColors, p.heldColors, p.addedOwned], [0,1,0,0])
  await u.apply(p.comparisonToken)
  const saved = await snapshot()
  for (const [table, rows] of Object.entries(before)) {
    if (table === 'lureVariants') for (const r of rows) assert.deepEqual(saved[table].find(v => v.id === r.id), r)
    else if (table !== 'lureMasterImportHistory') assert.deepEqual(saved[table], rows, table)
  }
  assert.equal(saved.lureVariants.filter(v => v.modelId === 297 && v.colorName === 'MSブラウン').length, 1)
  assert.equal((await u.preview()).addedColors, 0)
  for (let i = 0; i < 2; i++) await importBackup({ text: async () => JSON.stringify(await createBackup()) })
  equalRestored(saved, await snapshot())
  const again = await u.apply((await u.preview()).comparisonToken)
  assert.ok(Object.values(again.counts).every(c => c.added === 0))
})

test('wrong model weight, duplicate parent and C&R custom / 75SS are never silently merged', async () => {
  const s = await snapshot()
  s.lureModels.find(m => m.id === 297).weightG = 2.1
  assert.equal(planLureMaster(s, {}, manifest).heldColors, 17)
  const other = await snapshot()
  other.lureModels.find(m => m.id === 297).name = 'PRESSO DOUBLE CLUTCH 75SS'
  assert.equal(planLureMaster(other, {}, manifest).heldColors, 17)
  other.lureModels.find(m => m.id === 297).name = 'PRESSO DOUBLE CLUTCH 45F1 C&Rカスタム'
  assert.equal(planLureMaster(other, {}, manifest).heldColors, 17)
  const duplicate = await snapshot()
  duplicate.lureModels.push({ ...duplicate.lureModels.find(m => m.id === 297), id: 9999 })
  assert.equal(planLureMaster(duplicate, {}, manifest).heldColors, 17)
})

const backup = 'docs/rc42/fishing-log-backup-2026-11-21.json'
test('provided backup remains byte-identical; cumulative updater preserves every original record and user profile', { skip: !existsSync(backup) }, async () => {
  const raw = readFileSync(backup), hash = b => createHash('sha256').update(b).digest('hex')
  assert.equal(hash(raw), rc42Audit.backupSha256)
  await importBackup({ text: async () => raw.toString('utf8') })
  const before = await snapshot()
  assert.equal(planLureMaster(before, {}, manifest).addedColors, 0)
  const u = createLureMasterUpdater(db)
  await u.apply((await u.preview()).comparisonToken)
  const saved = await snapshot()
  for (const [table, rows] of Object.entries(before)) {
    const pk = db.table(table).schema.primKey.keyPath
    const rowKey = r => JSON.stringify(Array.isArray(pk) ? pk.map(k => r[k]) : r[pk])
    for (const r of rows) assert.deepEqual(saved[table].find(v => rowKey(v) === rowKey(r)), r, `${table}/${rowKey(r)}`)
    if (!['lureManufacturers','lureSeries','lureModels','lureVariants','lureVisualProfiles','lureMasterImportHistory'].includes(table)) assert.deepEqual(saved[table], rows, table)
  }
  assert.equal((await u.preview()).addedColors, 0)
  for (let i = 0; i < 2; i++) await importBackup({ text: async () => JSON.stringify(await createBackup()) })
  equalRestored(saved, await snapshot())
  assert.equal(hash(readFileSync(backup)), hash(raw))
})
