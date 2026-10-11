import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-trip-delete-test-'))
const sources = { tripLocations: 'utils/tripLocations.ts', facilityMaster: 'utils/facilityMaster.ts', facilityStorage: 'utils/facilityStorage.ts', database: 'db/database.ts', tripDeletion: 'utils/tripDeletion.ts', backup: 'utils/backup.ts',
  tackleManagement: 'utils/tackleManagement.ts', fishSpecies: 'utils/fishSpecies.ts', fishMaster: 'data/fishMaster.ts' }
const paths = Object.fromEntries(Object.keys(sources).map(name => [name, join(directory, `${name}.mjs`)]))
for (const [name, source] of Object.entries(sources)) {
  let code = ts.transpileModule(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
  for (const [specifier, module] of [['./tripLocations', 'tripLocations'], ['../db/database', 'database'], ['./facilityMaster', 'facilityMaster'], ['./facilityStorage', 'facilityStorage'], ['./tackleManagement', 'tackleManagement'],
    ['./fishSpecies', 'fishSpecies'], ['../data/fishMaster', 'fishMaster']]) {
    code = code.replace(`'${specifier}'`, JSON.stringify(pathToFileURL(paths[module]).href))
  }
  await writeFile(paths[name], code)
}
const { db } = await import(pathToFileURL(paths.database).href)
const { getTripDeletionSummary, deleteFishingTrip } = await import(pathToFileURL(paths.tripDeletion).href)
const { createBackup, validateBackup } = await import(pathToFileURL(paths.backup).href)
after(async () => {
  db.close()
  for (const path of Object.values(paths)) await unlink(path)
  await rmdir(directory)
})
const state = async () => Object.fromEntries(await Promise.all(db.tables.map(async table => [table.name, await table.toArray()])))
const trip = id => ({ id, fishingAreaName: `Trip ${id}`, fishingDate: '2026-10-10', fishingStyle: 'AREA_TROUT',
  startedAt: new Date('2026-10-10T00:00:00Z'), tackleSetIds: [4] })
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    await db.trips.bulkAdd([trip(60), { ...trip(61), endedAt: new Date('2026-10-10T03:00:00Z') }, trip(62)])
    await db.lureManufacturers.add({ id: 10, name: 'Maker' })
    await db.lureSeries.add({ id: 20, manufacturerId: 10, name: 'Series' })
    await db.lureModels.add({ id: 30, seriesId: 20, name: 'Model' })
    await db.lureVariants.add({ id: 40, modelId: 30, colorName: 'Red' })
    await db.myLures.add({ id: 50, variantId: 40, active: true, ownershipStatus: 'owned' })
    const rod = { id: 1, manufacturer: 'Rod maker', modelName: 'Rod', active: true }
    const line = { id: 2, material: 'ナイロン', strengthLb: 3.5, active: true }
    const reel = { id: 3, manufacturer: 'Reel maker', modelName: 'Reel', mainLineId: 2, active: true }
    await db.rods.add(rod); await db.lines.add(line); await db.reels.add(reel)
    await db.tackleSets.add({ id: 4, name: 'Set', rodId: 1, reelId: 3, active: true })
    await db.fishSpecies.add({ fish_id: 'user:test', display_name: 'Test trout', group: 'ニジマス', aliases: '', region: '',
      lineage_or_type: '', source_status: '', notes: '', source_url: '', active: true, origin: 'user' })
    await db.catches.bulkAdd([60, 60, 61].map((tripId, index) => ({ id: 70 + index, tripId,
      caughtAt: new Date('2026-10-10T01:00:00Z'), lureId: 50, lureVariantId: 40, lureName: 'Model', lureColor: 'Red',
      fishSpeciesId: 'user:test', fishSpecies: 'Test trout', fishSpeciesGroup: 'ニジマス', fishSizeCm: 30,
      tackleSetId: 4, tackleSnapshot: { version: 1, setId: 4, setName: 'Set', rod, reel, mainLine: line } })))
    await db.tripEvents.bulkAdd([60, 61].map((tripId, index) => ({ id: 80 + index, tripId, type: 'stocking', occurredAt: new Date('2026-10-10T01:00:00Z') })))
  })
})

test('delete A and its two catches/event only; keep B, snapshots and every master; derived lure count 3 -> 1', async () => {
  const before = await state()
  assert.equal(await db.catches.filter(row => row.lureId === 50).count(), 3)
  await deleteFishingTrip(60, await getTripDeletionSummary(60))
  const expected = structuredClone(before)
  expected.trips = expected.trips.filter(row => row.id !== 60)
  expected.catches = expected.catches.filter(row => row.tripId !== 60)
  expected.tripEvents = expected.tripEvents.filter(row => row.tripId !== 60)
  assert.deepEqual(await state(), expected)
  assert.equal(await db.catches.filter(row => row.lureId === 50).count(), 1)
})

test('zero-catch trip deletion keeps all other records', async () => {
  const before = await state()
  const summary = await getTripDeletionSummary(62)
  assert.equal(summary.catchCount, 0)
  await deleteFishingTrip(62, summary)
  before.trips = before.trips.filter(row => row.id !== 62)
  assert.deepEqual(await state(), before)
})

test('preview/cancel is read-only and shows persisted name, date and counts', async () => {
  const before = await state()
  const summary = await getTripDeletionSummary(60)
  assert.equal(summary.trip.fishingAreaName, 'Trip 60')
  assert.equal(summary.trip.fishingDate, '2026-10-10')
  assert.equal(summary.catchCount, 2)
  assert.equal(summary.eventCount, 1)
  assert.deepEqual(await state(), before)
})

for (const tableName of ['tripEvents', 'trips']) {
  test(`failure deleting ${tableName} rolls back already deleted catches and events`, async () => {
    const before = await state()
    const summary = await getTripDeletionSummary(60)
    const hook = () => { throw new Error('injected deletion failure') }
    db.table(tableName).hook('deleting', hook)
    try { await assert.rejects(deleteFishingTrip(60, summary), /injected deletion failure/) }
    finally { db.table(tableName).hook('deleting').unsubscribe(hook) }
    assert.deepEqual(await state(), before)
  })
}

test('invalid, missing and already deleted IDs fail without touching unrelated records', async () => {
  const summary = await getTripDeletionSummary(60)
  const before = await state()
  for (const id of [0, -1, NaN, Infinity, 1.5, '60', null, undefined]) {
    await assert.rejects(getTripDeletionSummary(id), /釣行ID/)
    await assert.rejects(deleteFishingTrip(id, summary), /釣行ID/)
  }
  await assert.rejects(getTripDeletionSummary(999), /存在しない/)
  await assert.rejects(deleteFishingTrip(999, { ...summary, trip: { ...summary.trip, id: 999 } }), /存在しない/)
  assert.deepEqual(await state(), before)
  await deleteFishingTrip(60, summary)
  const after = await state()
  await assert.rejects(deleteFishingTrip(60, summary), /削除済み/)
  assert.deepEqual(await state(), after)
})

test('concurrent duplicate deletions commit once and leave B unchanged', async () => {
  const summary = await getTripDeletionSummary(60)
  const results = await Promise.allSettled([deleteFishingTrip(60, summary), deleteFishingTrip(60, summary)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
  assert.equal(await db.catches.where('tripId').equals(61).count(), 1)
  assert.equal(await db.tripEvents.where('tripId').equals(61).count(), 1)
})

test('changed counts or trip state after confirmation require a new confirmation', async () => {
  const summary = await getTripDeletionSummary(60)
  await db.catches.add({ tripId: 60, caughtAt: new Date() })
  const before = await state()
  await assert.rejects(deleteFishingTrip(60, summary), /確認し直して/)
  assert.deepEqual(await state(), before)
  const refreshed = await getTripDeletionSummary(60)
  await db.trips.update(60, { endedAt: new Date() })
  const ended = await state()
  await assert.rejects(deleteFishingTrip(60, refreshed), /確認し直して/)
  assert.deepEqual(await state(), ended)
})

test('mismatched confirmation target is rejected without changes', async () => {
  const before = await state()
  await assert.rejects(deleteFishingTrip(61, await getTripDeletionSummary(60)), /一致しません/)
  assert.deepEqual(await state(), before)
})

test('post-deletion backup remains valid v5 with no orphan catches/events', async () => {
  await deleteFishingTrip(60, await getTripDeletionSummary(60))
  const backup = await createBackup()
  assert.equal(backup.version, 5)
  assert.doesNotThrow(() => validateBackup(JSON.parse(JSON.stringify(backup))))
  db.close()
  await db.open()
  assert.equal(await db.trips.get(60), undefined)
  assert.equal(await db.catches.where('tripId').equals(61).count(), 1)
  assert.equal(await db.myLures.count(), 1)
})
