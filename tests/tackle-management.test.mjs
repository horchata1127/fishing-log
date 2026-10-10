import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-tackle-test-'))
const paths = Object.fromEntries(['database', 'fishSpecies', 'fishMaster', 'tackleManagement', 'catchRegistration', 'backup', 'legacy', 'legacy1', 'legacy2', 'legacy3'].map(name => [name, join(directory, `${name}.mjs`)]))
const databaseSource = await readFile(new URL('../src/db/database.ts', import.meta.url), 'utf8')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
for (const [name, source] of [['database', 'db/database.ts'], ['fishSpecies', 'utils/fishSpecies.ts'], ['fishMaster', 'data/fishMaster.ts'], ['tackleManagement', 'utils/tackleManagement.ts'], ['catchRegistration', 'utils/catchRegistration.ts'], ['backup', 'utils/backup.ts']]) {
  const code = compile(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8'))
    .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href))
    .replace("'./tackleManagement'", JSON.stringify(pathToFileURL(paths.tackleManagement).href))
    .replace("'./fishSpecies'", JSON.stringify(pathToFileURL(paths.fishSpecies).href))
    .replace("'../data/fishMaster'", JSON.stringify(pathToFileURL(paths.fishMaster).href))
  await writeFile(paths[name], code)
}
await writeFile(paths.legacy, compile(databaseSource.slice(0, databaseSource.indexOf('db.version(5)'))))
for (const version of [1, 2, 3]) {
  await writeFile(paths[`legacy${version}`], compile(databaseSource.slice(0, databaseSource.indexOf(`db.version(${version + 1})`))))
}
const { db } = await import(pathToFileURL(paths.database).href)
const { saveTackle, setTackleActive, registerInitialTackles, loadTackleData, availableTackleSets, createTrip, updateTripTackles, suggestTackleSetId } = await import(pathToFileURL(paths.tackleManagement).href)
const { registerCatch, registerSameAsPrevious } = await import(pathToFileURL(paths.catchRegistration).href)
const { createBackup, importBackup, validateBackup, backupTableNames, allBackupTableNames } = await import(pathToFileURL(paths.backup).href)
after(async () => {
  db.close()
  for (const path of Object.values(paths)) await unlink(path)
  await rmdir(directory)
})
const trip = () => ({ fishingAreaName: 'ニレ池', fishingDate: '2026-10-24', fishingStyle: 'AREA_TROUT', startedAt: new Date('2026-10-24T00:00:00Z') })
const manual = { kind: 'manual', lureName: '未登録ルアー', lureColor: '青' }
const input = (setId, time = '2026-10-24T01:00:00Z') => ({ tripId: 60, caughtAt: new Date(time), ...(setId === undefined ? {} : { tackleSetId: setId }) })
const state = async () => JSON.stringify(await Promise.all(db.tables.map(async table => [table.name, await table.orderBy(table.schema.primKey.name).toArray()])))
const jsonBackup = async () => JSON.parse(JSON.stringify(await createBackup()))
const restore = value => importBackup({ text: async () => JSON.stringify(value) })
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    await db.trips.add({ id: 60, ...trip() })
    await db.lureManufacturers.add({ id: 10, name: 'Maker' })
    await db.lureSeries.add({ id: 20, manufacturerId: 10, name: 'Series' })
    await db.lureModels.add({ id: 30, seriesId: 20, name: 'Model', category: 'スプーン' })
    await db.lureVariants.add({ id: 40, modelId: 30, colorName: 'Color' })
    await db.myLures.add({ id: 50, variantId: 40, active: true })
  })
})
async function setupSet() {
  const rodId = await saveTackle('rods', { manufacturer: 'Palms', modelName: 'クワトロ', modelCode: 'QFRGS-48XUL', length: '4ft8in', power: 'XUL', active: true })
  const mainLineId = await saveTackle('lines', { material: 'ナイロン', strengthLb: 3, active: true })
  const leaderLineId = await saveTackle('lines', { material: 'フロロ', sizeGo: 0.5, active: true })
  const reelId = await saveTackle('reels', { manufacturer: 'SHIMANO', modelName: 'ヴァンキッシュ', mainLineId, active: true })
  const setId = await saveTackle('tackleSets', { name: 'ニレ池用', rodId, reelId, leaderLineId, memo: 'テスト', active: true })
  await updateTripTackles(60, [setId])
  return { rodId, reelId, mainLineId, leaderLineId, setId }
}

test('initial candidates are explicit, exactly eight, unknown details unset and no sets created', async () => {
  assert.equal((await loadTackleData()).rods.length, 0)
  assert.equal(await registerInitialTackles(), 8)
  const data = await loadTackleData()
  assert.equal(data.rods.length, 2)
  assert.deepEqual(data.rods.map(row => row.modelCode), ['QFRGS-48XUL', 'TRMK-504UL'])
  assert.equal(data.reels.length, 3)
  assert.ok(data.reels.every(row => row.size === undefined && row.year === undefined && row.mainLineId === undefined))
  assert.deepEqual(data.lines.map(row => row.strengthLb), [3, 3.5, 4])
  assert.ok(data.lines.every(row => row.manufacturer === undefined))
  assert.deepEqual(data.tackleSets, [])
  const before = await state()
  assert.equal(await registerInitialTackles(), 0)
  assert.equal(await state(), before)
})

test('initial candidate rerun after edit and deactivation preserves ID without duplicates', async () => {
  await registerInitialTackles()
  const rod = (await db.rods.toArray())[0]
  await saveTackle('rods', { ...rod, modelName: '編集済み', active: false }, rod.id)
  assert.equal(await registerInitialTackles(), 0)
  assert.equal(await db.rods.count(), 2)
  assert.equal((await db.rods.get(rod.id)).modelName, '編集済み')
  assert.equal((await db.rods.get(rod.id)).active, false)
})

test('individual masters register, edit in place, deactivate and reactivate without physical deletion', async () => {
  const ids = await setupSet()
  for (const [table, id] of [['rods', ids.rodId], ['reels', ids.reelId], ['lines', ids.mainLineId]]) {
    const row = await db.table(table).get(id)
    assert.equal(await saveTackle(table, { ...row, memo: '変更' }, id), id)
    assert.equal((await db.table(table).get(id)).memo, '変更')
    await setTackleActive(table, id, false)
    assert.equal((await db.table(table).get(id)).active, false)
    await setTackleActive(table, id, true)
    assert.equal((await db.table(table).get(id)).active, true)
  }
})

test('sets share components, allow no leader and preserve IDs when edited or stopped', async () => {
  const { rodId, reelId, setId } = await setupSet()
  const second = await saveTackle('tackleSets', { name: '共用セット', rodId, reelId, active: true })
  assert.equal((await db.tackleSets.get(second)).leaderLineId, undefined)
  await saveTackle('tackleSets', { ...(await db.tackleSets.get(setId)), name: '変更後' }, setId)
  assert.equal((await db.tackleSets.get(setId)).name, '変更後')
  await setTackleActive('tackleSets', setId, false)
  assert.equal(await db.tackleSets.count(), 2)
  assert.deepEqual((await availableTackleSets()).map(row => row.id), [second])
})

test('trip can begin without a set and later change multiple planned sets', async () => {
  const { setId, rodId, reelId } = await setupSet()
  const second = await saveTackle('tackleSets', { name: '予備', rodId, reelId, active: true })
  const id = await createTrip(trip())
  assert.equal((await db.trips.get(id)).tackleSetIds, undefined)
  await updateTripTackles(id, [setId, second])
  assert.deepEqual((await db.trips.get(id)).tackleSetIds, [setId, second])
  assert.equal((await availableTackleSets(await db.trips.get(id))).length, 2)
  await updateTripTackles(id, [])
  assert.deepEqual((await db.trips.get(id)).tackleSetIds, [])
  await db.trips.update(id, { endedAt: new Date() })
  await assert.rejects(updateTripTackles(id, [setId]))
})

test('catch without tackle keeps legacy trip supported and no snapshot is invented', async () => {
  const id = await registerCatch(input(), manual)
  const row = await db.catches.get(id)
  assert.equal(row.tackleSetId, undefined)
  assert.equal(row.tackleSnapshot, undefined)
})

test('catch snapshots all components and later edits or re-spooling cannot alter past catch', async () => {
  const { setId, rodId, reelId, mainLineId, leaderLineId } = await setupSet()
  const id = await registerCatch(input(setId), manual)
  const first = await db.catches.get(id)
  assert.equal(first.tackleSnapshot.version, 1)
  assert.equal(first.tackleSnapshot.rod.modelCode, 'QFRGS-48XUL')
  assert.equal(first.tackleSnapshot.mainLine.strengthLb, 3)
  assert.equal(first.tackleSnapshot.leader.sizeGo, 0.5)
  const newLine = await saveTackle('lines', { material: 'PE', sizeGo: 0.3, active: true })
  await saveTackle('reels', { ...(await db.reels.get(reelId)), mainLineId: newLine }, reelId)
  await saveTackle('rods', { ...(await db.rods.get(rodId)), modelName: '変更後' }, rodId)
  await saveTackle('lines', { ...(await db.lines.get(mainLineId)), strengthLb: 4 }, mainLineId)
  await saveTackle('lines', { ...(await db.lines.get(leaderLineId)), sizeGo: 1 }, leaderLineId)
  await saveTackle('tackleSets', { ...(await db.tackleSets.get(setId)), name: '新名', leaderLineId: undefined }, setId)
  assert.deepEqual(await db.catches.get(id), first)
  const next = await registerSameAsPrevious(60, new Date('2026-10-24T02:00:00Z'))
  const saved = await db.catches.get(next)
  assert.equal(saved.tackleSetId, setId)
  assert.equal(saved.tackleSnapshot.setName, '新名')
  assert.equal(saved.tackleSnapshot.mainLine.material, 'PE')
  assert.equal(saved.tackleSnapshot.leader, undefined)
  assert.deepEqual(await db.catches.get(id), first)
})

test('unknown legacy tackle ID remains historical but same-as-previous does not copy it', async () => {
  await db.catches.add({ id: 70, ...input(), lureName: '古い手入力', tackleSetId: 999 })
  const id = await registerSameAsPrevious(60, new Date('2026-10-24T02:00:00Z'))
  assert.equal((await db.catches.get(id)).tackleSetId, undefined)
  assert.equal((await db.catches.get(70)).tackleSetId, 999)
})

test('next catch suggests the preceding saved set only while available; unspecified stays unspecified', async () => {
  const { setId } = await setupSet()
  await registerCatch(input(setId), manual)
  const sets = await availableTackleSets(await db.trips.get(60))
  assert.equal(suggestTackleSetId(await db.catches.toArray(), sets), setId)
  assert.equal(suggestTackleSetId(await db.catches.toArray(), []), undefined)
  const before = await state()
  // 候補の算出・表示中のキャンセルでは永続化処理を呼ばない。
  assert.equal(suggestTackleSetId(await db.catches.toArray(), sets), setId)
  assert.equal(await state(), before)
  await registerCatch(input(undefined, '2026-10-24T02:00:00Z'), manual)
  assert.equal(suggestTackleSetId((await db.catches.toArray()).reverse(), sets), undefined)
})

test('unplanned or stopped sets are rejected and same-as-previous cannot silently reuse them', async () => {
  const { setId, rodId } = await setupSet()
  await registerCatch(input(setId), manual)
  await updateTripTackles(60, [])
  let before = await state()
  await assert.rejects(registerCatch(input(setId), manual))
  await assert.rejects(registerSameAsPrevious(60, new Date('2026-10-24T02:00:00Z')))
  assert.equal(await state(), before)
  await updateTripTackles(60, [setId])
  await setTackleActive('rods', rodId, false)
  before = await state()
  assert.deepEqual(await availableTackleSets(await db.trips.get(60)), [])
  await assert.rejects(registerCatch(input(setId), manual))
  assert.equal(await state(), before)
})

test('catalog lure automatic ownership still reuses one individual with tackle selected', async () => {
  const { setId } = await setupSet()
  const first = await registerCatch(input(setId), { kind: 'catalog', variantId: 40 })
  const next = await registerSameAsPrevious(60, new Date('2026-10-24T02:00:00Z'))
  const a = await db.catches.get(first), b = await db.catches.get(next)
  assert.equal(a.lureId, b.lureId)
  assert.notEqual(a.lureId, 50)
  assert.equal(await db.myLures.count(), 2)
  assert.equal(b.tackleSetId, setId)
})

test('catch write failure rolls back lure creation and snapshot with no master changes', async () => {
  const { setId } = await setupSet()
  const before = await state()
  const hook = () => { throw new Error('injected catch failure') }
  db.catches.hook('creating', hook)
  try { await assert.rejects(registerCatch(input(setId), { kind: 'catalog', variantId: 40 }), /injected/) }
  finally { db.catches.hook('creating').unsubscribe(hook) }
  assert.equal(await state(), before)
})

for (const [name, operation] of [
  ['missing rod reference', () => saveTackle('tackleSets', { name: 'bad', rodId: 999, reelId: 999, active: true })],
  ['missing reel main line', () => saveTackle('reels', { manufacturer: 'M', modelName: 'R', mainLineId: 999, active: true })],
  ['missing leader', async () => { const s = (await db.tackleSets.toArray())[0]; return saveTackle('tackleSets', { ...s, leaderLineId: 999 }, s.id) }],
  ['invalid line strength', () => saveTackle('lines', { material: 'ナイロン', strengthLb: -1, active: true })],
  ['invalid material', () => saveTackle('lines', { material: 'unknown', active: true })],
  ['duplicate planned set', async () => { const s = (await db.tackleSets.toArray())[0]; return updateTripTackles(60, [s.id, s.id]) }],
  ['missing planned set', () => updateTripTackles(60, [999])],
]) test(`reject ${name} without mutations`, async () => {
  await setupSet()
  const before = await state()
  await assert.rejects(operation())
  assert.equal(await state(), before)
})

test('v4 backup round-trip preserves all twelve tables, states, references and historical snapshot', async () => {
  const { setId, reelId } = await setupSet()
  await registerCatch(input(setId), { kind: 'catalog', variantId: 40 })
  await saveTackle('reels', { ...(await db.reels.get(reelId)), mainLineId: undefined }, reelId)
  const before = await state()
  const backup = await jsonBackup()
  assert.equal(backup.version, 4)
  assert.deepEqual(Object.keys(backup.data).sort(), [...allBackupTableNames].sort())
  validateBackup(backup)
  for (const table of db.tables) await table.clear()
  await restore(backup)
  assert.equal(await state(), before)
  assert.ok((await db.catches.toArray())[0].caughtAt instanceof Date)
  assert.ok((await db.catches.toArray())[0].tackleSnapshot.mainLine)
})

for (const version of [1, 2, 3]) test(`old v${version} backup restores original IDs with empty new tables and no inferred tackle`, async () => {
  await db.catches.add({ id: 70, ...input(), tackleSetId: 999 })
  const backup = await jsonBackup()
  backup.version = version
  if (version === 1) delete backup.data.tripEvents
  await setupSet()
  await restore(backup)
  assert.equal((await db.catches.get(70)).tackleSetId, 999)
  assert.equal((await db.catches.get(70)).tackleSnapshot, undefined)
  assert.equal((await db.myLures.get(50)).ownershipStatus, undefined)
  assert.equal((await db.trips.get(60)).tackleSetIds, undefined)
  for (const table of ['rods', 'reels', 'lines', 'tackleSets']) assert.equal(await db.table(table).count(), 0)
})

for (const [name, mutate] of [
  ['missing master array', b => { delete b.data.rods }],
  ['duplicate master ID', b => { b.data.rods.push({ ...b.data.rods[0] }) }],
  ['invalid active', b => { b.data.rods[0].active = 'yes' }],
  ['blank model name', b => { b.data.reels[0].modelName = '' }],
  ['bad set rod', b => { b.data.tackleSets[0].rodId = 999 }],
  ['bad main line', b => { b.data.reels[0].mainLineId = 999 }],
  ['bad leader', b => { b.data.tackleSets[0].leaderLineId = 999 }],
  ['bad trip reference', b => { b.data.trips[0].tackleSetIds = [999] }],
  ['bad snapshot version', b => { b.data.catches[0].tackleSnapshot.version = 2 }],
  ['bad snapshot set', b => { b.data.catches[0].tackleSetId = 999; b.data.catches[0].tackleSnapshot.setId = 999 }],
  ['bad snapshot rod', b => { b.data.catches[0].tackleSnapshot.rod.id = 999 }],
  ['snapshot main line mismatch', b => { b.data.catches[0].tackleSnapshot.reel.mainLineId = undefined }],
]) test(`v4 backup rejects ${name} before any write`, async () => {
  const { setId } = await setupSet()
  await registerCatch(input(setId), manual)
  const before = await state(), backup = await jsonBackup()
  mutate(backup)
  await assert.rejects(restore(backup))
  assert.equal(await state(), before)
})

test('failure in final tackle table during restore rolls back all twelve tables', async () => {
  const { setId } = await setupSet()
  await registerCatch(input(setId), manual)
  const backup = await jsonBackup()
  await db.trips.update(60, { memo: '現在のデータ' })
  const before = await state()
  const hook = () => { throw new Error('injected final-table failure') }
  db.tackleSets.hook('creating', hook)
  try { await assert.rejects(restore(backup), /injected/) }
  finally { db.tackleSets.hook('creating').unsubscribe(hook) }
  assert.equal(await state(), before)
})

test('v4 to v6 migration preserves 1886 colors, 1885 unverified individuals, owned and historical IDs', async () => {
  await db.delete()
  const { db: legacy } = await import(pathToFileURL(paths.legacy).href)
  await legacy.open()
  assert.equal(legacy.verno, 4)
  await legacy.transaction('rw', legacy.tables, async () => {
    await legacy.trips.add({ id: 60, ...trip() })
    await legacy.lureManufacturers.add({ id: 10, name: 'Maker' })
    await legacy.lureSeries.add({ id: 20, manufacturerId: 10, name: 'Series' })
    await legacy.lureModels.add({ id: 30, seriesId: 20, name: 'Model' })
    await legacy.lureVariants.bulkAdd(Array.from({ length: 1886 }, (_, i) => ({ id: 100 + i, modelId: 30, colorName: `色${i}` })))
    await legacy.myLures.bulkAdd(Array.from({ length: 1885 }, (_, i) => ({ id: 3000 + i, variantId: 100 + i, active: true })))
    await legacy.myLures.add({ id: 6000, variantId: 100, active: true, ownershipStatus: 'owned' })
    await legacy.catches.add({ id: 70, ...input(), lureId: 6000, tackleSetId: 999 })
    await legacy.tripEvents.add({ id: 80, tripId: 60, type: 'pellet', occurredAt: new Date('2026-10-24T00:30:00Z') })
  })
  const before = await Promise.all(backupTableNames.map(name => legacy.table(name).orderBy('id').toArray()))
  legacy.close()
  await db.open()
  assert.equal(db.verno, 6)
  assert.deepEqual(await Promise.all(backupTableNames.map(name => db.table(name).orderBy('id').toArray())), before)
  assert.equal(db.tables.length, 13)
  for (const name of ['rods', 'reels', 'lines', 'tackleSets']) assert.equal(await db.table(name).count(), 0)
  assert.equal((await db.myLures.toArray()).filter(row => row.ownershipStatus === undefined).length, 1885)
})

for (const version of [1, 2, 3]) test(`DB v${version} upgrades to v6 without changing historical trip and catch`, async () => {
  await db.delete()
  const { db: legacy } = await import(pathToFileURL(paths[`legacy${version}`]).href)
  await legacy.open()
  await legacy.trips.add({ id: 60, ...trip() })
  await legacy.catches.add({ id: 70, ...input(), lureName: '手入力', tackleSetId: 999 })
  const rows = [await legacy.trips.toArray(), await legacy.catches.toArray()]
  legacy.close()
  await db.open()
  assert.equal(db.verno, 6)
  assert.deepEqual([await db.trips.toArray(), await db.catches.toArray()], rows)
  for (const name of ['rods', 'reels', 'lines', 'tackleSets']) assert.equal(await db.table(name).count(), 0)
})
