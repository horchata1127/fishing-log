import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-location-test-'))
const sources = { database: 'db/database.ts', facilityMaster: 'utils/facilityMaster.ts', facilityStorage: 'utils/facilityStorage.ts', tripLocations: 'utils/tripLocations.ts',
  tackleManagement: 'utils/tackleManagement.ts', catchRegistration: 'utils/catchRegistration.ts', fishSpecies: 'utils/fishSpecies.ts', fishMaster: 'data/fishMaster.ts', backup: 'utils/backup.ts', tripFacilityLink:'utils/tripFacilityLink.ts' }
const paths = Object.fromEntries(Object.keys(sources).map(n => [n, join(directory, `${n}.mjs`)]))
for (const [name, source] of Object.entries(sources)) {
  let code = ts.transpileModule(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
  for (const dependency of Object.keys(sources)) {
    const specifier = dependency === 'database' ? '../db/database' : dependency === 'fishMaster' ? '../data/fishMaster' : `./${dependency}`
    code = code.replace(`'${specifier}'`, JSON.stringify(pathToFileURL(paths[dependency]).href))
  }
  await writeFile(paths[name], code)
}
const { db } = await import(pathToFileURL(paths.database).href)
const { addUserFacility, addUserZone, loadLocationChoices, changeCurrentZone } = await import(pathToFileURL(paths.tripLocations).href)
const { createTrip } = await import(pathToFileURL(paths.tackleManagement).href)
const { updateCatch, registerCatch, registerSameAsPrevious } = await import(pathToFileURL(paths.catchRegistration).href)
const { applyFacilityMaster } = await import(pathToFileURL(paths.facilityStorage).href)
const { createBackup, validateBackup, importBackup } = await import(pathToFileURL(paths.backup).href)
const { previewTripFacilityLink, saveTripFacilityLink, listLinkableFacilities } = await import(pathToFileURL(paths.tripFacilityLink).href)
after(async () => { db.close(); for (const file of Object.values(paths)) await unlink(file); await rmdir(directory) })
beforeEach(async () => { await db.open(); for (const table of db.tables) await table.clear() })
const trip = extra => ({ fishingAreaName: '架空釣り場', fishingDate: '2026-10-11', startedAt: new Date('2026-10-11T00:00:00Z'), ...extra })
const manual = { kind: 'manual', lureName: '試験ルアー', lureColor: '赤' }
const input = (tripId, extra) => ({ tripId, caughtAt: new Date('2026-10-11T01:00:00Z'), memo: 'ポイントのメモ', ...extra })
const state = async () => JSON.stringify(Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()]))))
const savedCatch = async (tripId, extra) => db.catches.get(await registerCatch(input(tripId, extra), manual))
async function setup() {
  const facilityId = await addUserFacility('架空施設'), lower = await addUserZone(facilityId, '下池'), upper = await addUserZone(facilityId, '上池')
  const tripId = await createTrip(trip({ facilityId, currentZoneId: lower }))
  return { facilityId, lower, upper, tripId }
}

test('RC26 area edit sets, changes and clears zone without changing unrelated catch or any other table', async () => {
  const { tripId, facilityId, lower, upper } = await setup()
  const original = await savedCatch(tripId, { resultType: 'lost', lostDistance: 'near', rangeLevel: '中層', action: 'ただ巻き', actionLength: 'long', retrieveSpeed: '普通', fishSizeCm: 24 })
  const otherTables = async () => JSON.stringify(Object.fromEntries(await Promise.all(db.tables.filter(t => t.name !== 'catches').map(async t => [t.name, await t.toArray()]))))
  const before = await otherTables()
  const unrelated = row => { const { facilityId, zoneId, locationSnapshot, ...rest } = row; return JSON.parse(JSON.stringify(rest)) }
  for (const zoneId of [undefined, upper, lower, undefined]) {
    const current = await db.catches.get(original.id)
    await updateCatch(original.id, { ...current, location: { expectedFacilityId: facilityId, expectedCurrentZoneId: lower, zoneId } }, undefined, current)
    const changed = await db.catches.get(original.id)
    assert.equal(changed.zoneId, zoneId); assert.deepEqual(unrelated(changed), unrelated(original))
    assert.equal(changed.locationSnapshot.facilityName, original.locationSnapshot.facilityName)
    assert.equal(await otherTables(), before)
  }
})
test('RC26 unresolved retained zone is readable and unchanged save retains its snapshot; forged selection rejects atomically', async () => {
  const { tripId, facilityId, lower, upper } = await setup(), original = await savedCatch(tripId)
  await db.catches.update(original.id, { zoneId: 'user:missing', locationSnapshot: { facilityName: '旧施設名', zoneName: '旧エリア' } })
  const current = await db.catches.get(original.id), before = await state()
  await loadLocationChoices(facilityId, 'user:missing', true); assert.equal(await state(), before)
  await updateCatch(current.id, { ...current }, undefined, current)
  assert.deepEqual(JSON.parse(JSON.stringify(await db.catches.get(current.id))), JSON.parse(JSON.stringify(current)))
  const other = await addUserFacility('他施設'), foreign = await addUserZone(other, '他池'), protectedState = await state()
  await assert.rejects(updateCatch(current.id, { ...current, location: { expectedFacilityId: facilityId, expectedCurrentZoneId: lower, zoneId: foreign } }))
  assert.equal(await state(), protectedState)
  await updateCatch(current.id, { ...current, location: { expectedFacilityId: facilityId, expectedCurrentZoneId: lower, zoneId: upper } })
  assert.equal((await db.catches.get(current.id)).zoneId, upper)
})
test('RC26 no-facility and no-zone trips remain editable, canceled selection writes nothing, stale catch rejects', async () => {
  const tripId = await createTrip(trip()), row = await savedCatch(tripId), before = await state()
  assert.deepEqual((await loadLocationChoices(undefined, undefined, true)).zones, [])
  const draft = { ...row, zoneId: 'user:draft' }; assert.notEqual(draft.zoneId, row.zoneId); assert.equal(await state(), before)
  await updateCatch(row.id, { ...row }, undefined, row)
  const current = await db.catches.get(row.id)
  await db.catches.update(row.id, { memo: '別画面で編集' }); const changed = await state()
  await assert.rejects(updateCatch(row.id, { ...current }, undefined, current), /別の画面/)
  assert.equal(await state(), changed)
})

test('RC26 clearing snapshot-only legacy area keeps the recorded facility name and all non-area fields', async () => {
  const tripId = await createTrip(trip()), row = await savedCatch(tripId)
  await db.catches.update(row.id, { locationSnapshot: { facilityName: '旧釣り場名', zoneName: '旧エリア名' } })
  const current = await db.catches.get(row.id)
  await updateCatch(row.id, { ...current, location: { expectedFacilityId: undefined, expectedCurrentZoneId: undefined, zoneId: undefined } }, undefined, current)
  const edited = await db.catches.get(row.id)
  assert.deepEqual(edited.locationSnapshot, { facilityName: '旧釣り場名' })
  const { locationSnapshot, ...rest } = edited, { locationSnapshot: oldSnapshot, ...old } = current
  assert.deepEqual(JSON.parse(JSON.stringify(rest)), JSON.parse(JSON.stringify(old)))
})
const zone = () => ({ id: 'official:z', name: '公式架空池', sortOrder: 1, sourceUrl: null })
const facility = () => ({ id: 'official:f', name: '公式架空施設', prefecture: '長野県', address: null, facilityTypes: ['pond'], lureAllowed: true,
  operationStatus: 'open', officialUrl: null, sourceUrl: null, verifiedAt: null, aliases: [], zones: [zone()] })
const master = (order, facilities) => ({ schemaVersion: 1, masterVersion: `test-${order}`, distributionMode: 'full', releaseOrder: order, facilities })

async function linkSetup(located = false) {
  await applyFacilityMaster(master(1,[facility(),{ ...facility(),id:'official:other',name:'別の正式施設',zones:[] }]))
  const id = await createTrip(trip(located ? { facilityId:'official:f',currentZoneId:'official:z' } : { fishingAreaName:'未登録の自由入力名' }))
  await savedCatch(id); await savedCatch(id,{ resultType:'lost',lostDistance:'near' })
  return id
}
test('RC27 preview/cancel is readonly; manual linking updates only trip ID/name fields and keeps all other 18 tables', async () => {
  const id = await linkSetup(), before = await state(), original = await db.trips.get(id)
  const preview = await previewTripFacilityLink(id,'official:f')
  assert.equal(await state(),before); assert.equal(preview.affected.length,0); assert.equal((await db.trips.get(id)).fishingAreaName,'未登録の自由入力名')
  const saved = await saveTripFacilityLink(preview,false)
  assert.deepEqual(saved,{ ...original,facilityId:'official:f',fishingAreaName:'公式架空施設' })
  const after = JSON.parse(await state()), old = JSON.parse(before)
  for (const key of Object.keys(old)) if (key !== 'trips') assert.deepEqual(after[key],old[key])
  assert.equal((await listLinkableFacilities()).length,2)
})
test('RC27 facility change requires consent for catch/lost legacy areas and current area; preserves all catch snapshots and backup', async () => {
  const id = await linkSetup(true), before = await state(), preview = await previewTripFacilityLink(id,'official:other')
  assert.equal(preview.affected.length,2); assert.equal(preview.clearCurrentZone,true)
  await assert.rejects(saveTripFacilityLink(preview,false),/確認/); assert.equal(await state(),before)
  await saveTripFacilityLink(preview,true)
  const after = JSON.parse(await state()), old = JSON.parse(before)
  for (const key of Object.keys(old)) if (key !== 'trips') assert.deepEqual(after[key],old[key])
  assert.equal((await db.trips.get(id)).currentZoneId,undefined)
  const backup = JSON.parse(JSON.stringify(await createBackup())); validateBackup(backup)
  await importBackup({ text:async () => JSON.stringify(backup) })
  assert.deepEqual((await db.catches.toArray()).map(c => c.zoneId),['official:z','official:z'])
})
test('RC27 rejects nonexistent/user/retired targets without creating IDs or changing free text', async () => {
  const id = await linkSetup(), user = await addUserFacility('任意施設')
  await db.facilities.update('official:other',{ catalogState:'retired' })
  const before = await state()
  for (const target of ['official:missing',user,'official:other','']) await assert.rejects(previewTripFacilityLink(id,target))
  assert.equal(await state(),before)
})
test('RC27 stale catch/master previews reject and write failure leaves original data intact', async () => {
  const id = await linkSetup(), preview = await previewTripFacilityLink(id,'official:f'), row = await db.catches.where('tripId').equals(id).first()
  await db.catches.update(row.id,{memo:'別画面の変更'}); const changed = await state()
  await assert.rejects(saveTripFacilityLink(preview,true),/変更/); assert.equal(await state(),changed)
  const fresh = await previewTripFacilityLink(id,'official:f'), update = db.trips.update
  try { db.trips.update = async () => { throw Error('保存障害') }; await assert.rejects(saveTripFacilityLink(fresh,true),/保存障害/) } finally { db.trips.update = update }
  assert.equal(await state(),changed)
})

test('zero facilities: free input catch and same-as-previous retain legacy fields without location', async () => {
  assert.deepEqual((await loadLocationChoices()).facilities, [])
  const id = await createTrip(trip()), first = await savedCatch(id)
  const second = await db.catches.get(await registerSameAsPrevious(id, new Date()))
  for (const row of [first, second]) {
    assert.equal(row.facilityId, undefined); assert.equal(row.zoneId, undefined); assert.equal(row.locationSnapshot, undefined)
    assert.equal(row.lureName, manual.lureName)
  }
  assert.equal(first.memo, 'ポイントのメモ')
})
test('user names trim, IDs survive reopening, additions never touch existing records', async () => {
  await db.trips.add({ id: 99, ...trip() }); const before = await db.trips.toArray()
  const id = await addUserFacility('  架空施設  '), zid = await addUserZone(id, '  下池  ')
  assert.match(id, /^user:[0-9a-f-]{36}$/); assert.match(zid, /^user:[0-9a-f-]{36}$/); assert.notEqual(id, zid)
  db.close(); await db.open()
  assert.equal((await db.facilities.get(id)).name, '架空施設'); assert.equal((await db.zones.get(zid)).name, '下池')
  assert.deepEqual(await db.trips.toArray(), before)
})
for (const value of ['', '  ', undefined, null, 0, {}, ['name']]) test(`reject unsafe name ${JSON.stringify(value)}`, async () => {
  const before = await state()
  await assert.rejects(() => addUserFacility(value)); await assert.rejects(() => addUserZone('user:missing', value))
  assert.equal(await state(), before)
})
test('normalized duplicate names reject atomically; zone names may repeat under different facilities', async () => {
  const id = await addUserFacility('Cafe\u0301'), before = await state()
  await assert.rejects(() => addUserFacility(' CAFÉ '), /同じ名称/); assert.equal(await state(), before)
  await addUserZone(id, '下池'); await assert.rejects(() => addUserZone(id, ' 下池 '), /同じ名称/)
  const other = await addUserFacility('別施設'); await addUserZone(other, '下池')
  await assert.rejects(() => addUserZone('user:missing', '池'), /参照先/)
})
test('facility-only trip with zero zones records only its facility snapshot', async () => {
  const facilityId = await addUserFacility('池なし施設'), tripId = await createTrip(trip({ facilityId }))
  assert.deepEqual((await loadLocationChoices(facilityId)).zones, [])
  const row = await savedCatch(tripId)
  assert.equal(row.zoneId, undefined); assert.deepEqual(row.locationSnapshot, { facilityName: '池なし施設' })
})
test('current zone changes affect subsequent catches and previous shortcut, never old snapshots', async () => {
  const { facilityId, lower, upper, tripId } = await setup(), first = await savedCatch(tripId)
  await changeCurrentZone(tripId, upper, lower)
  const second = await db.catches.get(await registerSameAsPrevious(tripId, new Date()))
  assert.equal(first.zoneId, lower); assert.equal(second.zoneId, upper); assert.equal(second.lureName, first.lureName)
  assert.equal(second.locationSnapshot.zoneName, '上池'); assert.deepEqual(await db.catches.get(first.id), first)
  await db.facilities.update(facilityId, { name: '後の施設名' }); await db.zones.update(lower, { name: '後の池名' })
  assert.equal((await db.catches.get(first.id)).locationSnapshot.zoneName, '下池')
  assert.equal((await db.catches.get(first.id)).locationSnapshot.facilityName, '架空施設')
  db.close(); await db.open(); assert.equal((await db.trips.get(tripId)).currentZoneId, upper)
})
test('one-catch override and explicit undefined clear only the catch; same shortcut honors override', async () => {
  const { facilityId, lower, upper, tripId } = await setup()
  const selection = { expectedFacilityId: facilityId, expectedCurrentZoneId: lower, zoneId: upper }
  const first = await savedCatch(tripId, { location: selection })
  assert.equal(first.zoneId, upper); assert.equal((await db.trips.get(tripId)).currentZoneId, lower)
  const cleared = await db.catches.get(await registerSameAsPrevious(tripId, new Date(), { ...selection, zoneId: undefined }))
  assert.equal(cleared.zoneId, undefined); assert.deepEqual(cleared.locationSnapshot, { facilityName: '架空施設' })
  assert.equal((await db.trips.get(tripId)).currentZoneId, lower)
  await changeCurrentZone(tripId, undefined, lower); assert.equal((await db.trips.get(tripId)).currentZoneId, undefined)
})
test('missing and foreign zone IDs reject trip creation and catch/current changes without writes', async () => {
  const { facilityId, lower, tripId } = await setup(), foreign = await addUserFacility('別施設'), foreignZone = await addUserZone(foreign, '別池')
  for (const zoneId of ['user:missing', foreignZone, '', 3, null]) {
    const before = await state()
    await assert.rejects(() => createTrip(trip({ facilityId, currentZoneId: zoneId })))
    await assert.rejects(() => changeCurrentZone(tripId, zoneId, lower))
    await assert.rejects(() => savedCatch(tripId, { location: { expectedFacilityId: facilityId, expectedCurrentZoneId: lower, zoneId } }))
    assert.equal(await state(), before)
  }
  await assert.rejects(() => createTrip(trip({ currentZoneId: lower })), /施設/)
  await assert.rejects(() => createTrip(trip({ facilityId: 'user:missing' })), /参照先/)
})
test('stale modal/current selection refuses save, retaining all rows', async () => {
  const { facilityId, lower, upper, tripId } = await setup()
  await changeCurrentZone(tripId, upper, lower); const before = await state()
  await assert.rejects(() => savedCatch(tripId, { location: { expectedFacilityId: facilityId, expectedCurrentZoneId: lower, zoneId: lower } }), /別の画面/)
  await assert.rejects(() => changeCurrentZone(tripId, undefined, lower), /別の画面/)
  assert.equal(await state(), before)
})
test('broken existing reference cannot be silently repaired by clearing or override', async () => {
  const { lower, upper, tripId } = await setup(); await db.zones.delete(lower); const before = await state()
  await assert.rejects(() => savedCatch(tripId), /参照先/)
  await assert.rejects(() => changeCurrentZone(tripId, upper, lower), /参照先/)
  await assert.rejects(() => changeCurrentZone(tripId, undefined, lower), /参照先/)
  assert.equal(await state(), before)
})
test('retired A policy: exclude new candidates, allow retained current, prevent return after switch/clear', async () => {
  await applyFacilityMaster(master(1, [facility()]))
  const tripId = await createTrip(trip({ facilityId: 'official:f', currentZoneId: 'official:z' }))
  await applyFacilityMaster(master(2, [{ ...facility(), id: 'official:other', zones: [] }]))
  assert.equal((await loadLocationChoices()).facilities.some(f => f.id === 'official:f'), false)
  assert.equal((await loadLocationChoices('official:f', 'official:z')).zones[0].retired, true)
  await assert.rejects(() => createTrip(trip({ facilityId: 'official:f' })), /退役施設/)
  await assert.rejects(() => createTrip(trip({ facilityId: 'official:f', currentZoneId: 'official:z' })), /退役施設/)
  assert.equal((await savedCatch(tripId)).zoneId, 'official:z')
  const extra = await addUserZone('official:f', '追加池', tripId)
  await assert.rejects(() => addUserZone('official:f', '新しい池'), /退役施設/)
  await changeCurrentZone(tripId, extra, 'official:z')
  assert.equal((await loadLocationChoices('official:f', extra)).zones.some(z => z.id === 'official:z'), false)
  await assert.rejects(() => changeCurrentZone(tripId, 'official:z', extra), /退役エリア/)
  const row = await savedCatch(tripId); assert.equal(row.locationSnapshot.facilityName, '公式架空施設')
  await changeCurrentZone(tripId, undefined, extra)
  await assert.rejects(() => changeCurrentZone(tripId, 'official:z', undefined), /退役エリア/)
})
test('retired zone in still-listed facility cannot start a new trip', async () => {
  await applyFacilityMaster(master(1, [facility()]))
  await applyFacilityMaster(master(2, [{ ...facility(), zones: [] }]))
  await assert.rejects(() => createTrip(trip({ facilityId: 'official:f', currentZoneId: 'official:z' })), /退役エリア/)
  assert.deepEqual((await loadLocationChoices('official:f')).zones, [])
})
test('ended trips cannot change zone, add under retired facility or register catches', async () => {
  const { tripId, lower, upper } = await setup(); await db.trips.update(tripId, { endedAt: new Date() }); const before = await state()
  await assert.rejects(() => changeCurrentZone(tripId, upper, lower), /終了/)
  await assert.rejects(() => savedCatch(tripId), /終了/); assert.equal(await state(), before)
})
test('failed addition and catch write roll back all related writes, including auto-owned lure', async () => {
  const { tripId } = await setup()
  await db.lureManufacturers.add({ id: 1, name: '試験' }); await db.lureSeries.add({ id: 1, name: '試験', manufacturerId: 1 })
  await db.lureModels.add({ id: 1, name: '試験', seriesId: 1 }); await db.lureVariants.add({ id: 1, modelId: 1, colorName: '赤' })
  const before = await state(), fail = () => { throw new Error('simulated failure') }
  db.catches.hook('creating', fail)
  try { await assert.rejects(() => registerCatch(input(tripId), { kind: 'catalog', variantId: 1 }), /simulated/) }
  finally { db.catches.hook('creating').unsubscribe(fail) }
  assert.equal(await state(), before)
  db.facilities.hook('creating', fail)
  try { await assert.rejects(() => addUserFacility('失敗施設'), /simulated/) }
  finally { db.facilities.hook('creating').unsubscribe(fail) }
  assert.equal(await state(), before)
})
test('generated location snapshots cannot be replaced by injected input; backup v6 roundtrip keeps exact rows', async () => {
  const { tripId } = await setup()
  const row = await savedCatch(tripId, { facilityId: 'user:fake', zoneId: 'user:fake', locationSnapshot: { facilityName: 'fake' } })
  assert.deepEqual(row.locationSnapshot, { facilityName: '架空施設', zoneName: '下池' }); assert.equal(row.location, undefined)
  const value = JSON.parse(JSON.stringify(await createBackup()))
  assert.equal(value.version, 6); validateBackup(value)
  const before = await state(); await importBackup(new File([JSON.stringify(value)], 'test.json')); assert.equal(await state(), before)
})

test('editing keeps unchanged location snapshots, changes zone and durably clears zone', async () => {
  const { facilityId, lower, upper, tripId } = await setup()
  const id = await registerCatch(input(tripId), manual)
  const original = await db.catches.get(id)
  await db.zones.update(lower, { name: 'renamed' })
  await db.trips.update(tripId, { endedAt: new Date() })
  await updateCatch(id, input(tripId))
  assert.deepEqual(await db.catches.get(id), original)
  const location = zoneId => ({ expectedFacilityId: facilityId, expectedCurrentZoneId: lower, zoneId })
  await updateCatch(id, input(tripId, { location: location(upper) }))
  assert.equal((await db.catches.get(id)).zoneId, upper)
  const before = await state()
  await assert.rejects(updateCatch(id, input(tripId, { location: location('user:missing') })))
  assert.equal(await state(), before)
  await updateCatch(id, input(tripId, { location: location(undefined) }))
  db.close(); await db.open()
  const cleared = await db.catches.get(id)
  assert.equal(cleared.zoneId, undefined)
  assert.equal(cleared.locationSnapshot.zoneName, undefined)
  assert.equal(cleared.facilityId, facilityId)
  assert.equal(await db.catches.count(), 1)
})
