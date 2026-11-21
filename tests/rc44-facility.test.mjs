import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'

const loader = await localTypeScript()
const { db } = await loader.load('src/db/database.ts')
const { rc44Fixture, okutamaId, okutamaZones } = await loader.load('tests/rc44Fixture.ts')
const { applyFacilityMaster, readFacilityStorage } = await loader.load('src/utils/facilityStorage.ts')
const { validateFacilityMaster, planFacilityMasterUpdate } = await loader.load('src/utils/facilityMaster.ts')
const { importBackup, createBackup } = await loader.load('src/utils/backup.ts')
const original = JSON.parse(readFileSync('src/data/facility-master.v1.json', 'utf8'))
const master = JSON.parse(readFileSync('src/data/facility-master.rc44.json', 'utf8'))
const all = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
const sameState = (actual, expected, restored = false) => {
  for (const table of Object.keys(expected)) {
    if (restored && table === 'lureMasterImportHistory') {
      for (const row of expected[table]) assert.ok(actual[table].some(r => JSON.stringify(r) === JSON.stringify(row)), 'Prior history retained')
      assert.ok(actual[table].length > expected[table].length, 'Restore audit appended')
    } else assert.ok(JSON.stringify(actual[table]) === JSON.stringify(expected[table]), `${table} changed`)
  }
}
const restore = value => importBackup({ text: async () => JSON.stringify(value) })
beforeEach(async () => { await db.delete(); await db.open(); await restore(rc44Fixture()) })
after(async () => { db.close(); await db.delete(); await loader.close() })

test('RC44 is exactly one additive facility and five official-source zones; prior 50/73 are identical', async () => {
  assert.equal(validateFacilityMaster(master).ok, true)
  assert.deepEqual(master.facilities.slice(0, 50), original.facilities)
  assert.equal(master.facilities.length, 51)
  assert.equal(master.facilities.flatMap(f => f.zones).length, 78)
  const f = master.facilities.at(-1)
  assert.equal(f.id, okutamaId); assert.equal(f.name, '奥多摩フィッシングセンター')
  assert.equal(f.address, '東京都青梅市御岳2丁目333'); assert.equal(f.prefecture, '東京都')
  assert.deepEqual(f.facilityTypes, ['stream', 'pond']); assert.equal(f.lureAllowed, true)
  assert.equal(f.operationStatus, 'open'); assert.equal(f.officialUrl, 'https://www.okutama-fc.co.jp/')
  assert.deepEqual(f.zones.map(z => z.name), okutamaZones)
  assert.deepEqual(f.zones.map(z => z.sortOrder), [1,2,3,4,5])
  const ids = master.facilities.flatMap(f => [f.id, ...f.zones.map(z => z.id)])
  assert.equal(new Set(ids).size, 129)
  for (const z of f.zones) { assert.ok(z.id.startsWith(`${okutamaId}:`)); assert.equal(z.sourceUrl, f.sourceUrl) }
  const stored = await readFacilityStorage()
  const plan = planFacilityMasterUpdate({ ...stored, applied: stored.appMetadata[0] }, master)
  assert.equal(plan.ok, true)
  for (const [table, added, unchanged] of [['facilities', 1, 50], ['zones', 5, 73]]) {
    assert.equal(plan.value[table].added.length, added)
    assert.equal(plan.value[table].unchanged.length, unchanged)
    assert.deepEqual(plan.value[table].updated, []); assert.deepEqual(plan.value[table].retired, [])
  }
})

test('v10 update preserves every original row across all 27 stores; concurrent and repeated apply do zero writes', async () => {
  const before = await all()
  await Promise.all([applyFacilityMaster(master), applyFacilityMaster(master)])
  const saved = await all()
  assert.equal(saved.facilities.length, 52); assert.equal(saved.zones.length, 80)
  for (const [table, rows] of Object.entries(before)) {
    if (table === 'appMetadata') continue
    if (['facilities', 'zones'].includes(table)) {
      for (const row of rows) assert.deepEqual(saved[table].find(r => r.id === row.id), row)
    } else assert.deepEqual(saved[table], rows, table)
  }
  for (const z of saved.zones.filter(z => z.facilityId === okutamaId)) {
    assert.equal(z.origin, 'official'); assert.equal(z.catalogState, 'listed')
  }
  const hooks = []
  for (const t of db.tables) for (const name of ['creating', 'updating', 'deleting']) {
    const fail = () => { throw new Error(`Unexpected ${t.name} ${name}`) }
    t.hook(name, fail); hooks.push(() => t.hook(name).unsubscribe(fail))
  }
  try { await applyFacilityMaster(master) } finally { hooks.forEach(f => f()) }
  sameState(await all(), saved)
})

test('old v10 import after update and repeat export/import retain Okutama, all user data and IDs', async () => {
  await applyFacilityMaster(master)
  const before = await all()
  await restore(rc44Fixture()); sameState(await all(), before, true)
  const exported = await createBackup()
  await restore(exported); await restore(exported)
  sameState(await all(), before, true)
  assert.equal((await db.appMetadata.get('facilityMaster')).releaseOrder, 2)
})

test('mid-zone-write failure rolls back the facility, zones and metadata atomically', async () => {
  const before = await all()
  const fail = (_key, row) => { if (row.id === `${okutamaId}:lure-pond`) throw new Error('Injected zone failure') }
  db.zones.hook('creating', fail)
  try { await assert.rejects(applyFacilityMaster(master), /Injected zone failure/) }
  finally { db.zones.hook('creating').unsubscribe(fail) }
  sameState(await all(), before)
})

test('edited existing official row is rejected without overwriting it or any user data', async () => {
  const f = (await db.facilities.toArray()).find(f => f.origin === 'official')
  await db.facilities.update(f.id, { name: 'ユーザー編集した名前' })
  const before = await all()
  await assert.rejects(applyFacilityMaster(master))
  sameState(await all(), before)
})

const privatePath = 'docs/rc42/fishing-log-backup-2026-11-21.json'
test('optional local original v10: 51/75 becomes 52/80, all other records preserved; source bytes unchanged', { skip: !existsSync(privatePath) }, async () => {
  const raw = readFileSync(privatePath), hash = createHash('sha256').update(raw).digest('hex')
  const source = JSON.parse(raw)
  assert.equal(source.version, 10)
  await db.delete(); await db.open(); await restore(source)
  const before = await all()
  assert.equal(before.facilities.length, 51); assert.equal(before.zones.length, 75)
  await applyFacilityMaster(master)
  const saved = await all()
  assert.equal(saved.facilities.length, 52); assert.equal(saved.zones.length, 80)
  for (const [table, rows] of Object.entries(before)) {
    if (table === 'appMetadata') continue
    if (['facilities', 'zones'].includes(table)) for (const row of rows) assert.deepEqual(saved[table].find(r => r.id === row.id), row)
    else assert.deepEqual(saved[table], rows, table)
  }
  const exported = await createBackup(); assert.equal(exported.version, 10)
  await restore(exported); await restore(exported); sameState(await all(), saved, true)
  assert.equal(createHash('sha256').update(readFileSync(privatePath)).digest('hex'), hash)
})
