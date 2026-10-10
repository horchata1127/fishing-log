import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// 実ブラウザのDBには接続しない。現在のTS実装を一時ESMへ変換して検証する。
const directory = await mkdtemp(join(tmpdir(), 'fishing-log-backup-test-'))
const databaseFile = join(directory, 'database.mjs')
const backupFile = join(directory, 'backup.mjs')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const databaseSource = await readFile(new URL('../src/db/database.ts', import.meta.url), 'utf8')
const backupSource = await readFile(new URL('../src/utils/backup.ts', import.meta.url), 'utf8')
await writeFile(databaseFile, compile(databaseSource).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie'))))
await writeFile(backupFile, compile(backupSource).replace("'../db/database'", JSON.stringify(pathToFileURL(databaseFile).href)))
const { db } = await import(pathToFileURL(databaseFile).href)
const { createBackup, importBackup, validateBackup, backupTableNames } = await import(pathToFileURL(backupFile).href)

after(async () => {
  db.close()
  await unlink(databaseFile)
  await unlink(backupFile)
  await rmdir(directory)
})

function fixture() {
  return {
    format: 'fishing-log-backup', version: 2, exportedAt: '2026-10-10T00:00:00.000Z',
    data: {
      trips: [{ id: 40, fishingAreaName: 'Test lake', fishingDate: '2026-10-10', fishingStyle: 'AREA_TROUT',
        startedAt: '2026-10-10T01:00:00.000Z', endedAt: '2026-10-10T04:00:00.000Z', temperatureC: -2 }],
      catches: [{ id: 80, tripId: 40, lureId: 60, caughtAt: '2026-10-10T02:00:00.000Z', lureName: 'Model', tackleSetId: 9 }],
      tripEvents: [{ id: 90, tripId: 40, type: 'stocking', occurredAt: '2026-10-10T01:30:00.000Z' }],
      lureManufacturers: [{ id: 10, name: 'Maker' }],
      lureSeries: [{ id: 20, manufacturerId: 10, name: 'Series' }],
      lureModels: [{ id: 30, seriesId: 20, name: 'Model', category: 'スプーン', weightG: 1.5 }],
      lureVariants: [{ id: 50, modelId: 30, colorName: 'Color' }],
      myLures: [{ id: 60, variantId: 50, active: true, extension: { retained: true } },
        { id: 61, variantId: 50, active: false }],
    },
  }
}

const file = value => new File([JSON.stringify(value)], 'test-backup.json', { type: 'application/json' })
const snapshot = async () => JSON.stringify((await createBackup()).data)

test('v2 round-trip preserves all eight tables, sparse IDs, dates and multiple owned individuals', async () => {
  const source = fixture()
  await importBackup(file(source))
  const backup = await createBackup()
  assert.equal(backup.version, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(backup.data)), source.data)
  assert.ok((await db.catches.get(80)).caughtAt instanceof Date)
  assert.ok((await db.tripEvents.get(90)).occurredAt instanceof Date)
  assert.ok((await db.trips.get(40)).endedAt instanceof Date)
  assert.equal(backupTableNames.length, 8)
  const nextId = await db.myLures.add({ variantId: 50, active: true })
  assert.ok(nextId > 61)
  await importBackup(file(backup))
  assert.deepEqual(JSON.parse(await snapshot()), source.data)
})

test('v1 without events and legacy missing fishingStyle restores without invented IDs or fields', async () => {
  const source = fixture()
  source.version = 1
  delete source.data.tripEvents
  delete source.data.trips[0].fishingStyle
  await importBackup(file(source))
  const result = JSON.parse(await snapshot())
  assert.deepEqual(result, { ...source.data, tripEvents: [] })
})

test('manual catches without a lure reference, optional fields and timezone offsets are supported', () => {
  const source = fixture()
  delete source.data.catches[0].lureId
  delete source.data.trips[0].endedAt
  source.data.catches[0].caughtAt = '2026-10-10T11:00:00+09:00'
  const result = validateBackup(source)
  assert.equal(result.catches[0].caughtAt.toISOString(), '2026-10-10T02:00:00.000Z')
  assert.equal(source.data.catches[0].caughtAt, '2026-10-10T11:00:00+09:00')
})

test('v1 with events preserves them; catalog names are not normalized or merged', async () => {
  const source = fixture()
  source.version = 1
  source.data.lureVariants.push({ id: 51, modelId: 30, colorName: 'Ｃｏｌｏｒ' })
  await importBackup(file(source))
  assert.deepEqual(JSON.parse(await snapshot()), source.data)
})

test('empty v2 is valid and empty snapshots contain all eight arrays', () => {
  const source = fixture()
  for (const name of backupTableNames) source.data[name] = []
  assert.deepEqual(validateBackup(source), source.data)
})

const invalidCases = [
  ['root null', () => null],
  ['wrong format', b => { b.format = 'catalog'; return b }],
  ['unsupported version', b => { b.version = 5; return b }],
  ['missing export time', b => { delete b.exportedAt; return b }],
  ['invalid export time', b => { b.exportedAt = 'bad'; return b }],
  ['missing data', b => { delete b.data; return b }],
  ['null row', b => { b.data.catches[0] = null; return b }],
  ['missing ID', b => { delete b.data.catches[0].id; return b }],
  ['zero ID', b => { b.data.catches[0].id = 0; return b }],
  ['fractional ID', b => { b.data.catches[0].id = 1.5; return b }],
  ['string ID', b => { b.data.catches[0].id = '80'; return b }],
  ['unsafe ID', b => { b.data.catches[0].id = Number.MAX_SAFE_INTEGER + 1; return b }],
  ['blank area', b => { b.data.trips[0].fishingAreaName = ' '; return b }],
  ['invalid fishing date', b => { b.data.trips[0].fishingDate = '2026-02-30'; return b }],
  ['invalid style', b => { b.data.trips[0].fishingStyle = 'invalid'; return b }],
  ['missing startedAt', b => { delete b.data.trips[0].startedAt; return b }],
  ['null timestamp', b => { b.data.catches[0].caughtAt = null; return b }],
  ['numeric timestamp', b => { b.data.catches[0].caughtAt = 123; return b }],
  ['invalid calendar timestamp', b => { b.data.catches[0].caughtAt = '2026-02-30T01:00:00Z'; return b }],
  ['invalid clock', b => { b.data.catches[0].caughtAt = '2026-10-10T24:00:00Z'; return b }],
  ['missing timezone', b => { b.data.catches[0].caughtAt = '2026-10-10T01:00:00'; return b }],
  ['end before start', b => { b.data.trips[0].endedAt = '2026-10-09T01:00:00Z'; return b }],
  ['event type', b => { b.data.tripEvents[0].type = 'invalid'; return b }],
  ['invalid optional string', b => { b.data.catches[0].memo = 123; return b }],
  ['invalid size', b => { b.data.catches[0].fishSizeCm = -1; return b }],
  ['invalid active', b => { b.data.myLures[0].active = 1; return b }],
  ['invalid category', b => { b.data.lureModels[0].category = 'invalid'; return b }],
  ['duplicate unique manufacturer name', b => { b.data.lureManufacturers.push({ id: 11, name: 'Maker' }); return b }],
  ['missing series parent', b => { b.data.lureSeries[0].manufacturerId = 999; return b }],
  ['missing model parent', b => { b.data.lureModels[0].seriesId = 999; return b }],
  ['missing variant parent', b => { b.data.lureVariants[0].modelId = 999; return b }],
  ['missing owned variant', b => { b.data.myLures[0].variantId = 999; return b }],
  ['missing catch trip', b => { b.data.catches[0].tripId = 999; return b }],
  ['missing catch individual', b => { b.data.catches[0].lureId = 999; return b }],
  ['missing event trip', b => { b.data.tripEvents[0].tripId = 999; return b }],
]
for (const table of backupTableNames) {
  invalidCases.push([`missing ${table}`, b => { delete b.data[table]; return b }])
  invalidCases.push([`duplicate ID in ${table}`, b => { b.data[table].push({ ...b.data[table][0] }); return b }])
}
for (const [name, mutate] of invalidCases) {
  test(`reject ${name} before any write; existing data remains`, async () => {
    await importBackup(file(fixture()))
    const before = await snapshot()
    await assert.rejects(importBackup(file(mutate(fixture()))))
    assert.equal(await snapshot(), before)
  })
}

test('malformed JSON is rejected without changing existing data', async () => {
  const before = await snapshot()
  await assert.rejects(importBackup(new File(['{'], 'broken.json')), /JSON/)
  assert.equal(await snapshot(), before)
})

test('late insertion failure rolls back clears and prior inserts across all eight tables', async () => {
  await importBackup(file(fixture()))
  const before = await snapshot()
  const incoming = fixture()
  incoming.data.trips[0].fishingAreaName = 'Replacement'
  const throwOnCreate = () => { throw new Error('injected storage failure') }
  db.myLures.hook('creating', throwOnCreate)
  try {
    await assert.rejects(importBackup(file(incoming)), /injected storage failure/)
  } finally {
    db.myLures.hook('creating').unsubscribe(throwOnCreate)
  }
  assert.equal(await snapshot(), before)
})

test('backup snapshot remains consistent when a writer is queued between table reads', async () => {
  await importBackup(file(fixture()))
  const original = db.table
  let writer
  db.table = function (name) {
    const table = original.call(this, name)
    if (name === 'trips') {
      const read = table.toArray
      table.toArray = function () {
        writer = db.constructor.ignoreTransaction(() => db.transaction('rw', db.trips, db.catches, async () => {
          await db.trips.update(40, { fishingAreaName: 'After snapshot' })
          await db.catches.update(80, { lureName: 'After snapshot' })
        }))
        return read.call(this)
      }
    }
    return table
  }
  let backup
  try {
    backup = await createBackup()
  } finally {
    db.table = original
  }
  await writer
  assert.equal(backup.data.trips[0].fishingAreaName, 'Test lake')
  assert.equal(backup.data.catches[0].lureName, 'Model')
  assert.equal((await db.trips.get(40)).fishingAreaName, 'After snapshot')
  assert.equal((await db.catches.get(80)).lureName, 'After snapshot')
})
