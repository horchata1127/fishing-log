import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-catch-test-'))
const paths = Object.fromEntries(['tripLocations', 'facilityMaster', 'facilityStorage', 'database', 'catchRegistration', 'tackleManagement', 'fishSpecies', 'fishMaster', 'fishPicker', 'backup', 'modal', 'render', 'myLures'].map(name => [name, join(directory, `${name}.mjs`)]))
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
for (const [name, source] of [['tripLocations', 'utils/tripLocations.ts'], ['facilityMaster', 'utils/facilityMaster.ts'], ['facilityStorage', 'utils/facilityStorage.ts'], ['database', 'db/database.ts'], ['fishSpecies', 'utils/fishSpecies.ts'], ['fishMaster', 'data/fishMaster.ts'], ['catchRegistration', 'utils/catchRegistration.ts'], ['tackleManagement', 'utils/tackleManagement.ts'], ['backup', 'utils/backup.ts']]) {
  const code = compile(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8'))
    .replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
    .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href))
    .replace("'./facilityMaster'", JSON.stringify(pathToFileURL(paths.facilityMaster).href))
    .replace("'./tripLocations'", JSON.stringify(pathToFileURL(paths.tripLocations).href))
    .replace("'./facilityStorage'", JSON.stringify(pathToFileURL(paths.facilityStorage).href))
    .replace("'./tackleManagement'", JSON.stringify(pathToFileURL(paths.tackleManagement).href))
    .replace("'./fishSpecies'", JSON.stringify(pathToFileURL(paths.fishSpecies).href))
    .replace("'../data/fishMaster'", JSON.stringify(pathToFileURL(paths.fishMaster).href))
  await writeFile(paths[name], code)
}
const { db, ownershipStatus, countResults, catchActions, actionLengthLabels, actionLengthLabel } = await import(pathToFileURL(paths.database).href)
const { deleteCatch, updateCatch, registerCatch, registerSameAsPrevious, loadLureChoices } = await import(pathToFileURL(paths.catchRegistration).href)
const { createBackup, importBackup, validateBackup } = await import(pathToFileURL(paths.backup).href)
const { descriptor } = parse(await readFile(new URL('../src/components/CatchModal.vue', import.meta.url), 'utf8'))
const script = compileScript(descriptor, { id: 'catch-test' })
const { descriptor: pickerDescriptor } = parse(await readFile(new URL('../src/components/FishSpeciesPicker.vue', import.meta.url), 'utf8'))
await writeFile(paths.fishPicker, compile(compileScript(pickerDescriptor, { id: 'fish-picker-test' }).content)
  .replaceAll(/from ['"]vue['"]/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`)
  .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href)))
await writeFile(paths.modal, compile(script.content).replaceAll(/from ['"]vue['"]/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`)
  .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href))
  .replace("'./FishSpeciesPicker.vue'", JSON.stringify(pathToFileURL(paths.fishPicker).href)))
const template = compileTemplate({ source: descriptor.template.content, filename: 'CatchModal.vue', id: 'catch-test',
  compilerOptions: { bindingMetadata: script.bindings, expressionPlugins: ['typescript'] } })
assert.deepEqual(template.errors, [])
await writeFile(paths.render, compile(template.code).replaceAll(/from ['"]vue['"]/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`))
const { default: modal } = await import(pathToFileURL(paths.modal).href)
const { render } = await import(pathToFileURL(paths.render).href)
const { descriptor: ownedDescriptor } = parse(await readFile(new URL('../src/components/MyLuresScreen.vue', import.meta.url), 'utf8'))
await writeFile(paths.myLures, compile(compileScript(ownedDescriptor, { id: 'owned-test' }).content)
  .replaceAll(/from ['"]vue['"]/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`)
  .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href)))
const { default: myLuresScreen } = await import(pathToFileURL(paths.myLures).href)

after(async () => {
  db.close()
  for (const file of Object.values(paths)) await unlink(file)
  await rmdir(directory)
})

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    await db.lureManufacturers.add({ id: 10, name: 'Maker' })
    await db.lureSeries.add({ id: 20, manufacturerId: 10, name: 'Series' })
    await db.lureModels.add({ id: 30, seriesId: 20, name: 'Model', category: 'スプーン' })
    await db.lureVariants.bulkAdd([{ id: 40, modelId: 30, colorName: 'Color' }, { id: 41, modelId: 30, colorName: 'Other' }])
    await db.myLures.bulkAdd([{ id: 50, variantId: 40, active: true },
      { id: 51, variantId: 40, active: true, ownershipStatus: 'unverified' },
      { id: 52, variantId: 40, active: true, ownershipStatus: 'placeholder' }])
    await db.trips.add({ id: 60, fishingAreaName: 'Lake', fishingDate: '2026-10-10', fishingStyle: 'AREA_TROUT',
      startedAt: new Date('2026-10-10T00:00:00Z') })
  })
})

const input = (time = '2026-10-10T01:00:00Z') => ({ tripId: 60, caughtAt: new Date(time), rangeLevel: '表層' })
const catalog = { kind: 'catalog', variantId: 40 }
const snapshot = async () => JSON.stringify(await Promise.all(db.tables.map(async table => [table.name, await table.orderBy(table.schema.primKey.name).toArray()])))

test('RC24 action options retain all old labels, add eight unique types, and display missing length only as normal', () => {
  const old = ['ただ巻き', 'ストップ＆ゴー', 'トゥイッチ', 'ジャーク', 'シェイク', 'シミーフォール', 'シミーアップ', 'リフト＆フォール', 'ステイ', 'その他']
  const added = ['マジックジャーク', 'デジ巻き', 'ボトムノック', 'ボトムバンプ', 'ボトムトレース', 'ドリフト', 'ダート', 'ボトムステイ']
  assert.equal(catchActions.length, 18)
  assert.equal(new Set(catchActions).size, 18)
  for (const label of [...old, ...added]) assert.ok(catchActions.includes(label))
  assert.deepEqual(actionLengthLabels, { short: '短い', normal: '普通', long: '長い' })
  assert.equal(actionLengthLabel(), '普通')
})

for (const resultType of ['catch', 'lost']) for (const actionLength of ['short', 'normal', 'long']) {
  test(`RC24 ${resultType} stores and edits ${actionLength}, reuses owned lure and retains unrelated stores`, async () => {
    const before = JSON.parse(await snapshot())
    const result = { resultType, ...(resultType === 'lost' ? { lostDistance: 'near' } : {}) }
    const id = await registerCatch({ ...input(), ...result, action: 'マジックジャーク', actionLength }, catalog)
    const saved = await db.catches.get(id)
    assert.equal(saved.actionLength, actionLength); assert.equal(saved.action, 'マジックジャーク')
    const next = actionLength === 'long' ? 'short' : 'long'
    await updateCatch(id, { ...input(), ...result, actionLength: next })
    assert.equal((await db.catches.get(id)).actionLength, next)
    assert.equal((await db.catches.get(id)).action, 'マジックジャーク')
    await updateCatch(id, { ...input(), ...result, memo: '長さ以外の編集' })
    assert.equal((await db.catches.get(id)).actionLength, next)
    assert.equal(await db.myLures.count(), 4)
    const after = new Map(JSON.parse(await snapshot()))
    for (const [table, rows] of before) {
      if (table === 'catches') continue
      if (table === 'myLures') for (const row of rows) assert.deepEqual(after.get(table).find(r => r.id === row.id), row)
      else assert.deepEqual(after.get(table), rows)
    }
  })
}

test('RC24 legacy action and absent length survive viewing, cancel and unrelated edit; explicit normal remains distinct', async () => {
  const id = await db.catches.add({ ...input(), action: '旧記録の独自アクション' })
  const before = await snapshot()
  const ui = setupModal(await loadLureChoices())
  ui.props.action = '旧記録の独自アクション'
  assert.equal(ui.state.actionOptions.value.filter(v => v === ui.props.action).length, 1)
  const cancel = findCancel(await renderModal(ui.props, ui.state))
  cancel.props.onClick()
  assert.equal(ui.props.actionLength, undefined)
  assert.equal(await snapshot(), before)
  await updateCatch(id, { ...input(), action: ui.props.action, memo: '関連しない編集' })
  const legacy = await db.catches.get(id)
  assert.equal(legacy.action, ui.props.action)
  assert.equal(Object.hasOwn(legacy, 'actionLength'), false)
  await updateCatch(id, { ...input(), actionLength: 'normal' })
  assert.equal((await db.catches.get(id)).actionLength, 'normal')
})

for (const length of [undefined, 'short', 'normal', 'long']) test(`RC24 previous shortcut inherits ${length ?? 'missing'} length without changing source or later normal input`, async () => {
  const id = await registerCatch({ ...input(), action: '旧自由入力', ...(length ? { actionLength: length } : {}) }, { kind: 'manual', lureName: '手入力', lureColor: '' })
  const source = await db.catches.get(id)
  const copied = await db.catches.get(await registerSameAsPrevious(60, new Date('2026-10-10T02:00:00Z'), undefined, { resultType: 'lost', lostDistance: 'offshore' }))
  assert.equal(copied.action, source.action)
  assert.equal(copied.actionLength, length)
  assert.equal(Object.hasOwn(copied, 'actionLength'), length !== undefined)
  assert.deepEqual(await db.catches.get(id), source)
  const fresh = await db.catches.get(await registerCatch({ ...input('2026-10-10T03:00:00Z'), actionLength: 'normal' }, { kind: 'manual', lureName: '', lureColor: '' }))
  assert.equal(fresh.actionLength, 'normal'); assert.equal(copied.actionLength, length)
  assert.equal(await db.myLures.count(), 3)
})

for (const bad of ['medium', 'SHORT', null, 0, true, {}, [], '__proto__']) test(`RC24 rejects length ${JSON.stringify(bad)} in register/edit/v6 restore atomically`, async () => {
  const { applyFacilityMaster } = await import(pathToFileURL(paths.facilityStorage).href)
  await applyFacilityMaster(JSON.parse(await readFile(new URL('../src/data/facility-master.v1.json', import.meta.url), 'utf8')))
  const id = await registerCatch({ ...input(), actionLength: 'normal' }, { kind: 'manual', lureName: '', lureColor: '' })
  const backup = await createBackup(), before = await snapshot()
  assert.equal(backup.version, 6)
  await assert.rejects(registerCatch({ ...input(), actionLength: bad }, catalog), /アクションの長さ/)
  assert.equal(await snapshot(), before)
  await assert.rejects(updateCatch(id, { ...input(), actionLength: bad }, catalog), /アクションの長さ/)
  assert.equal(await snapshot(), before)
  backup.data.catches[0].actionLength = bad
  await assert.rejects(importBackup(new File([JSON.stringify(backup)], 'invalid-rc24-v6.json')), /アクションの長さ/)
  assert.equal(await snapshot(), before)
})

test('RC24 v6 round trip retains all 16 stores, official/user places, tackle/fish snapshots and mixed missing/explicit lengths', async () => {
  const { applyFacilityMaster } = await import(pathToFileURL(paths.facilityStorage).href)
  await applyFacilityMaster(JSON.parse(await readFile(new URL('../src/data/facility-master.v1.json', import.meta.url), 'utf8')))
  const facilityId = 'official:nihon-iwana-center', zoneId = `${facilityId}:pond-9`
  await db.facilities.put({ id: 'user:iwana', name: '日本イワナセンター', origin: 'user' })
  await db.zones.put({ id: 'user:9', facilityId: 'user:iwana', name: '9号池', origin: 'user' })
  await db.rods.put({ id: 1, manufacturer: '架空', modelName: 'ロッド', active: true })
  await db.lines.put({ id: 1, material: 'ナイロン', strengthLb: 3, active: true })
  await db.reels.put({ id: 1, manufacturer: '架空', modelName: 'リール', mainLineId: 1, active: true })
  await db.tackleSets.put({ id: 1, name: 'セット', rodId: 1, reelId: 1, active: true })
  await db.tripEvents.put({ id: 1, tripId: 60, type: 'stocking', occurredAt: input().caughtAt })
  await db.trips.update(60, { facilityId, currentZoneId: zoneId, tackleSetIds: [1] })
  const legacyId = await db.catches.add({ ...input(), action: '旧自由入力', facilityId, zoneId,
    locationSnapshot: { facilityName: '保存時施設名', zoneName: '保存時エリア名' } })
  for (const [i, actionLength] of ['short', 'normal', 'long'].entries()) {
    for (const resultType of ['catch', 'lost']) await registerCatch({ ...input(`2026-10-10T0${i + 2}:00:00Z`), action: 'ボトムステイ', actionLength,
      resultType, ...(resultType === 'lost' ? { lostDistance: 'landing' } : {}), tackleSetId: 1, fishSpeciesId: 'F001',
      location: { expectedFacilityId: facilityId, expectedCurrentZoneId: zoneId, zoneId } }, catalog)
  }
  const backup = await createBackup(), before = await snapshot()
  assert.equal(backup.version, 6); assert.equal(Object.keys(backup.data).length, 16)
  assert.equal(Object.hasOwn(backup.data.catches.find(r => r.id === legacyId), 'actionLength'), false)
  await importBackup(new File([JSON.stringify(backup)], 'synthetic-rc24-v6.json'))
  assert.equal(await snapshot(), before)
  assert.equal(Object.hasOwn(await db.catches.get(legacyId), 'actionLength'), false)
  assert.equal(db.verno, 7)
})

test('RC24 late edit failure rolls back new length and owned lure without modifying legacy action or other tables', async () => {
  const id = await db.catches.add({ ...input(), action: '旧自由入力' }), before = await snapshot()
  const fail = () => { throw new Error('RC24 injected late failure') }
  db.catches.hook('updating', fail)
  try { await assert.rejects(updateCatch(id, { ...input(), actionLength: 'long' }, catalog), /injected late failure/) }
  finally { db.catches.hook('updating').unsubscribe(fail) }
  assert.equal(await snapshot(), before)
})

test('RC23 legacy records and three lost distances stay separate with reused ownership and backup round-trip', async () => {
  await db.myLures.update(50, { ownershipStatus: 'owned' })
  const owned = await db.myLures.toArray()
  const old = { ...input(), id: 11, lureName: 'Legacy' }
  await db.catches.add(old)
  assert.equal(countResults(await db.catches.toArray()).catches, 1)
  for (const lostDistance of ['offshore', 'near', 'landing']) {
    await registerCatch({ ...input(), resultType: 'lost', lostDistance }, catalog)
  }
  const counts = countResults(await db.catches.toArray())
  assert.deepEqual(counts, { catches: 1, lost: 3, distances: { offshore: 1, near: 1, landing: 1 } })
  assert.deepEqual(await db.myLures.toArray(), owned)
  assert.deepEqual(await db.catches.get(11), old)
  const before = await snapshot()
  await importBackup(new File([JSON.stringify(await createBackup())], 'rc23.json'))
  assert.equal(await snapshot(), before)
  assert.equal(db.verno, 7)
})

test('RC23 invalid result/distance and invalid restored record reject without any writes', async () => {
  const before = await snapshot()
  for (const bad of [{ resultType: 'unknown' }, { resultType: 'lost' }, { resultType: 'lost', lostDistance: 'other' }, { resultType: 'catch', lostDistance: 'near' }]) {
    await assert.rejects(registerCatch({ ...input(), ...bad }, catalog))
    assert.equal(await snapshot(), before)
  }
  await registerCatch({ ...input(), resultType: 'lost', lostDistance: 'near' }, catalog)
  const backup = JSON.parse(JSON.stringify(await createBackup()))
  backup.data.catches[0].lostDistance = 'invalid'
  const saved = await snapshot()
  await assert.rejects(importBackup(new File([JSON.stringify(backup)], 'bad-rc23.json')))
  assert.equal(await snapshot(), saved)
})

test('RC23 explicit owned lure, result switches, previous variant and deletion preserve unrelated rows', async () => {
  await db.myLures.update(50, { ownershipStatus: 'owned' })
  const owned = await db.myLures.toArray()
  const id = await registerCatch({ ...input(), resultType: 'lost', lostDistance: 'offshore' }, { kind: 'owned', myLureId: 50 })
  assert.equal((await db.catches.get(id)).lureId, 50)
  await updateCatch(id, { ...input(), resultType: 'catch' })
  assert.equal((await db.catches.get(id)).lostDistance, undefined)
  assert.equal(countResults(await db.catches.toArray()).catches, 1)
  await updateCatch(id, { ...input(), resultType: 'lost', lostDistance: 'landing' })
  assert.equal(countResults(await db.catches.toArray()).lost, 1)
  await registerCatch({ ...input('2026-10-10T03:00:00Z'), resultType: 'lost', lostDistance: 'near' }, { kind: 'catalog', variantId: 41 })
  const previousId = await registerSameAsPrevious(60, new Date('2026-10-10T04:00:00Z'), undefined, { resultType: 'lost', lostDistance: 'landing' })
  assert.equal((await db.catches.get(previousId)).lureVariantId, 41)
  await assert.rejects(deleteCatch(id, 999))
  await deleteCatch(id, 60)
  assert.equal(await db.catches.get(id), undefined)
  assert.deepEqual((await db.myLures.toArray()).filter(row => row.id <= 52), owned)
  assert.equal(await db.myLures.count(), owned.length + 1)
})

test('RC23 failed lost creation/update/delete roll back without modifying history or ownership', async () => {
  const failure = () => { throw new Error('RC23 injected failure') }
  for (const hook of ['creating', 'updating', 'deleting']) {
    const id = await registerCatch({ ...input(), resultType: 'lost', lostDistance: 'near' }, catalog)
    const before = await snapshot()
    db.catches.hook(hook, failure)
    try {
      await assert.rejects(hook === 'creating' ? registerCatch({ ...input(), resultType: 'lost', lostDistance: 'near' }, catalog)
        : hook === 'updating' ? updateCatch(id, { ...input(), resultType: 'catch' }) : deleteCatch(id, 60), /RC23 injected/)
    } finally { db.catches.hook(hook).unsubscribe(failure) }
    assert.equal(await snapshot(), before)
  }
})

test('RC23 concurrent catch and lost catalog saves create one owned individual and keep separate counts', async () => {
  const legacy = await db.myLures.toArray()
  const ids = await Promise.all([
    registerCatch({ ...input(), resultType: 'catch' }, catalog),
    registerCatch({ ...input(), resultType: 'lost', lostDistance: 'offshore' }, catalog),
    registerCatch({ ...input(), resultType: 'lost', lostDistance: 'landing' }, catalog),
  ])
  const rows = await Promise.all(ids.map(id => db.catches.get(id)))
  assert.equal(new Set(rows.map(r => r.lureId)).size, 1)
  assert.ok(rows[0].lureId > 52)
  assert.equal(await db.myLures.count(), legacy.length + 1)
  assert.deepEqual((await db.myLures.toArray()).filter(row => row.id <= 52), legacy)
  const counts = countResults(rows)
  assert.equal(counts.catches, 1)
  assert.equal(counts.lost, 2)
})

test('RC23 lost manual saves never create ownership; catalog editing/deletion retain owned rows', async () => {
  const legacy = await db.myLures.toArray()
  const id = await registerCatch({ ...input(), resultType: 'lost', lostDistance: 'near' }, { kind: 'manual', lureName: 'Model', lureColor: 'Color' })
  assert.deepEqual(await db.myLures.toArray(), legacy)
  await updateCatch(id, { ...input(), resultType: 'lost', lostDistance: 'near' }, catalog)
  const owned = await db.myLures.toArray()
  assert.equal(owned.length, legacy.length + 1)
  await updateCatch(id, { ...input(), resultType: 'catch' }, { kind: 'manual', lureName: 'Manual', lureColor: '' })
  await deleteCatch(id, 60)
  assert.deepEqual(await db.myLures.toArray(), owned)
})

test('RC23 late lost edit failure rolls back the newly created owned individual', async () => {
  const id = await registerCatch({ ...input(), resultType: 'lost', lostDistance: 'near' }, { kind: 'manual', lureName: '', lureColor: '' })
  const before = await snapshot()
  const fail = () => { throw new Error('late edit failure') }
  db.catches.hook('updating', fail)
  try { await assert.rejects(updateCatch(id, { ...input(), resultType: 'lost', lostDistance: 'near' }, catalog), /late edit failure/) }
  finally { db.catches.hook('updating').unsubscribe(fail) }
  assert.equal(await snapshot(), before)
})

test('legacy ownership defaults to unverified without rewriting IDs or records', async () => {
  const before = await snapshot()
  assert.equal(ownershipStatus(await db.myLures.get(50)), 'unverified')
  const choices = await loadLureChoices()
  assert.equal(choices.catalog.length, 2)
  assert.equal(choices.owned.length, 0)
  assert.equal(await snapshot(), before)
})

test('first catalog catch atomically adds one owned individual, separate from legacy placeholders', async () => {
  const legacy = await db.myLures.toArray()
  const id = await registerCatch(input(), catalog)
  const saved = await db.catches.get(id)
  assert.ok(saved.lureId > 52)
  assert.equal(saved.lureVariantId, 40)
  assert.equal(saved.lureName, 'Model')
  assert.equal(saved.lureColor, 'Color')
  assert.equal((await db.myLures.get(saved.lureId)).ownershipStatus, 'owned')
  assert.equal(await db.myLures.count(), 4)
  assert.deepEqual((await db.myLures.toArray()).filter(row => row.id <= 52), legacy)
})

test('second catalog catch reuses the ID without creating a second owned individual', async () => {
  const first = await db.catches.get(await registerCatch(input(), catalog))
  const second = await db.catches.get(await registerCatch(input('2026-10-10T02:00:00Z'), catalog))
  assert.equal(first.lureId, second.lureId)
  assert.equal(await db.myLures.count(), 4)
})

test('concurrent legitimate catches add two catches but only one owned individual', async () => {
  const ids = await Promise.all([registerCatch(input(), catalog), registerCatch(input('2026-10-10T02:00:00Z'), catalog)])
  assert.notEqual(ids[0], ids[1])
  const rows = await db.catches.toArray()
  assert.equal(rows[0].lureId, rows[1].lureId)
  assert.equal(await db.myLures.count(), 4)
})

test('explicit owned individual and most recent individual are reused among multiple copies', async () => {
  await db.myLures.bulkAdd([{ id: 70, variantId: 40, active: true, ownershipStatus: 'owned' },
    { id: 71, variantId: 40, active: true, ownershipStatus: 'owned' }])
  const first = await db.catches.get(await registerCatch(input(), { kind: 'owned', myLureId: 71 }))
  const second = await db.catches.get(await registerCatch(input('2026-10-10T02:00:00Z'), catalog))
  assert.equal(first.lureId, 71)
  assert.equal(second.lureId, 71)
  assert.equal(await db.myLures.count(), 5)
})

test('inactive owned is retained without creating an active copy', async () => {
  await db.myLures.add({ id: 70, variantId: 40, active: false, ownershipStatus: 'owned' })
  const saved = await db.catches.get(await registerCatch(input(), catalog))
  assert.notEqual(saved.lureId, 70)
  assert.equal((await db.myLures.get(70)).active, false)
})

test('catch write failure rolls back registration and leaves recent choices unchanged', async () => {
  const before = await snapshot()
  const fail = () => { throw new Error('injected catch failure') }
  db.catches.hook('creating', fail)
  try {
    await assert.rejects(registerCatch(input(), catalog), /injected catch failure/)
  } finally {
    db.catches.hook('creating').unsubscribe(fail)
  }
  assert.equal(await snapshot(), before)
  assert.deepEqual((await loadLureChoices()).recent, [])
})

test('manual catch discards stale IDs and does not register catalog or ownership', async () => {
  const saved = await db.catches.get(await registerCatch({ ...input(), lureId: 50, lureVariantId: 40 },
    { kind: 'manual', lureName: ' Custom ', lureColor: ' Blue ' }))
  assert.equal(saved.lureId, undefined)
  assert.equal(saved.lureVariantId, undefined)
  assert.equal(saved.lureName, 'Custom')
  assert.equal(await db.myLures.count(), 3)
})

test('same as previous reuses valid owned ID with current caughtAt and conditions', async () => {
  await db.myLures.update(50, { ownershipStatus: 'owned' })
  const first = await db.catches.get(await registerCatch(input(), catalog))
  const at = new Date('2026-10-10T02:00:00Z')
  const saved = await db.catches.get(await registerSameAsPrevious(60, at))
  assert.equal(saved.lureId, first.lureId)
  assert.equal(saved.rangeLevel, '表層')
  assert.equal(saved.caughtAt.getTime(), at.getTime())
  assert.equal(await db.myLures.count(), 3)
})

for (const [label, lureId] of [['unset', 50], ['unverified', 51], ['placeholder', 52], ['missing', 999]]) {
  test(`same as previous and explicit selection reject ${label} individuals without writes`, async () => {
    await db.catches.add({ ...input(), lureId })
    const before = await snapshot()
    await assert.rejects(registerSameAsPrevious(60, new Date('2026-10-10T02:00:00Z')), /選び直し/)
    await assert.rejects(registerCatch(input(), { kind: 'owned', myLureId: lureId }))
    assert.equal(await snapshot(), before)
  })
}

test('same as previous supports manual catches without creating ownership', async () => {
  await registerCatch(input(), { kind: 'manual', lureName: 'Manual', lureColor: 'Red' })
  const saved = await db.catches.get(await registerSameAsPrevious(60, new Date('2026-10-10T02:00:00Z')))
  assert.equal(saved.lureId, undefined)
  assert.equal(saved.lureName, 'Manual')
  assert.equal(await db.myLures.count(), 3)
})

test('recent choices come only from saved catches and exclude unverified history', async () => {
  await db.catches.add({ ...input(), lureId: 50, lureName: 'Legacy' })
  await registerCatch(input('2026-10-10T02:00:00Z'), catalog)
  await registerCatch(input('2026-10-10T03:00:00Z'), catalog)
  await registerCatch(input('2026-10-10T04:00:00Z'), { kind: 'manual', lureName: 'Manual', lureColor: 'Blue' })
  const recent = (await loadLureChoices()).recent
  assert.equal(recent.length, 2)
  assert.equal(recent[0].selection.kind, 'manual')
  assert.equal(recent[1].selection.kind, 'owned')
  assert.equal(recent[1].lureName, 'Model')
})

test('missing catalog chain and ended trip reject without registration', async () => {
  const before = await snapshot()
  await assert.rejects(registerCatch(input(), { kind: 'catalog', variantId: 999 }))
  assert.equal(await snapshot(), before)
  await db.trips.update(60, { endedAt: new Date() })
  const ended = await snapshot()
  await assert.rejects(registerCatch(input(), catalog))
  assert.equal(await snapshot(), ended)
})

test('v3 backup round-trip preserves ownership states, IDs and variant reference', async () => {
  await registerCatch(input(), catalog)
  const backup = await createBackup()
  assert.equal(backup.version, 3)
  const before = await snapshot()
  await importBackup(new File([JSON.stringify(backup)], 'synthetic-backup.json'))
  assert.equal(await snapshot(), before)
  assert.equal((await db.myLures.get(50)).ownershipStatus, undefined)
})

test('legacy v1/v2 backups preserve unset as unverified instead of upgrading ownership', async () => {
  for (const version of [1, 2]) {
    const backup = JSON.parse(JSON.stringify(await createBackup()))
    backup.version = version
    if (version === 1) delete backup.data.tripEvents
    await importBackup(new File([JSON.stringify(backup)], 'synthetic-old.json'))
    assert.equal(ownershipStatus(await db.myLures.get(50)), 'unverified')
    assert.equal((await loadLureChoices()).owned.length, 0)
  }
})

test('invalid ownership or variant references in new backups are rejected without writes', async () => {
  await registerCatch(input(), catalog)
  const before = await snapshot()
  const backup = JSON.parse(JSON.stringify(await createBackup()))
  backup.data.myLures[0].ownershipStatus = 'invalid'
  assert.throws(() => validateBackup(backup), /ownershipStatus/)
  delete backup.data.myLures[0].ownershipStatus
  backup.data.catches[0].lureVariantId = 999
  await assert.rejects(importBackup(new File([JSON.stringify(backup)], 'bad.json')), /lureVariantId/)
  assert.equal(await snapshot(), before)
})

test('backup rejects mismatched owned and catalog references even when both IDs exist', async () => {
  await db.myLures.update(50, { ownershipStatus: 'owned' })
  await registerCatch(input(), { kind: 'owned', myLureId: 50 })
  const backup = JSON.parse(JSON.stringify(await createBackup()))
  backup.data.catches[0].lureVariantId = 41
  assert.throws(() => validateBackup(backup), /一致しません/)
})

test('new manual ownership registration marks owned and preserves duplicate-individual design', async t => {
  t.mock.method(console, 'warn', () => {}) // setup単体ではonMountedが登録されない。
  t.mock.method(console, 'log', () => {})
  const state = myLuresScreen.setup({}, { expose() {}, emit() {} })
  for (let i = 0; i < 2; i++) {
    state.manufacturerName.value = 'Maker'
    state.seriesName.value = 'Series'
    state.modelName.value = 'Model'
    state.colorName.value = 'Color'
    await state.addMyLure()
  }
  const rows = await db.myLures.toArray()
  const owned = rows.filter(row => row.ownershipStatus === 'owned')
  assert.equal(owned.length, 2)
  assert.notEqual(owned[0].id, owned[1].id)
  assert.equal(rows.find(row => row.id === 50).ownershipStatus, undefined)
})

function setupModal(choices, onEmit) {
  const props = Vue.reactive({ caughtAt: input().caughtAt, hasPreviousCatch: false,
    myLures: choices.owned, catalog: choices.catalog, recentLures: choices.recent,
    selection: null, saving: false, lureName: '', lureColor: '', range: '', retrieveSpeed: '', action: '' })
  const events = []
  const state = modal.setup(props, { expose() {}, emit(event, value) {
    events.push([event, value])
    if (event === 'selectLure') props.selection = value
    if (event === 'update:lureName') props.lureName = value
    if (event === 'update:lureColor') props.lureColor = value
    if (event === 'update:tackleSetId') props.tackleSetId = value
    onEmit?.(event, value)
  } })
  return { props, state, events }
}

// Render inside an actual Vue instance so named slots have their runtime context.
async function renderModal(props, state) {
  let vnode
  await renderToString(Vue.createSSRApp({ render() {
    vnode = render(this, [], props, Vue.proxyRefs(state), {}, {})
    return vnode
  } }))
  return vnode
}

function findCancel(vnode) {
  if (!vnode || typeof vnode !== 'object') return undefined
  if (vnode.type === 'button' && vnode.props?.class === 'cancel-button') return vnode
  if (Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const match = findCancel(child)
      if (match) return match
    }
  }
}

test('UI catalog selection then cancel performs no writes and no auto-registration', async () => {
  const before = await snapshot()
  const { props, state, events } = setupModal(await loadLureChoices())
  state.openLurePicker()
  state.selectMyLure(props.catalog[0])
  assert.equal(props.selection.kind, 'catalog')
  const vnode = await renderModal(props, state)
  const cancel = findCancel(vnode)
  assert.ok(cancel)
  cancel.props.onClick()
  assert.equal(events.at(-1)[0], 'cancel')
  assert.equal(await snapshot(), before)
})

test('UI switches catalog selection to manual with no lingering owned or variant ID', async () => {
  const { props, state } = setupModal(await loadLureChoices())
  state.openLurePicker()
  state.selectMyLure(props.catalog[0])
  state.openManualInput()
  assert.equal(props.selection.kind, 'manual')
  assert.equal(props.selection.variantId, undefined)
  assert.equal(props.selection.myLureId, undefined)
})

function findTackleSelect(vnode) {
  if (!vnode || typeof vnode !== 'object') return undefined
  if (vnode.type === 'select' && vnode.props?.['aria-label'] === '使用タックル') return vnode
  if (Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      const match = findTackleSelect(child)
      if (match) return match
    }
  }
}

test('UI tackle selection and cancel emits state only, without ownership or catch writes', async () => {
  const before = await snapshot()
  const { props, state, events } = setupModal(await loadLureChoices())
  props.tackleSets = [{ id: 90, name: '持参セット', rodId: 1, reelId: 2, active: true }]
  let vnode = await renderModal(props, state)
  findTackleSelect(vnode).props.onChange({ target: { value: '90' } })
  assert.equal(props.tackleSetId, 90)
  vnode = await renderModal(props, state)
  assert.equal(findTackleSelect(vnode).props.value, 90)
  findCancel(vnode).props.onClick()
  assert.equal(events.at(-1)[0], 'cancel')
  assert.equal(await snapshot(), before)
})

test('UI supports explicitly clearing a preceding tackle suggestion', async () => {
  const { props, state, events } = setupModal(await loadLureChoices())
  props.tackleSets = [{ id: 90, name: '持参セット', rodId: 1, reelId: 2, active: true }]
  props.tackleSetId = 90
  const vnode = await renderModal(props, state)
  findTackleSelect(vnode).props.onChange({ target: { value: '' } })
  assert.equal(props.tackleSetId, undefined)
  assert.deepEqual(events.at(-1), ['update:tackleSetId', undefined])
})

test('editing an ended trip preserves IDs and count and clears stale references durably', async () => {
  const id = await registerCatch({ ...input(), fishSpeciesId: 'RC19-F001', fishSizeCm: 12, memo: 'old' }, catalog)
  await db.trips.update(60, { endedAt: new Date() })
  const count = await db.catches.count()
  const at = new Date('2026-10-11T01:00:00Z')
  await updateCatch(id, { ...input(), caughtAt: at, fishSpeciesId: undefined, fishSizeCm: undefined, memo: undefined }, { kind: 'manual', lureName: 'HUNT GRANDE 1.3g', lureColor: 'Silver' })
  db.close()
  await db.open()
  const row = await db.catches.get(id)
  assert.equal(await db.catches.count(), count)
  assert.equal(row.id, id)
  assert.equal(row.tripId, 60)
  assert.equal(row.caughtAt.getTime(), at.getTime())
  for (const field of ['lureId', 'lureVariantId', 'fishSpeciesId', 'fishSpecies', 'fishSpeciesGroup', 'fishSizeCm', 'memo']) assert.equal(row[field], undefined, field)
})

test('editing validates parent/date/size and rolls back ownership on update failure', async () => {
  const id = await registerCatch(input(), { kind: 'manual', lureName: 'old', lureColor: '' })
  const before = await snapshot()
  await assert.rejects(updateCatch(id, { ...input(), tripId: 999 }, catalog))
  await assert.rejects(updateCatch(id, { ...input(), caughtAt: new Date(NaN) }, catalog))
  await assert.rejects(updateCatch(id, { ...input(), fishSizeCm: 0 }, catalog))
  const fail = () => { throw new Error('injected update failure') }
  db.catches.hook('updating', fail)
  try { await assert.rejects(updateCatch(id, input(), catalog), /injected/) }
  finally { db.catches.hook('updating').unsubscribe(fail) }
  assert.equal(await snapshot(), before)
})

test('editing preserves unchanged history and refreshes a changed fish selection', async () => {
  const id = await registerCatch({ ...input(), fishSpeciesId: 'RC19-F001' }, catalog)
  const original = await db.catches.get(id)
  await db.fishSpecies.update('RC19-F001', { active: false, display_name: 'renamed' })
  await updateCatch(id, { ...input(), fishSpeciesId: 'RC19-F001' })
  assert.deepEqual(await db.catches.get(id), original)
  await updateCatch(id, { ...input(), fishSpeciesId: 'RC19-F008' }, { kind: 'catalog', variantId: 41 })
  const row = await db.catches.get(id)
  assert.equal(row.fishSpeciesGroup, '\u30d0\u30b9')
  assert.equal(row.lureVariantId, 41)
  assert.equal(row.lureColor, 'Other')
  const backup = await createBackup()
  await importBackup(new File([JSON.stringify(backup)], 'rc19.json'))
  assert.deepEqual(await db.catches.get(id), row)
})
