import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRc32Runtime } from '../scripts/lib/rc32Runtime.mjs'

const runtime = await createRc32Runtime()
const { db } = runtime.database
const { previewRc33Catalog: preview, applyRc33Catalog: apply } = runtime.rc33
const state = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
beforeEach(async () => {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
    await db.lureManufacturers.add({ id: 1, name: 'PALMS' })
    await db.lureSeries.add({ id: 2, manufacturerId: 1, name: 'GANOFF' })
    await db.lureModels.add({ id: 3, seriesId: 2, name: 'GA-24S', weightG: 1.6, lengthMm: 24 })
    await db.lureVariants.add({ id: 4, modelId: 3, colorName: 'MT-933 ダークモカ' })
    await db.trips.add({ id: 1, fishingAreaName: 'Synthetic', fishingDate: '2026-11-01', fishingStyle: 'AREA_TROUT', startedAt: new Date('2026-11-01T00:00:00Z') })
    await db.catches.add({ id: 1, tripId: 1, lureVariantId: 4, caughtAt: new Date('2026-11-01T00:00:00Z') })
    await db.tripEvents.add({ id: 1, tripId: 1, type: 'pellet', occurredAt: new Date('2026-11-01T00:00:00Z') })
  })
})
after(async () => runtime.dispose())

test('candidate coverage, 11 purchases, model-scoped colors and official image evidence', async () => {
  const csv = (await readFile('docs/rc33/fishing_log_rc33_color_candidates_2026-11-01.csv', 'utf8')).trim().split(/\r?\n/).slice(1).map(r => r.split(','))
  const catalog = runtime.data33.rc33Catalog
  assert.equal(csv.length, 48)
  for (const row of csv) {
    const target = catalog.find(t => t.model === row[1])
    assert.ok(target?.colors.some(c => c.code === row[2] && [c.name, ...c.aliases].includes(row[3])), row[3])
  }
  assert.equal(catalog.flatMap(t => t.colors).reduce((n,c) => n+c.purchase, 0), 11)
  assert.equal(catalog.flatMap(t => t.colors).filter(c => c.appearance).length, 29)
  for (const c of catalog.flatMap(t => t.colors)) if (c.appearance) {
    for (const region of Object.values(c.appearance.regions)) assert.ok(region.colors.length <= 3)
  }
})
test('read-only preview, atomic repeat, unchanged existing rows and v8 round trip', async () => {
  const before = await state(), p = await preview()
  assert.deepEqual(await state(), before)
  assert.equal(p.addedColors, 60); assert.equal(p.retainedColors, 1); assert.equal(p.addedOwned, 11)
  assert.equal(p.heldColors, 0); assert.equal(p.photoColors, 29)
  await apply(p.comparisonToken)
  const saved = await state()
  for (const [name, rows] of Object.entries(before)) for (const row of rows) assert.deepEqual(saved[name].find(r => r.id === row.id), row)
  assert.equal(saved.myLures.length, 11)
  assert.ok(saved.myLures.every(m => m.active && m.ownershipStatus === 'owned'))
  const again = await preview()
  assert.deepEqual([again.addedColors, again.addedOwned, again.photoColors, again.provisionalColors], [0,0,0,0])
  await apply(again.comparisonToken); assert.deepEqual(await state(), saved)
  assert.equal(new Set(saved.lureVisualProfiles.map(p => p.naturalKey)).size, saved.lureVisualProfiles.length)
  const backup = await runtime.backup.createBackup()
  assert.equal(backup.version, 8)
  await runtime.backup.importBackup({ text: async () => JSON.stringify(backup) })
  assert.deepEqual(await state(), saved)
  assert.ok(saved.lureVisualProfiles.filter(p => p.origin === 'name').every(p => !p.confirmed && p.evidence.sourceUrl))
})
test('existing inactive/unverified ownership and hand-edited/confirmed profiles are retained', async () => {
  await apply((await preview()).comparisonToken)
  const owned = (await db.myLures.toArray())[0]
  await db.myLures.update(owned.id, { active: false, ownershipStatus: 'unverified' })
  const profile = (await db.lureVisualProfiles.toArray())[0]
  await db.lureVisualProfiles.update(profile.id, { origin: 'user', userEdited: true, confirmed: true })
  const before = await state()
  await apply((await preview()).comparisonToken)
  assert.deepEqual(await state(), before)
})
test('stale ownership/catalog/visual previews reject without partial writes', async () => {
  const p = await preview()
  await db.myLures.add({ variantId: 4, active: true, ownershipStatus: 'owned' })
  const before = await state()
  await assert.rejects(apply(p.comparisonToken), /事前確認/)
  assert.deepEqual(await state(), before)
})
test('injected write failure rolls back catalog, ownership and profiles together', async () => {
  const p = await preview(), before = await state(), original = db.lureVisualProfiles.add
  db.lureVisualProfiles.add = async () => { throw new Error('synthetic failure') }
  try { await assert.rejects(apply(p.comparisonToken), /synthetic failure/) }
  finally { db.lureVisualProfiles.add = original }
  assert.deepEqual(await state(), before)
})
test('ambiguous parent and color code/name conflicts are held', async () => {
  await db.lureManufacturers.add({ name: 'パームス' })
  const p = await preview()
  assert.equal(p.rows.find(r => r.manufacturer === 'PALMS').catalog, 'hold')
})
test('legacy code-less name is reused without altering its profile or catalog evidence', async () => {
  await db.lureVariants.update(4, { colorName: 'ダークモカ' })
  const before = await db.lureVariants.get(4), p = await preview()
  assert.equal(p.retainedColors, 1)
  await apply(p.comparisonToken)
  assert.deepEqual(await db.lureVariants.get(4), before)
  assert.equal((await db.myLures.where('variantId').equals(4).count()), 1)
  const red = (await db.lureVariants.toArray()).find(v => v.colorName === '04 クリアーレッド')
  await db.lureVariants.update(red.id, { catalogEvidence: { ...red.catalogEvidence, colorCode: '０４' } })
  const normalized = await preview()
  assert.equal(normalized.addedColors, 0)
  assert.equal(normalized.heldColors, 0)
})
test('conflicting explicit color code is held and model specifications are checked', async () => {
  const t = runtime.data33.rc33Catalog[5], c = t.colors[0]
  await db.lureVariants.update(4, { colorName: c.name, catalogEvidence: { revision: 'RC33', colorClass: '', sourceTier: 'manufacturer', manufacturerUrl: c.sourceUrl, retailerUrl: '', jan: '', originalName: c.name, colorCode: 'MT-999' } })
  let p = await preview()
  assert.equal(p.rows.find(r => r.manufacturer === 'PALMS').catalog, 'hold')
  await db.lureModels.update(3, { weightG: 2.1 })
  p = await preview()
  assert.match(p.rows.find(r => r.manufacturer === 'PALMS').reason, /重量/)
})
test('legacy v7 restore preserves but detaches profiles; re-import holds unsafe relinking', async () => {
  await apply((await preview()).comparisonToken)
  const backup = await runtime.backup.createBackup()
  const old = { ...backup, version: 7, data: { ...backup.data } }
  delete old.data.lureVisualProfiles; delete old.data.temporaryLureColors
  const before = (await db.lureVisualProfiles.toArray()).map(({ variantId, ...p }) => p)
  await runtime.backup.importBackup({ text: async () => JSON.stringify(old) })
  assert.deepEqual(await db.lureVisualProfiles.toArray(), before)
  const p = await preview(), snapshot = await state()
  assert.ok(p.heldColors > 0)
  assert.equal(p.addedOwned, 0)
  await apply(p.comparisonToken)
  assert.deepEqual(await state(), snapshot)
})
