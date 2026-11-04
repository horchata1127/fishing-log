import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import Dexie from 'dexie'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-rc34-apply-')), modules = new Map()
async function compile(file) {
  file = resolve(file)
  if (modules.has(file)) return modules.get(file)
  const url = pathToFileURL(join(directory, `${modules.size}.mjs`)).href
  modules.set(file, url)
  let code = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  for (const specifier of [...code.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1])) {
    const target = specifier.startsWith('.') ? await compile(resolve(dirname(file), `${specifier}.ts`)) : import.meta.resolve(specifier)
    code = code.replaceAll(`'${specifier}'`, JSON.stringify(target)).replaceAll(`"${specifier}"`, JSON.stringify(target))
  }
  await writeFile(new URL(url), code); return url
}
const schema = await import(await compile('src/db/database.ts'))
const engine = await import(await compile('src/utils/lureMasterApply.ts'))
const historyApi = await import(await compile('src/utils/lureMasterHistory.ts'))
const { lureMasterManifest: manifest } = await import(await compile('src/data/lureMasterManifest.ts'))
const legacy33 = await import(await compile('src/utils/rc33Catalog.ts'))
const backup = await import(await compile('src/utils/backup.ts'))
const { createVisualSnapshot } = await import(await compile('src/utils/visualColorStorage.ts'))
const { db } = schema, clone = v => structuredClone(v)
const state = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
const dataState = async () => { const s = await state(); delete s.lureMasterImportHistory; return s }
const updater = () => engine.createLureMasterUpdater()
const added = result => Object.fromEntries(Object.entries(result.counts).map(([name, c]) => [name, c.added]))
const zero = () => Object.fromEntries(schema.lureMasterHistoryCountTables.map(name => [name, 0]))
function preserves(before, after) {
  for (const [name, rows] of Object.entries(before)) for (const row of rows) {
    const key = name === 'fishSpecies' ? 'fish_id' : name === 'appMetadata' ? 'key' : 'id'
    assert.deepEqual(after[name].find(r => r[key] === row[key]), row, `${name}/${row[key]}`)
  }
}
async function seed() {
  let nextId = 101
  for (const t of manifest.targets) {
    let maker = (await db.lureManufacturers.toArray()).find(m => m.name === t.manufacturer)
    if (!maker) { maker = { id: nextId++, name: t.manufacturer }; await db.lureManufacturers.add(maker) }
    if (t.manufacturer !== '1089工房') continue
    let parent = (await db.lureSeries.toArray()).find(p => p.manufacturerId === maker.id && p.name === t.series)
    if (!parent) { parent = { id: nextId++, manufacturerId: maker.id, name: t.series }; await db.lureSeries.add(parent) }
    await db.lureModels.add({ id: nextId++, seriesId: parent.id, name: t.model, weightG: t.weight })
  }
  const model = (await db.lureModels.toArray())[0], parent = await db.lureSeries.get(model.seriesId), maker = await db.lureManufacturers.get(parent.manufacturerId)
  await db.lureVariants.add({ id: 501, modelId: model.id, colorName: '既存の個人用カラー' })
  await db.myLures.add({ id: 9, variantId: 501, active: false, ownershipStatus: 'unverified', memo: '保持する所有情報' })
  const appearance = { version: 1, paletteVersion: 1, layout: 'body', regions: { side: { colors: ['red'], attributes: [] } } }
  const identity = schema.visualIdentityForVariant(await db.lureVariants.get(501), model, parent, maker)
  const profile = { id: crypto.randomUUID(), variantId: 501, identity, naturalKey: schema.visualNaturalKey(identity), appearance,
    origin: 'user', userEdited: true, confirmed: true, revision: 2, updatedAt: '2026-11-01T00:00:00.000Z' }
  await db.lureVisualProfiles.add(profile)
  await db.temporaryLureColors.add({ id: crypto.randomUUID(), name: '仮配色も保持', appearance,
    origin: 'user', userEdited: true, confirmed: true, revision: 1, updatedAt: profile.updatedAt })
  await db.trips.add({ id: 1, fishingAreaName: '隔離検証', fishingDate: '2026-11-01', startedAt: new Date('2026-11-01T00:00:00Z'), fishingStyle: 'AREA_TROUT' })
  await db.catches.add({ id: 1, tripId: 1, caughtAt: new Date('2026-11-01T01:00:00Z'), lureId: 9, lureVariantId: 501,
    memo: '既存の釣果', visualColorSnapshot: createVisualSnapshot(appearance, profile) })
  await db.tripEvents.add({ id: 1, tripId: 1, occurredAt: new Date('2026-11-01T00:30:00Z'), type: 'stocking' })
}
beforeEach(async () => { await db.delete(); await db.open(); await seed() })
after(async () => {
  db.close(); await db.delete()
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
  await rm(directory, { recursive: true, force: true })
})

test('first actual apply and repeat are atomic, add-only, preserve every existing ID/value and keep ownership OFF', async () => {
  const u = updater(), before = await dataState(), p = await u.preview(), first = await u.apply(p.comparisonToken)
  assert.deepEqual(added(first), { lureManufacturers: 0, lureSeries: 30, lureModels: 80, lureVariants: 1288, myLures: 0, lureVisualProfiles: 41 })
  assert.deepEqual(first.history.counts, first.counts)
  assert.equal(first.history.status, 'succeeded_with_holds'); assert.equal(first.counts.lureVariants.held, 11)
  assert.ok(first.history.details.some(d => d.reason.includes('http')))
  assert.equal(first.history.manifestHash, createHash('sha256').update(schema.lureMasterHistoryValue(manifest)).digest('hex'))
  assert.equal(first.history.options.includePurchases, false)
  const after = await dataState(); preserves(before, after); assert.deepEqual(after.myLures, before.myLures)
  for (const [name, count] of Object.entries(added(first))) assert.equal(after[name].length - before[name].length, count)
  assert.equal(after.lureVisualProfiles.filter(p => p.origin === 'photo').length, 29)
  assert.equal(after.lureVisualProfiles.filter(p => p.origin === 'name').length, 12)
  assert.equal(first.plan.unknownColors, 20)
  const second = await u.apply((await u.preview()).comparisonToken)
  assert.deepEqual(added(second), zero()); assert.deepEqual(await dataState(), after)
  assert.equal(second.counts.lureVariants.retained, 1288)
  assert.equal((await db.lureMasterImportHistory.toArray()).filter(r => r.status === 'succeeded_with_holds').length, 2)
  const variants = after.lureVariants
  assert.equal(new Set(variants.map(v => `${v.modelId}/${v.colorName}`)).size, variants.length)
  for (const v of variants) assert.ok(after.lureModels.some(m => m.id === v.modelId))
  for (const m of after.lureModels) assert.ok(after.lureSeries.some(s => s.id === m.seriesId))
  assert.ok(after.lureVariants.some(v => v.colorName.includes('かべるね')))
  assert.ok(after.lureVariants.some(v => v.colorName.includes('かるべね')))
  assert.ok(after.lureVariants.filter(v => v.id !== 501).every(v => v.catalogEvidence?.sourceTier &&
    (v.catalogEvidence.manufacturerUrl || v.catalogEvidence.retailerUrl)))
  const t15 = after.lureVariants.find(v => v.colorName.startsWith('T-15 '))
  assert.equal(t15.catalogEvidence.revision, 'RC20'); assert.equal(t15.catalogEvidence.colorCode, 'T-15')
})

test('ownership can be enabled later: exactly 11 added, then all six added counts are zero', async () => {
  const u = updater(); await u.apply((await u.preview()).comparisonToken)
  const on = await u.apply((await u.preview({ includePurchases: true })).comparisonToken, { includePurchases: true })
  assert.deepEqual(added(on), { ...zero(), myLures: 11 })
  const before = await dataState()
  const again = await u.apply((await u.preview({ includePurchases: true })).comparisonToken, { includePurchases: true })
  assert.deepEqual(added(again), zero()); assert.deepEqual(await dataState(), before)
  assert.equal((await db.myLures.get(9)).ownershipStatus, 'unverified')
  assert.equal((await db.myLures.get(9)).active, false)
})

test('existing RC33 61 colors, 11 purchased records and 41 profiles are unchanged', async () => {
  await legacy33.applyRc33Catalog((await legacy33.previewRc33Catalog()).comparisonToken)
  const before = await dataState(), u = updater()
  const result = await u.apply((await u.preview({ includePurchases: true })).comparisonToken, { includePurchases: true })
  assert.equal(result.counts.lureVariants.added, 1227)
  assert.equal(result.counts.lureVariants.retained, 61)
  assert.equal(result.counts.myLures.added, 0); assert.equal(result.counts.lureVisualProfiles.added, 0)
  preserves(before, await dataState())
})

test('partial registration only adds a missing color; no successful-history shortcut', async () => {
  const u = updater(); await u.apply((await u.preview()).comparisonToken)
  const missing = (await db.lureVariants.toArray()).find(v => v.colorName.startsWith('T-1 '))
  await db.lureVariants.delete(missing.id)
  const before = await dataState(), p = await u.preview()
  assert.equal(p.addedColors, 1)
  const result = await u.apply(p.comparisonToken)
  assert.deepEqual(added(result), { ...zero(), lureVariants: 1 }); preserves(before, await dataState())
})

test('inactive/unverified purchased ownership and user/photo/name profiles are never promoted or overwritten', async () => {
  const u = updater(); await u.apply((await u.preview({ includePurchases: true })).comparisonToken, { includePurchases: true })
  const owned = (await db.myLures.toArray()).filter(m => m.id !== 9)
  for (const [i, m] of owned.entries()) await db.myLures.update(m.id, { active: false, ownershipStatus: i % 2 ? 'unverified' : 'placeholder' })
  const profile = (await db.lureVisualProfiles.toArray()).find(p => p.origin === 'name')
  await db.lureVisualProfiles.update(profile.id, { origin: 'user', userEdited: true, confirmed: true, revision: 2 })
  const before = await dataState()
  const result = await u.apply((await u.preview({ includePurchases: true })).comparisonToken, { includePurchases: true })
  assert.deepEqual(added(result), zero()); assert.deepEqual(await dataState(), before)
})

for (const name of ['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures', 'lureVisualProfiles']) {
  test(`injected ${name} insertion failure rolls back every data store; failed history has zero actual additions`, async () => {
    await db.delete(); await db.open()
    const u = updater(), p = await u.preview({ includePurchases: true }), before = await dataState()
    const fail = () => { throw new Error(`injected ${name}`) }
    db.table(name).hook('creating', fail)
    try { await assert.rejects(u.apply(p.comparisonToken, { includePurchases: true }), /injected/) }
    finally { db.table(name).hook('creating').unsubscribe(fail) }
    assert.deepEqual(await dataState(), before)
    const rows = await db.lureMasterImportHistory.toArray()
    assert.equal(rows.length, 1); assert.equal(rows[0].status, 'failed')
    assert.ok(Object.values(rows[0].counts).every(c => c.added === 0))
  })
}

test('a late exception after many colors and an invalid parent reference both roll back fully', async () => {
  const u = updater()
  for (const scenario of ['late', 'parent']) {
    const before = await dataState(), p = await u.preview(); let calls = 0
    const target = scenario === 'late' ? db.lureVariants : db.lureModels
    const hook = (_key, value) => {
      if (scenario === 'late') { if (++calls === 20) throw new Error('late exception') }
      else value.seriesId = 999999
    }
    target.hook('creating', hook)
    try { await assert.rejects(u.apply(p.comparisonToken), /late exception|親子参照/) }
    finally { target.hook('creating').unsubscribe(hook) }
    assert.deepEqual(await dataState(), before)
  }
  assert.throws(() => engine.resolveLureMasterId(-1, 'lureModels', new Map()), /仮ID/)
  assert.throws(() => engine.resolveLureMasterId(-1, 'lureModels', new Map([[-1, { table: 'lureSeries', id: 5 }]])), /仮ID/)
})

test('success-history failure rolls back data, then stores failed with zero additions', async () => {
  const u = updater(), p = await u.preview(), before = await dataState()
  const fail = changes => { if (changes.status !== 'failed') throw new Error('success history failed') }
  db.lureMasterImportHistory.hook('updating', fail)
  try { await assert.rejects(u.apply(p.comparisonToken), /success history failed/) }
  finally { db.lureMasterImportHistory.hook('updating').unsubscribe(fail) }
  assert.deepEqual(await dataState(), before)
  const failed = (await db.lureMasterImportHistory.toArray())[0]
  assert.equal(failed.status, 'failed')
  assert.equal(failed.counts.lureVariants.held, 11); assert.equal(failed.counts.lureModels.held, 1)
  assert.ok(Object.values(failed.counts).every(c => c.added === 0))
})

test('history storage failure is never reported as success, and orphan recovery requires the Web Lock protocol', async () => {
  const u = updater(), p = await u.preview(), before = await dataState()
  const fail = () => { throw new Error('all history finalization failed') }
  db.lureMasterImportHistory.hook('updating', fail)
  try { await assert.rejects(u.apply(p.comparisonToken), e => e.code === 'HISTORY_WRITE_FAILED' && !!e.historyError) }
  finally { db.lureMasterImportHistory.hook('updating').unsubscribe(fail) }
  assert.deepEqual(await dataState(), before)
  const run = (await db.lureMasterImportHistory.toArray())[0]
  assert.equal(run.status, 'running')
  assert.deepEqual(await u.recoverInterrupted(), [run.id])
  assert.equal((await db.lureMasterImportHistory.get(run.id)).status, 'interrupted')
  const legacy = await historyApi.startLureMasterImport({ masterVersion: manifest.masterVersion, manifestHash: 'a'.repeat(64), matchingVersion: 1, options: { includePurchases: false } })
  assert.deepEqual(await u.recoverInterrupted(), [])
  assert.equal((await db.lureMasterImportHistory.get(legacy.id)).status, 'running')
})

test('failure to save the start record prevents all data writes', async () => {
  const u = updater(), p = await u.preview(), before = await state()
  const fail = () => { throw new Error('start history failed') }
  db.lureMasterImportHistory.hook('creating', fail)
  try { await assert.rejects(u.apply(p.comparisonToken), /start history failed/) }
  finally { db.lureMasterImportHistory.hook('creating').unsubscribe(fail) }
  assert.deepEqual(await state(), before)
})

test('apply cannot join an ambient transaction and collapse the separate start/main commits', async () => {
  const u = updater(), p = await u.preview(), before = await state()
  await db.transaction('rw', db.tables, async () => {
    await assert.rejects(u.apply(p.comparisonToken), e => e.code === 'NESTED_APPLY')
    await assert.rejects(u.recoverInterrupted(), e => e.code === 'NESTED_APPLY')
  })
  assert.deepEqual(await state(), before)
})

for (const change of ['catalog', 'owned', 'visual', 'option', 'version', 'matching', 'manifest']) test(`stale preview detects ${change} before any catalog/owned/visual write`, async () => {
  const source = clone(manifest), u = engine.createLureMasterUpdater(db, source), p = await u.preview()
  if (change === 'catalog') await db.lureVariants.update(501, { colorName: '別タブ変更' })
  if (change === 'owned') await db.myLures.update(9, { memo: '別タブ変更' })
  if (change === 'visual') await db.lureVisualProfiles.update((await db.lureVisualProfiles.toArray())[0].id, { revision: 3 })
  if (change === 'version') source.masterVersion += '-changed'
  if (change === 'matching') source.matchingVersion++
  if (change === 'manifest') source.targets[0].colors[0].sourceUrl += '?changed'
  const before = await dataState(), touched = []
  const hooks = schema.lureMasterHistoryCountTables.map(name => {
    const table = db.table(name), fn = () => { touched.push(name) }
    for (const event of ['creating', 'updating', 'deleting']) table.hook(event, fn)
    return [table, fn]
  })
  try { await assert.rejects(u.apply(p.comparisonToken, { includePurchases: change === 'option' }), e => e.code === 'STALE_PREVIEW') }
  finally { for (const [t, fn] of hooks) for (const event of ['creating', 'updating', 'deleting']) t.hook(event).unsubscribe(fn) }
  assert.deepEqual(touched, []); assert.deepEqual(await dataState(), before)
  assert.equal((await db.lureMasterImportHistory.toArray())[0].error.code, 'STALE_PREVIEW')
})

for (const webLocks of [true, false]) test(`two independent DB connections serialize and reject the stale contender (Web Locks ${webLocks})`, async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks')
  if (!webLocks) Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
  const second = new Dexie(db.name)
  try {
    second.version(db.verno).stores(Object.fromEntries(db.tables.map(t => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map(i => i.src)].join(',')])))
    await second.open()
    const a = updater(), b = engine.createLureMasterUpdater(second)
    const pa = await a.preview({ includePurchases: true }), pb = await b.preview({ includePurchases: true })
    const results = await Promise.allSettled([a.apply(pa.comparisonToken, { includePurchases: true }), b.apply(pb.comparisonToken, { includePurchases: true })])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'STALE_PREVIEW')
    assert.equal(await db.lureVariants.count(), 1289); assert.equal(await db.myLures.count(), 12)
    assert.equal(await db.lureVisualProfiles.count(), 42)
    const rows = await db.lureMasterImportHistory.toArray()
    assert.equal(rows.filter(r => r.status === 'failed').length, 1)
    assert.equal(rows.filter(r => r.status === 'succeeded_with_holds').length, 1)
  } finally {
    second.close()
    if (!webLocks) { if (descriptor) Object.defineProperty(navigator, 'locks', descriptor); else delete navigator.locks }
  }
})

test('active Web Lock prevents interruption; unsupported Web Locks never auto-interrupt', async () => {
  const u = updater()
  const run = await historyApi.startLureMasterImport({ masterVersion: manifest.masterVersion, manifestHash: 'b'.repeat(64), matchingVersion: 1,
    options: { includePurchases: false }, executionProtocol: 'rc34-web-lock-v1' })
  await navigator.locks.request(u.lockName, async () => { assert.deepEqual(await u.recoverInterrupted(), []) })
  assert.equal((await db.lureMasterImportHistory.get(run.id)).status, 'running')
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks')
  Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
  try { assert.deepEqual(await u.recoverInterrupted(), []) }
  finally { if (descriptor) Object.defineProperty(navigator, 'locks', descriptor); else delete navigator.locks }
  assert.equal((await db.lureMasterImportHistory.get(run.id)).status, 'running')
  assert.deepEqual(await u.recoverInterrupted(), [run.id])
})

test('restore retains history but reapply uses current data and a new context', async () => {
  const u = updater(), original = await backup.createBackup()
  const first = await u.apply((await u.preview()).comparisonToken)
  await backup.importBackup({ text: async () => JSON.stringify(original) })
  const p = await u.preview(); assert.equal(p.addedColors, 1288)
  const again = await u.apply(p.comparisonToken)
  assert.equal(again.counts.lureVariants.added, 1288)
  assert.notEqual(again.history.contextId, first.history.contextId)
  assert.deepEqual(added(await u.apply((await u.preview()).comparisonToken)), zero())
  const v9 = await backup.createBackup(); assert.equal(v9.version, 9); backup.validateBackup(JSON.parse(JSON.stringify(v9)))
})

test('UUID collisions hold affected products without changing existing dictionary UUIDs', async () => {
  const u = updater(), p = await u.preview({ includePurchases: true }), before = await dataState()
  const uuid = before.lureVisualProfiles[0].id, original = crypto.randomUUID.bind(crypto); let calls = 0
  crypto.randomUUID = () => ++calls <= 2 ? original() : uuid
  let result
  try { result = await u.apply(p.comparisonToken, { includePurchases: true }) }
  finally { crypto.randomUUID = original }
  assert.ok(result.plan.rows.some(r => r.catalog === 'hold' && r.reason.includes('UUID')))
  assert.equal(result.counts.lureVisualProfiles.added, 0)
  assert.deepEqual(await db.lureVisualProfiles.toArray(), before.lureVisualProfiles)
  preserves(before, await dataState())
})

test('detached profile conflicts hold their model without unsafe relinking or UUID changes', async () => {
  const u = updater(); await u.apply((await u.preview()).comparisonToken)
  const profile = (await db.lureVisualProfiles.toArray()).find(p => p.origin === 'photo')
  await db.lureVisualProfiles.update(profile.id, { variantId: undefined })
  const before = await dataState(), p = await u.preview(), result = await u.apply(p.comparisonToken)
  assert.ok(result.plan.rows.some(r => r.reason.includes('参照解除')))
  assert.deepEqual(added(result), zero()); assert.deepEqual(await dataState(), before)
})

test('clear subset records succeeded then no_changes, and runs entirely without network access or async crypto in IDB', async () => {
  const source = clone(manifest)
  source.targets = source.targets.filter(t => t.model === 'PO-22F'); source.pending = []
  const u = engine.createLureMasterUpdater(db, source), fetch = globalThis.fetch, digest = crypto.subtle.digest.bind(crypto.subtle)
  globalThis.fetch = () => { throw new Error('network is forbidden') }
  crypto.subtle.digest = (...args) => { assert.equal(!!Dexie.currentTransaction, false); return digest(...args) }
  try {
    const first = await u.apply((await u.preview()).comparisonToken)
    assert.equal(first.history.status, 'succeeded'); assert.equal(first.counts.lureVariants.added, 12)
    const again = await u.apply((await u.preview()).comparisonToken)
    assert.equal(again.history.status, 'no_changes'); assert.deepEqual(added(again), zero())
    assert.equal(first.history.manifestHash, await engine.hashLureMasterManifest(source))
  } finally { globalThis.fetch = fetch; crypto.subtle.digest = digest }
})
