import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-facility-test-'))
const sources = { database: 'db/database.ts', facilityMaster: 'utils/facilityMaster.ts', facilityStorage: 'utils/facilityStorage.ts', backup: 'utils/backup.ts' }
const paths = Object.fromEntries([...Object.keys(sources), 'legacy'].map(n => [n, join(directory, `${n}.mjs`)]))
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const dbSource = await readFile(new URL('../src/db/database.ts', import.meta.url), 'utf8')
for (const [name, source] of Object.entries(sources)) {
  let code = compile(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8')).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
  for (const [specifier, dependency] of [['../db/database', 'database'], ['./facilityMaster', 'facilityMaster'], ['./facilityStorage', 'facilityStorage']]) code = code.replace(`'${specifier}'`, JSON.stringify(pathToFileURL(paths[dependency]).href))
  await writeFile(paths[name], code)
}
await writeFile(paths.legacy, compile(dbSource.slice(0, dbSource.indexOf('db.version(7)'))).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie'))))
const { db, databaseConnection } = await import(pathToFileURL(paths.database).href)
const { applyFacilityMaster, readFacilityStorage, validateFacilityStorage } = await import(pathToFileURL(paths.facilityStorage).href)
const { createBackup, importBackup, validateBackup, fullBackupTableNames } = await import(pathToFileURL(paths.backup).href)
after(async () => { db.close(); for (const path of Object.values(paths)) await unlink(path); await rmdir(directory) })
beforeEach(async () => { await db.open(); for (const table of db.tables) await table.clear() })
const copy = value => JSON.parse(JSON.stringify(value))
const state = async () => copy(Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()]))))
const file = value => new File([JSON.stringify(value)], 'synthetic.json')
const zone = (id = 'official:z') => ({ id, name: '架空エリア', sortOrder: 1, sourceUrl: null })
const facility = (id = 'official:f', zones = [zone()]) => ({ id, name: '架空施設', prefecture: '長野県', address: null,
  facilityTypes: ['pond'], lureAllowed: true, operationStatus: 'open', officialUrl: null, sourceUrl: null, verifiedAt: null, aliases: [], zones })
const master = (releaseOrder = 1, facilities = [facility()]) => ({ schemaVersion: 1, masterVersion: `sample-${releaseOrder}`, distributionMode: 'full', releaseOrder, facilities })
const legacyBackup = () => ({ format: 'fishing-log-backup', version: 5, exportedAt: '2026-10-11T00:00:00Z',
  data: Object.fromEntries(fullBackupTableNames.map(n => [n, []])) })
const trip = () => ({ id: 40, fishingAreaName: '架空', fishingDate: '2026-10-11', startedAt: new Date('2026-10-11T01:00:00Z'), memo: '保持' })
const user = () => ({ id: 'user:f', name: 'ユーザー架空施設', origin: 'user', extension: { retained: true } })
async function withReferences() {
  await db.trips.put({ ...trip(), facilityId: 'official:f', currentZoneId: 'official:z' })
  await db.catches.put({ id: 80, tripId: 40, caughtAt: new Date('2026-10-11T02:00:00Z'), facilityId: 'official:f', zoneId: 'official:z',
    locationSnapshot: { facilityName: '保存時名称', zoneName: '保存時エリア' } })
}

test('v6 to v7 preserves every record in all 13 stores and adds empty stores', async () => {
  db.close(); const { db: legacy } = await import(pathToFileURL(paths.legacy).href)
  // Existing browser database has v7 already: recreate only this fake-indexeddb test database at v6.
  legacy.close(); await db.delete(); await legacy.open()
  assert.equal(legacy.verno, 6)
  const records = {
    trips: { ...trip(), id: 41, tackleSetIds: [41] },
    catches: { id: 41, tripId: 41, caughtAt: new Date('2026-10-11T02:00:00Z'), lureId: 41, lureVariantId: 41, fishSpeciesId: 'test:fish', fishSpecies: '架空魚', fishSpeciesGroup: 'ニジマス', fishSizeCm: 30, photoUrls: ['test-only-photo'] },
    tripEvents: { id: 41, tripId: 41, type: 'stocking', occurredAt: new Date('2026-10-11T01:30:00Z') },
    lureManufacturers: { id: 41, name: '架空メーカー' }, lureSeries: { id: 41, manufacturerId: 41, name: '架空シリーズ' },
    lureModels: { id: 41, seriesId: 41, name: '架空モデル', weightG: 1.5 }, lureVariants: { id: 41, modelId: 41, colorName: '架空色' },
    myLures: { id: 41, variantId: 41, active: true, ownershipStatus: 'owned' },
    rods: { id: 41, manufacturer: '架空', modelName: 'ロッド', active: true },
    reels: { id: 41, manufacturer: '架空', modelName: 'リール', mainLineId: 41, active: true },
    lines: { id: 41, material: 'ナイロン', strengthLb: 3.5, active: true },
    tackleSets: { id: 41, name: '架空セット', rodId: 41, reelId: 41, active: true },
    fishSpecies: { fish_id: 'test:fish', group: 'ニジマス', display_name: '架空魚', aliases: '', region: '', lineage_or_type: '', source_status: '', notes: '', source_url: '', active: true, origin: 'user' },
  }
  for (const name of fullBackupTableNames) await legacy.table(name).put({ ...records[name], extension: { retained: true } })
  const before = copy(Object.fromEntries(await Promise.all(legacy.tables.map(async t => [t.name, await t.toArray()]))))
  legacy.close(); await db.open(); assert.equal(db.verno, 9)
  const after = await state(); for (const name of fullBackupTableNames) assert.deepEqual(after[name], before[name])
  for (const name of ['facilities', 'zones', 'appMetadata']) assert.deepEqual(after[name], [])
})

test('apply: add rename zone addition retirement reappearance and exact no-op', async () => {
  await applyFacilityMaster(master()); const saved = await state()
  await applyFacilityMaster(master()); assert.deepEqual(await state(), saved)
  const f = facility(); f.name = '改名'; f.zones.push(zone('official:new-z'))
  await applyFacilityMaster(master(2, [f])); assert.equal((await db.facilities.get('official:f')).name, '改名')
  await applyFacilityMaster(master(3, [facility('official:new-f', [])]))
  assert.equal((await db.facilities.get('official:f')).catalogState, 'retired')
  assert.equal((await db.zones.get('official:z')).catalogState, 'retired')
  await applyFacilityMaster(master(4)); assert.equal((await db.facilities.get('official:f')).catalogState, 'listed')
})
test('apply protects user facilities and user zones under retiring official facilities', async () => {
  await applyFacilityMaster(master()); await db.facilities.put(user()); await db.zones.put({ id: 'user:z', name: 'ユーザーエリア', facilityId: 'official:f', origin: 'user' })
  const saved = await readFacilityStorage(); await applyFacilityMaster(master(2, [facility('official:b', [])]))
  assert.deepEqual(await db.facilities.get('user:f'), saved.facilities[1]); assert.deepEqual(await db.zones.get('user:z'), saved.zones[1])
})
for (const kind of ['older', 'same different', 'move zone', 'cross kind', 'draft', 'empty']) test(`apply rejects ${kind} without writes`, async () => {
  await applyFacilityMaster(master(2)); const before = await state(); const m = master(kind === 'older' ? 1 : 3)
  if (kind === 'same different') { m.releaseOrder = 2; m.facilities[0].name = '差異' }
  if (kind === 'move zone') m.facilities = [facility('official:b')]
  if (kind === 'cross kind') m.facilities = [facility('official:z', [])]
  if (kind === 'draft') m.distributionMode = 'full_snapshot_draft'
  if (kind === 'empty') m.facilities = []
  await assert.rejects(applyFacilityMaster(m)); assert.deepEqual(await state(), before)
})
test('apply metadata failure rolls back facility and zone updates', async () => {
  await applyFacilityMaster(master()); const before = await state()
  const hook = () => { throw new Error('injected metadata failure') }; db.appMetadata.hook('updating', hook)
  try { await assert.rejects(applyFacilityMaster(master(2, [facility('official:b', [zone('official:b-z')])])), /injected/) }
  finally { db.appMetadata.hook('updating').unsubscribe(hook) }
  assert.deepEqual(await state(), before)
})
test('concurrent apply serializes and never rolls releaseOrder back', async () => {
  const results = await Promise.allSettled([applyFacilityMaster(master(3)), applyFacilityMaster(master(2))])
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected')
  assert.equal((await db.appMetadata.get('facilityMaster')).releaseOrder, 3)
})
test('v6 backup round trip with references snapshots user rows and retired history', async () => {
  await applyFacilityMaster(master()); await withReferences(); await db.facilities.put(user())
  await applyFacilityMaster(master(2, [facility('official:b', [])]))
  const backup = await createBackup(); assert.equal(backup.version, 6); const before = await state()
  for (const table of db.tables) await table.clear()
  await importBackup(file(backup)); assert.deepEqual(await state(), before)
  assert.ok((await db.trips.get(40)).startedAt instanceof Date)
  assert.ok((await db.catches.get(80)).caughtAt instanceof Date)
  assert.deepEqual(copy((await createBackup()).data), copy(backup.data))
})
for (const version of [1, 2, 3, 4, 5]) test(`legacy v${version} replaces old data but preserves new stores`, async () => {
  await applyFacilityMaster(master()); await db.facilities.put(user()); const before = copy(await readFacilityStorage()); await db.trips.put(trip())
  const backup = legacyBackup(); backup.version = version
  if (version < 5) delete backup.data.fishSpecies
  if (version < 4) for (const name of ['rods','reels','lines','tackleSets']) delete backup.data[name]
  if (version === 1) delete backup.data.tripEvents
  await importBackup(file(backup)); assert.equal(await db.trips.count(), 0); assert.deepEqual(copy(await readFacilityStorage()), before)
})
test('old official backup cannot roll back current master; historical referenced IDs survive', async () => {
  await applyFacilityMaster(master()); await withReferences(); const backup = await createBackup()
  await applyFacilityMaster(master(2, [facility('official:b', [])])); await db.trips.clear(); await db.catches.clear()
  await importBackup(file(backup)); assert.equal((await db.appMetadata.get('facilityMaster')).releaseOrder, 2)
  assert.equal((await db.facilities.get('official:f')).catalogState, 'retired'); assert.equal((await db.catches.get(80)).zoneId, 'official:z')
})
test('old backup-only history is retained retired on a fresh newer master', async () => {
  await applyFacilityMaster(master()); await withReferences(); const backup = await createBackup()
  for (const table of db.tables) await table.clear()
  await applyFacilityMaster(master(2, [facility('official:b', [])])); await importBackup(file(backup))
  assert.equal((await db.zones.get('official:z')).catalogState, 'retired'); assert.equal((await db.appMetadata.get('facilityMaster')).releaseOrder, 2)
})
test('newer validated backup advances master and retains current user rows', async () => {
  await applyFacilityMaster(master(2)); const backup = await createBackup()
  for (const table of db.tables) await table.clear()
  await applyFacilityMaster(master()); await db.facilities.put(user()); await importBackup(file(backup))
  assert.equal((await db.appMetadata.get('facilityMaster')).releaseOrder, 2); assert.deepEqual(await db.facilities.get('user:f'), user())
})
test('user conflict rejects whole restore including original 13 stores', async () => {
  await db.facilities.put(user()); const backup = await createBackup(); backup.data.facilities[0].name = '衝突'
  await db.trips.put(trip()); const before = await state(); await assert.rejects(importBackup(file(backup)), /衝突/)
  assert.deepEqual(await state(), before)
})
test('restore late failure rolls back all original and new stores', async () => {
  await applyFacilityMaster(master(2)); await db.facilities.put(user()); const backup = await createBackup()
  for (const table of db.tables) await table.clear()
  await applyFacilityMaster(master()); await db.trips.put(trip()); const before = await state()
  const original = db.appMetadata.bulkPut; db.appMetadata.bulkPut = async () => { throw new Error('injected restore failure') }
  try { await assert.rejects(importBackup(file(backup)), /injected/) } finally { db.appMetadata.bulkPut = original }
  assert.deepEqual(await state(), before)
})
for (const kind of ['duplicate', 'missing parent', 'bad metadata', 'missing reference', 'wrong parent', 'same release', 'unknown metadata']) test(`v6 rejects ${kind} without partial writes`, async () => {
  await applyFacilityMaster(master()); await withReferences(); const backup = await createBackup(), before = await state()
  if (kind === 'duplicate') backup.data.facilities.push(copy(backup.data.facilities[0]))
  if (kind === 'missing parent') backup.data.zones[0].facilityId = 'official:missing'
  if (kind === 'bad metadata') backup.data.appMetadata[0].releaseOrder = 99
  if (kind === 'missing reference') backup.data.trips[0].facilityId = 'official:missing'
  if (kind === 'wrong parent') delete backup.data.catches[0].facilityId
  if (kind === 'same release') { const m = master(); m.facilities[0].name = '差異'; const { canonicalizeFacilityMaster } = await import(pathToFileURL(paths.facilityMaster).href); backup.data.appMetadata[0].canonicalContent = canonicalizeFacilityMaster(m).value; backup.data.facilities[0].name = '差異' }
  if (kind === 'unknown metadata') backup.data.appMetadata.push({ key: 'other' })
  await assert.rejects(importBackup(file(backup))); assert.deepEqual(await state(), before)
})
test('v6 rejects malformed file empty text version and missing nullable/new tables', async () => {
  for (const text of ['', '{', 'null', JSON.stringify({ ...legacyBackup(), version: 6 }), JSON.stringify({ ...legacyBackup(), version: 7 })]) {
    await assert.rejects(importBackup(new File([text], 'synthetic.json')))
  }
  assert.throws(() => validateFacilityStorage({ facilities: [{ ...user(), name: 3 }], zones: [], appMetadata: [] }))
  for (const extension of [NaN, undefined, new Date()]) assert.throws(() => validateFacilityStorage({ facilities: [{ ...user(), extension }], zones: [], appMetadata: [] }))
  assert.throws(() => validateBackup({ ...legacyBackup(), version: 6 }))
})
test('versionchange closes stale connection without reopen or input-clearing reload', async () => {
  const Dexie = (await import('dexie')).default
  const next = new Dexie(db.name); next.version(10).stores({ extraTestOnly: 'id' })
  await next.open(); assert.equal(databaseConnection.state, 'changed'); assert.equal(db.isOpen(), false)
  await assert.rejects(db.trips.toArray(), /closed/i)
  next.close(); await next.delete()
})
test('blocked v7 open waits for a legacy connection and reports ready after safe close', async () => {
  db.close(); await db.delete(); const { db: legacy } = await import(pathToFileURL(paths.legacy).href)
  await legacy.open()
  const keepOpen = () => false; legacy.on('versionchange', keepOpen)
  let unblock
  const blocked = new Promise(resolve => { unblock = resolve })
  const listener = () => unblock(); db.on('blocked', listener)
  const pending = db.open()
  try {
    await blocked; assert.equal(databaseConnection.state, 'blocked'); legacy.close(); await pending
    assert.equal(db.verno, 9); assert.equal(databaseConnection.state, 'ready')
  } finally { legacy.on('versionchange').unsubscribe(keepOpen); db.on('blocked').unsubscribe(listener); legacy.close() }
})
test('unmodified legacy v6 connection releases upgrade and cannot erase added stores', async () => {
  db.close(); await db.delete(); const { db: legacy } = await import(pathToFileURL(paths.legacy).href)
  await legacy.open(); await legacy.trips.put(trip())
  await db.open(); assert.deepEqual(copy(await db.trips.get(40)), copy(trip()))
  await applyFacilityMaster(master()); const before = copy(await readFacilityStorage())
  // Existing deployed code uses Dexie's default close/auto-open. Accept a safe VersionError or a read.
  try { assert.deepEqual(copy(await legacy.trips.get(40)), copy(trip())) }
  catch (error) { assert.equal(error.name, 'VersionError') }
  assert.deepEqual(copy(await readFacilityStorage()), before)
  legacy.close()
})
