import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'
const loader = await localTypeScript()
const { db } = await loader.load('src/db/database.ts')
const { rc37Fixture } = await loader.load('tests/rc37Fixture.ts')
const { lureMasterManifest, buildManifest } = await loader.load('src/data/lureMasterManifest.ts')
const { planLureMaster } = await loader.load('src/utils/lureMasterPlanner.ts')
const { createLureMasterUpdater } = await loader.load('src/utils/lureMasterApply.ts')
const { createBackup, importBackup } = await loader.load('src/utils/backup.ts')
const manifest = { ...lureMasterManifest, targets: lureMasterManifest.targets.filter(t => t.revisions.includes('RC38')), pending: [] }
const snapshot = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
function preserve(before, after) {
  for (const [name, rows] of Object.entries(before)) {
    if (!['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'lureMasterImportHistory'].includes(name)) assert.deepEqual(after[name], rows, name)
    else for (const row of rows) assert.deepEqual(after[name].find(r => r.id === row.id), row, `${name}/${row.id}`)
  }
}
beforeEach(async () => { await db.delete(); await db.open(); await importBackup({ text: async () => JSON.stringify(rc37Fixture()) }) })
after(async () => { db.close(); await db.delete(); await loader.close() })

test('RC38 resolves RC37 holds by adding separate F/SS models; protects every existing row and adds no ownership', async () => {
  const before = await snapshot()
  const legacy = buildManifest(false)
  assert.equal(planLureMaster(before, {}, { ...legacy, targets: legacy.targets.filter(t => /MOCA DR-.*Rattle/.test(t.model)) }).heldColors, 14)
  for (const weight of [undefined, 2.1, 2.4]) {
    const s = structuredClone(before); s.lureModels.find(m => m.id === 128).weightG = weight
    const p = planLureMaster(s, { includePurchases: true }, manifest)
    assert.deepEqual([p.addedModels, p.addedColors, p.heldColors, p.addedOwned], [2, 26, 0, 0])
  }
  const u = createLureMasterUpdater(db, manifest), p = await u.preview()
  assert.deepEqual(await snapshot(), before)
  await u.apply(p.comparisonToken)
  const saved = await snapshot(); preserve(before, saved)
  assert.equal(saved.lureVariants.filter(v => v.modelId === 128).length, 3)
  const f = saved.lureModels.find(m => m.name === 'MOCA DR-F Rattle 2HOOK')
  const ss = saved.lureModels.find(m => m.name === 'MOCA DR-SS Rattle 2HOOK')
  assert.notEqual(f.id, ss.id); assert.notEqual(f.id, 128)
  assert.equal(saved.lureVariants.filter(v => v.modelId === f.id).length, 19)
  assert.equal(saved.lureVariants.filter(v => v.modelId === ss.id).length, 7)
  const tea = saved.lureVariants.find(v => v.modelId === f.id && v.colorName === 'さちおの茶')
  assert.deepEqual(tea.catalogEvidence, { revision: 'RC38', colorClass: 'standard', sourceTier: 'retailer', manufacturerUrl: '',
    retailerUrl: 'https://fishing-shop-jh.com/?pid=156192039', jan: '4573151245423', originalName: 'さちおの茶', verified: true,
    checkedAt: '2026-11-04', verificationStatus: 'retailer-confirmed', colorCode: '', weightG: 2.1, lengthMm: 30, buoyancy: 'F',
    rattle: 'rattle', productUrl: 'https://www.backlash.co.jp/item/4573151272276/' })
  const again = await u.apply((await u.preview()).comparisonToken)
  assert.ok(Object.values(again.counts).every(c => c.added === 0)); preserve(saved, await snapshot())
  await importBackup({ text: async () => JSON.stringify(await createBackup()) }); preserve(saved, await snapshot())
})

test('same named colors stay in their models; wrong weight and duplicate matching models remain held', async () => {
  const before = await snapshot(), f = manifest.targets.find(t => t.buoyancy === 'F')
  const first = planLureMaster(before, {}, manifest)
  assert.equal(first.rows.filter(r => r.color.code === '34').length, 2)
  const s = structuredClone(before)
  s.lureModels.push({ id: 999, seriesId: 14, name: f.model, weightG: 2.4 })
  // Use the audited MOCA parent rather than assuming a device-specific ID.
  s.lureModels.at(-1).seriesId = s.lureModels.find(m => m.id === 128).seriesId
  assert.equal(planLureMaster(s, {}, manifest).heldColors, 19)
  s.lureModels.at(-1).weightG = 2.1
  s.lureModels.push({ ...s.lureModels.at(-1), id: 1000 })
  assert.equal(planLureMaster(s, {}, manifest).heldColors, 19)
})

test('RC38 insertion failure rolls back the whole catalog and retry succeeds', async () => {
  const before = await snapshot(), u = createLureMasterUpdater(db, manifest), p = await u.preview()
  let inserts = 0
  const fail = () => { if (++inserts === 2) throw new Error('RC38 injected variant failure') }
  db.lureVariants.hook('creating', fail)
  try { await assert.rejects(u.apply(p.comparisonToken)) }
  finally { db.lureVariants.hook('creating').unsubscribe(fail) }
  const failed = await snapshot(); preserve(before, failed)
  assert.deepEqual(failed.lureModels, before.lureModels)
  assert.deepEqual(failed.lureVariants, before.lureVariants)
  const addedHistory = failed.lureMasterImportHistory.filter(row => !before.lureMasterImportHistory.some(old => old.id === row.id))
  assert.equal(addedHistory.length, 1)
  assert.equal(addedHistory[0].status, 'failed')
  await u.apply((await u.preview()).comparisonToken)
  assert.equal((await u.preview()).addedColors, 0)
})

const privateBackup = 'docs/rc38/fishing-log-backup-2026-11-04.json'
test('provided full backup: all rows/history/weather/catches survive cumulative apply and backup round trip', { skip: !existsSync(privateBackup) }, async () => {
  await importBackup({ text: async () => await readFile(privateBackup, 'utf8') })
  const before = await snapshot(), u = createLureMasterUpdater(db), p = await u.preview()
  await u.apply(p.comparisonToken); const saved = await snapshot(); preserve(before, saved)
  await importBackup({ text: async () => JSON.stringify(await createBackup()) }); preserve(saved, await snapshot())
  assert.equal((await u.preview()).addedColors, 0)
})
