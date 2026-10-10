import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-fish-test-'))
const names = ['database', 'fishSpecies', 'fishMaster', 'catchRegistration', 'tackleManagement', 'backup', 'legacy']
const paths = Object.fromEntries(names.map(name => [name, join(directory, `${name}.mjs`)]))
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const databaseSource = await readFile(new URL('../src/db/database.ts', import.meta.url), 'utf8')
for (const [name, file] of [['database', 'db/database.ts'], ['fishSpecies', 'utils/fishSpecies.ts'], ['fishMaster', 'data/fishMaster.ts'], ['catchRegistration', 'utils/catchRegistration.ts'], ['tackleManagement', 'utils/tackleManagement.ts'], ['backup', 'utils/backup.ts']]) {
  const code = compile(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'))
    .replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
    .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href))
    .replace("'../data/fishMaster'", JSON.stringify(pathToFileURL(paths.fishMaster).href))
    .replace("'./fishSpecies'", JSON.stringify(pathToFileURL(paths.fishSpecies).href))
    .replace("'./tackleManagement'", JSON.stringify(pathToFileURL(paths.tackleManagement).href))
  await writeFile(paths[name], code)
}
await writeFile(paths.legacy, compile(databaseSource.slice(0, databaseSource.indexOf('db.version(6)'))).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie'))))
const { db } = await import(pathToFileURL(paths.database).href)
const { fishMasterSource } = await import(pathToFileURL(paths.fishMaster).href)
const { initialFishSpecies, rainbowFishId, defaultFishSpeciesId, registerInitialFishSpecies, loadFishChoices, saveFishSpecies, setFishSpeciesActive } = await import(pathToFileURL(paths.fishSpecies).href)
const { registerCatch, registerSameAsPrevious } = await import(pathToFileURL(paths.catchRegistration).href)
const { createBackup, importBackup, validateBackup, fullBackupTableNames } = await import(pathToFileURL(paths.backup).href)
after(async () => { db.close(); for (const path of Object.values(paths)) await unlink(path); await rmdir(directory) })
beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    await db.trips.add({ id: 60, fishingAreaName: '合成池', fishingDate: '2026-10-10', fishingStyle: 'AREA_TROUT', startedAt: new Date('2026-10-10T00:00:00Z') })
    await db.lureManufacturers.add({ id: 10, name: 'Maker' })
    await db.lureSeries.add({ id: 20, manufacturerId: 10, name: 'Series' })
    await db.lureModels.add({ id: 30, seriesId: 20, name: 'Model', category: 'スプーン' })
    await db.lureVariants.add({ id: 40, modelId: 30, colorName: 'Color' })
    await db.myLures.add({ id: 50, variantId: 40, active: true })
    await db.catches.add({ id: 70, tripId: 60, caughtAt: new Date('2026-10-10T00:30:00Z'), lureName: '既存手入力' })
  })
})
const input = (extra = {}) => ({ tripId: 60, caughtAt: new Date('2026-10-10T01:00:00Z'), ...extra })
const manual = { kind: 'manual', lureName: '手入力', lureColor: '赤' }
const state = async () => JSON.stringify(await Promise.all(db.tables.map(async table => [table.name, await table.orderBy(table.schema.primKey.name).toArray()])))
const backup = async () => JSON.parse(JSON.stringify(await createBackup()))
const restore = value => importBackup({ text: async () => JSON.stringify(value) })
const custom = (display_name = '独自ブランド') => ({ ...initialFishSpecies[0], fish_id: 'ignored', display_name, group: 'ブランドマス', origin: 'user', source_status: 'ユーザー登録' })

test('Excel conversion keeps all four sheets and 44 original rows; exactly 37 chosen with 7 excluded', () => {
  assert.equal(fishMasterSource.sourceFile, 'fishing-log-fish-master-reviewed-2026-10-10.xlsx')
  assert.equal(fishMasterSource.sheets['初期マスター'].length, 44)
  assert.equal(fishMasterSource.sheets['ブランド放流確認'].length, 28)
  assert.equal(fishMasterSource.sheets['保留・対象外'].length, 18)
  assert.equal(fishMasterSource.sheets['判定方針'].length, 7)
  assert.equal(initialFishSpecies.length, 37)
  for (const [group, count] of [['ニジマス', 1], ['イロモノ', 15], ['ブランドマス', 21]]) assert.equal(initialFishSpecies.filter(row => row.group === group).length, count)
  assert.equal(new Set(initialFishSpecies.map(row => row.fish_id)).size, 37)
  assert.equal(new Set(initialFishSpecies.map(row => row.display_name)).size, 37)
  assert.deepEqual(fishMasterSource.sheets['初期マスター'].filter(row => !initialFishSpecies.some(chosen => chosen.fish_id === row.fish_id)).map(row => row.fish_id), ['F017', 'F018', 'F019', 'F021', 'F023', 'F024', 'F025'])
  assert.ok(initialFishSpecies.some(row => row.group === 'イロモノ' && row.source_status === '二次資料確認'))
})

test('reading candidates and default rainbow does not seed DB or assign fish to historical catches', async () => {
  const before = await state()
  const choices = await loadFishChoices()
  assert.equal(choices.length, 37)
  assert.equal(defaultFishSpeciesId(choices), rainbowFishId)
  assert.equal(await state(), before)
  assert.equal((await db.catches.get(70)).fishSpeciesId, undefined)
})

test('explicit seed is idempotent and preserves user edits, hidden status and user additions', async () => {
  assert.equal(await registerInitialFishSpecies(), 37)
  const row = await db.fishSpecies.get('F020')
  await saveFishSpecies({ ...row, display_name: '編集済みハコスチ', group: 'イロモノ' }, row.fish_id)
  await setFishSpeciesActive('F001', false)
  const userId = await saveFishSpecies(custom())
  const before = await state()
  assert.equal(await registerInitialFishSpecies(), 0)
  assert.equal(await state(), before)
  assert.equal((await db.fishSpecies.get(userId)).origin, 'user')
  assert.equal(defaultFishSpeciesId(await loadFishChoices()), undefined)
  assert.equal((await loadFishChoices()).filter(row => row.fish_id === 'F001').length, 0)
})

test('user name duplicate and reserved candidate name are rejected without writes', async () => {
  await saveFishSpecies(custom())
  const before = await state()
  await assert.rejects(saveFishSpecies(custom(' 独自ブランド ')))
  await assert.rejects(saveFishSpecies(custom('ニジマス')))
  assert.equal(await state(), before)
})

test('first catch commits initial 37 with fish snapshot and lure ownership atomically', async () => {
  const id = await registerCatch(input({ fishSpeciesId: rainbowFishId, fishSizeCm: 30.5 }), { kind: 'catalog', variantId: 40 })
  const row = await db.catches.get(id)
  assert.equal(await db.fishSpecies.count(), 37)
  assert.equal(await db.myLures.count(), 2)
  assert.deepEqual([row.fishSpeciesId, row.fishSpecies, row.fishSpeciesGroup, row.fishSizeCm], ['F001', 'ニジマス', 'ニジマス', 30.5])
  assert.equal((await db.catches.get(70)).fishSpeciesId, undefined)
})

test('failed catch rolls back initial master seeding and auto-ownership', async () => {
  const before = await state(), hook = () => { throw new Error('injected catch failure') }
  db.catches.hook('creating', hook)
  try { await assert.rejects(registerCatch(input({ fishSpeciesId: 'F020' }), { kind: 'catalog', variantId: 40 }), /injected/) }
  finally { db.catches.hook('creating').unsubscribe(hook) }
  assert.equal(await state(), before)
})

test('same-as-previous preserves fish snapshot including hidden edited master, never copies size', async () => {
  const id = await registerCatch(input({ fishSpeciesId: 'F020', fishSizeCm: 50 }), manual)
  const previous = await db.catches.get(id)
  const row = await db.fishSpecies.get('F020')
  await saveFishSpecies({ ...row, display_name: '別名', group: 'イロモノ', active: false }, row.fish_id)
  const next = await registerSameAsPrevious(60, new Date('2026-10-10T02:00:00Z'))
  const saved = await db.catches.get(next)
  assert.deepEqual([saved.fishSpeciesId, saved.fishSpecies, saved.fishSpeciesGroup], ['F020', 'ハコスチ', 'ブランドマス'])
  assert.equal(saved.fishSizeCm, undefined)
  assert.deepEqual(await db.catches.get(id), previous)
  await assert.rejects(registerCatch(input({ fishSpeciesId: 'F020' }), manual))
})

test('same-as-previous supports unknown fish and historical free-text fish without inventing IDs', async () => {
  let next = await registerSameAsPrevious(60, new Date('2026-10-10T02:00:00Z'))
  assert.equal((await db.catches.get(next)).fishSpeciesId, undefined)
  assert.equal((await db.catches.get(next)).fishSpecies, undefined)
  await db.catches.update(next, { fishSpecies: '古い自由記述', fishSizeCm: 22 })
  next = await registerSameAsPrevious(60, new Date('2026-10-10T03:00:00Z'))
  const saved = await db.catches.get(next)
  assert.equal(saved.fishSpecies, '古い自由記述')
  assert.equal(saved.fishSpeciesId, undefined)
  assert.equal(saved.fishSizeCm, undefined)
})

test('user species catch saves stable UUID and snapshots; later edits leave history unchanged', async () => {
  const fishId = await saveFishSpecies(custom())
  assert.match(fishId, /^user:/)
  const id = await registerCatch(input({ fishSpeciesId: fishId }), manual)
  const before = await db.catches.get(id)
  await saveFishSpecies({ ...(await db.fishSpecies.get(fishId)), display_name: '後の名称' }, fishId)
  assert.deepEqual(await db.catches.get(id), before)
  const other = await registerCatch(input({ fishSpeciesId: fishId }), manual)
  assert.equal((await db.catches.get(other)).fishSpecies, '後の名称')
})

for (const [name, extra] of [['zero', { fishSizeCm: 0 }], ['negative', { fishSizeCm: -1 }], ['NaN', { fishSizeCm: NaN }], ['infinity', { fishSizeCm: Infinity }], ['string size', { fishSizeCm: '30' }], ['bad reference', { fishSpeciesId: 'F999' }], ['excluded brand', { fishSpeciesId: 'F017' }]]) {
  test(`invalid catch ${name} rejects without partial writes`, async () => {
    const before = await state()
    await assert.rejects(registerCatch(input(extra), { kind: 'catalog', variantId: 40 }))
    assert.equal(await state(), before)
  })
}

test('v5 round-trip preserves all 13 tables, original metadata, edited/user fish and snapshot', async () => {
  await registerCatch(input({ fishSpeciesId: 'F020', fishSizeCm: 44.5 }), manual)
  const fishId = await saveFishSpecies(custom())
  await registerCatch(input({ caughtAt: new Date('2026-10-10T02:00:00Z'), fishSpeciesId: fishId }), manual)
  await saveFishSpecies({ ...(await db.fishSpecies.get('F020')), display_name: '編集名' }, 'F020')
  const before = await state(), value = await backup()
  assert.equal(value.version, 5)
  assert.deepEqual(Object.keys(value.data).sort(), [...fullBackupTableNames].sort())
  validateBackup(value)
  await restore(value)
  assert.equal(await state(), before)
})

for (const version of [1, 2, 3, 4]) test(`old v${version} restore has unknown historical catches; explicit reseed restores 37 without rewriting catches`, async () => {
  const value = await backup()
  value.version = version
  if (version === 1) delete value.data.tripEvents
  if (version === 4) for (const name of ['rods', 'reels', 'lines', 'tackleSets']) value.data[name] = []
  const original = await db.catches.toArray()
  await registerInitialFishSpecies()
  await saveFishSpecies(custom())
  await restore(value)
  assert.equal(await db.fishSpecies.count(), 0) // 明示した全データ置換の仕様。
  assert.equal((await loadFishChoices()).length, 37)
  assert.deepEqual(await db.catches.toArray(), original)
  await registerInitialFishSpecies()
  assert.equal(await db.fishSpecies.count(), 37)
  assert.deepEqual(await db.catches.toArray(), original)
})

for (const [name, mutate] of [
  ['missing array', b => { delete b.data.fishSpecies }],
  ['duplicate ID', b => { b.data.fishSpecies.push({ ...b.data.fishSpecies[0] }) }],
  ['duplicate name', b => { b.data.fishSpecies.push({ ...b.data.fishSpecies[0], fish_id: 'different' }) }],
  ['invalid group', b => { b.data.fishSpecies[0].group = '不正' }],
  ['invalid active', b => { b.data.fishSpecies[0].active = 'yes' }],
  ['invalid origin', b => { b.data.fishSpecies[0].origin = 'unknown' }],
  ['unsafe URL', b => { b.data.fishSpecies[0].source_url = 'javascript:alert(1)' }],
  ['missing fish', b => { b.data.catches[1].fishSpeciesId = 'missing' }],
  ['blank snapshot name', b => { b.data.catches[1].fishSpecies = '' }],
  ['bad snapshot group', b => { b.data.catches[1].fishSpeciesGroup = 'invalid' }],
  ['zero size', b => { b.data.catches[1].fishSizeCm = 0 }],
]) test(`new backup rejects ${name} before writes`, async () => {
  await registerCatch(input({ fishSpeciesId: 'F001' }), manual)
  const before = await state(), value = await backup()
  mutate(value)
  await assert.rejects(restore(value))
  assert.equal(await state(), before)
})

test('failure writing fish table at end of restore rolls back all 13 tables', async () => {
  await registerCatch(input({ fishSpeciesId: 'F001' }), manual)
  const value = await backup()
  await db.trips.update(60, { memo: '復元前' })
  const before = await state(), hook = () => { throw new Error('injected fish restore failure') }
  db.fishSpecies.hook('creating', hook)
  try { await assert.rejects(restore(value), /injected/) }
  finally { db.fishSpecies.hook('creating').unsubscribe(hook) }
  assert.equal(await state(), before)
})

test('v5 to v6 migration preserves all 12 tables and does not invent fish assignments or seed', async () => {
  await db.delete()
  const { db: legacy } = await import(pathToFileURL(paths.legacy).href)
  await legacy.open()
  assert.equal(legacy.verno, 5)
  for (const table of legacy.tables) {
    if (table.name === 'trips') await table.add({ id: 80, fishingAreaName: '旧', fishingDate: '2026-10-10', startedAt: new Date('2026-10-10T00:00:00Z') })
    else if (table.name === 'catches') await table.add({ id: 90, tripId: 80, caughtAt: new Date(), lureId: 100, tackleSetId: 110 })
    else await table.add({ id: 100, name: table.name, original: '維持' })
  }
  const before = await Promise.all(legacy.tables.map(async table => [table.name, await table.toArray()]))
  legacy.close()
  await db.open()
  assert.equal(db.verno, 6)
  for (const [name, rows] of before) assert.deepEqual(await db.table(name).toArray(), rows)
  assert.equal(await db.fishSpecies.count(), 0)
  assert.equal((await db.catches.get(90)).fishSpeciesId, undefined)
})
