import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-catch-test-'))
const paths = Object.fromEntries(['database', 'catchRegistration', 'backup', 'modal', 'render', 'myLures'].map(name => [name, join(directory, `${name}.mjs`)]))
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
for (const [name, source] of [['database', 'db/database.ts'], ['catchRegistration', 'utils/catchRegistration.ts'], ['backup', 'utils/backup.ts']]) {
  const code = compile(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8'))
    .replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
    .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href))
  await writeFile(paths[name], code)
}
const { db, ownershipStatus } = await import(pathToFileURL(paths.database).href)
const { registerCatch, registerSameAsPrevious, loadLureChoices } = await import(pathToFileURL(paths.catchRegistration).href)
const { createBackup, importBackup, validateBackup } = await import(pathToFileURL(paths.backup).href)
const { descriptor } = parse(await readFile(new URL('../src/components/CatchModal.vue', import.meta.url), 'utf8'))
const script = compileScript(descriptor, { id: 'catch-test' })
await writeFile(paths.modal, compile(script.content).replaceAll(/from ['"]vue['"]/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`))
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
const snapshot = async () => JSON.stringify(await Promise.all(db.tables.map(async table => [table.name, await table.orderBy('id').toArray()])))

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

test('inactive owned is retained and a new active copy is created as specified', async () => {
  await db.myLures.add({ id: 70, variantId: 40, active: false, ownershipStatus: 'owned' })
  const saved = await db.catches.get(await registerCatch(input(), catalog))
  assert.notEqual(saved.lureId, 70)
  assert.equal((await db.myLures.get(70)).active, false)
})

test('catch write failure rolls back auto-registration and leaves recent choices unchanged', async () => {
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
  const first = await db.catches.get(await registerCatch(input(), catalog))
  const at = new Date('2026-10-10T02:00:00Z')
  const saved = await db.catches.get(await registerSameAsPrevious(60, at))
  assert.equal(saved.lureId, first.lureId)
  assert.equal(saved.rangeLevel, '表層')
  assert.equal(saved.caughtAt.getTime(), at.getTime())
  assert.equal(await db.myLures.count(), 4)
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
  await registerCatch(input(), catalog)
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
    onEmit?.(event, value)
  } })
  return { props, state, events }
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
  const vnode = render({}, [], props, Vue.proxyRefs(state), {}, {})
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
