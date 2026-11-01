import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-rc34-history-')), modules = new Map()
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
async function compile(file) {
  file = resolve(file)
  if (modules.has(file)) return modules.get(file)
  const url = pathToFileURL(join(directory, `${modules.size}.mjs`)).href
  modules.set(file, url)
  let code = transpile(await readFile(file, 'utf8'))
  for (const specifier of [...code.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1])) {
    const target = specifier.startsWith('.') ? await compile(resolve(dirname(file), `${specifier}.ts`)) : import.meta.resolve(specifier)
    code = code.replaceAll(`'${specifier}'`, JSON.stringify(target)).replaceAll(`"${specifier}"`, JSON.stringify(target))
  }
  await writeFile(new URL(url), code); return url
}
const schema = await import(await compile('src/db/database.ts'))
const backup = await import(await compile('src/utils/backup.ts'))
const history = await import(await compile('src/utils/lureMasterHistory.ts'))
const { createVisualSnapshot } = await import(await compile('src/utils/visualColorStorage.ts'))
const { rc30Fixture } = await import(await compile('tests/rc30Fixture.ts'))
const { planLureMaster } = await import(await compile('src/utils/lureMasterPlanner.ts'))
const { db, emptyLureMasterHistoryCounts: counts, validateLureMasterHistoryRecord: validate, lureMasterHistoryHead: head } = schema
const clone = v => structuredClone(v), json = v => JSON.parse(JSON.stringify(v))
const file = value => ({ text: async () => JSON.stringify(value) })
const state = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
const oldState = async () => { const rows = await state(); delete rows.lureMasterImportHistory; return rows }
const identity = () => ({ masterVersion: 'RC34-phase1', manifestHash: 'a'.repeat(64), matchingVersion: 1, options: { includePurchases: false } })
function record(overrides = {}) {
  const c = counts(); c.lureVariants.added = 7; c.lureVariants.retained = 11
  return { id: crypto.randomUUID(), kind: 'import', contextId: crypto.randomUUID(), sequence: 1,
    startedAt: '2026-11-01T00:00:00.000Z', completedAt: '2026-11-01T00:00:01.000Z',
    status: 'succeeded', ...identity(), counts: c, ...overrides }
}
const v9 = rows => {
  const source = rc30Fixture()
  return { ...source, version: 9, data: { ...source.data, lureVisualProfiles: [], temporaryLureColors: [], lureMasterImportHistory: clone(rows) } }
}
beforeEach(async () => { await db.delete(); await db.open(); await backup.importBackup(file(rc30Fixture())) })
after(async () => {
  db.close(); await db.delete()
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
  await rm(directory, { recursive: true, force: true })
})

test('v9 -> v10 migration preserves every existing store, schema, sparse ID and auto-increment without seeding', async () => {
  await db.delete()
  const source = await readFile('src/db/database.ts', 'utf8')
  const legacyUrl = pathToFileURL(join(directory, 'legacy9.mjs')).href
  await writeFile(new URL(legacyUrl), transpile(source.slice(0, source.indexOf('db.version(10)'))).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie'))))
  const { db: legacy } = await import(legacyUrl)
  await legacy.open()
  try {
    for (const [table, rows] of Object.entries(backup.validateBackup(rc30Fixture()))) await legacy.table(table).bulkAdd(rows)
    for (const table of legacy.tables) if (!await table.count()) {
      const keys = Array.isArray(table.schema.primKey.keyPath) ? table.schema.primKey.keyPath : [table.schema.primKey.keyPath]
      await table.add(Object.fromEntries(keys.map(key => [key, key === 'id' && !table.schema.primKey.auto ? crypto.randomUUID() : key === 'key' ? 'fixture' : 900])))
    }
    assert.equal(legacy.verno, 9); assert.equal(legacy.tables.length, 21)
    const before = Object.fromEntries(await Promise.all(legacy.tables.map(async t => [t.name, await t.toArray()])))
    const indexes = Object.fromEntries(legacy.tables.map(t => [t.name, [t.schema.primKey.src, t.schema.indexes.map(i => i.src)]]))
    legacy.close(); await db.open()
    assert.equal(db.verno, 10); assert.equal(db.tables.length, 22)
    assert.deepEqual(await oldState(), before)
    for (const [name, schema] of Object.entries(indexes)) assert.deepEqual([db.table(name).schema.primKey.src, db.table(name).schema.indexes.map(i => i.src)], schema)
    assert.equal(await db.lureMasterImportHistory.count(), 0)
    assert.ok(await db.lureVariants.add({ modelId: 144, colorName: 'new fixture' }) > 386)
  } finally { legacy.close() }
})

test('explicit history lifecycle stores real timestamps, all outcome states and protects the old 21 stores', async () => {
  const before = await oldState(), startTime = Date.now()
  for (const status of ['succeeded', 'succeeded_with_holds', 'no_changes', 'failed', 'interrupted']) {
    const run = await history.startLureMasterImport(identity()), c = counts()
    assert.equal(run.status, 'running'); assert.ok(Date.parse(run.startedAt) >= startTime)
    if (status === 'succeeded') c.lureVariants.added = 3
    if (status === 'succeeded_with_holds') { c.lureVariants.added = 2; c.lureVariants.held = 1 }
    c.lureVariants.retained = 9
    const outcome = { status, counts: c, ...(['failed', 'interrupted'].includes(status) ? { error: { code: 'fixture', message: 'explicit failure/interruption' } } : {}) }
    const done = await history.finishLureMasterImport(run, outcome)
    assert.equal(done.status, status); assert.ok(Date.parse(done.completedAt) >= Date.parse(run.startedAt))
    assert.deepEqual(done.counts, c)
    await assert.rejects(history.finishLureMasterImport(run, outcome), /変更/)
  }
  const rows = await db.lureMasterImportHistory.toArray()
  assert.equal(new Set(rows.map(r => r.contextId)).size, 1)
  assert.equal(new Set(rows.map(r => r.sequence)).size, 5)
  assert.deepEqual(await oldState(), before)
  db.close(); await db.open(); assert.equal(await db.lureMasterImportHistory.count(), 5)
})

test('no history preserves legacy export selection; history selects v9 even without a visual dictionary', async () => {
  assert.equal((await backup.createBackup()).version, 7)
  await history.startLureMasterImport(identity())
  const exported = await backup.createBackup()
  assert.equal(exported.version, 9); assert.equal(Object.keys(exported.data).length, 22)
  assert.deepEqual(exported.data.lureVisualProfiles, [])
  backup.validateBackup(json(exported))
})

test('v9 roundtrip keeps all original rows and history, adding only a new restore context event', async () => {
  const a = record(); await db.lureMasterImportHistory.add(a)
  const exported = json(await backup.createBackup()), before = await oldState(), original = clone(exported)
  await backup.importBackup(file(exported))
  assert.deepEqual(await oldState(), before); assert.deepEqual(exported, original)
  assert.deepEqual(await db.lureMasterImportHistory.get(a.id), a)
  const rows = await db.lureMasterImportHistory.toArray(), event = head(rows)
  assert.equal(rows.length, 2); assert.equal(event.kind, 'restore'); assert.equal(event.sourceBackupVersion, 9)
  assert.notEqual(event.contextId, a.contextId); assert.equal(event.previousContextId, a.contextId)
  await backup.importBackup(file(exported))
  assert.equal(await db.lureMasterImportHistory.count(), 3) // duplicate source UUID is never duplicated
})

test('history UUID merge is independent of property order; distinct events survive with local ordering', async () => {
  const a = record(), b = record({ sequence: 100 })
  await db.lureMasterImportHistory.add(a)
  const reordered = Object.fromEntries(Object.entries(a).reverse())
  await backup.importBackup(file(v9([reordered, b])))
  assert.equal(await db.lureMasterImportHistory.count(), 3)
  assert.deepEqual(await db.lureMasterImportHistory.get(a.id), a)
  assert.deepEqual(await db.lureMasterImportHistory.get(b.id), b)
  const event = head(await db.lureMasterImportHistory.toArray())
  assert.equal(event.sequence, 101)
  const run = await history.startLureMasterImport(identity())
  assert.equal(run.contextId, event.contextId); assert.equal(run.sequence, 102)
})

test('conflicting existing UUID is rejected before any write, including replaced master data', async () => {
  const a = record(); await db.lureMasterImportHistory.add(a)
  const source = v9([{ ...a, masterVersion: 'conflicting version' }])
  source.data.lureVariants[0].colorName = 'must not be written'
  const before = await state(), touched = []
  const hooks = db.tables.map(t => {
    const fn = () => { touched.push(t.name) }
    for (const event of ['creating', 'updating', 'deleting']) t.hook(event, fn)
    return [t, fn]
  })
  try { await assert.rejects(backup.importBackup(file(source)), /競合/); assert.deepEqual(touched, []); assert.deepEqual(await state(), before) }
  finally { for (const [t, fn] of hooks) for (const event of ['creating', 'updating', 'deleting']) t.hook(event).unsubscribe(fn) }
})

for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) test(`legacy v${version} restore retains history and rotates context without automatic master import`, async () => {
  const a = record(); await db.lureMasterImportHistory.add(a)
  const source = rc30Fixture(); source.version = version
  if (version < 7) for (const key of schema.weatherTableNames) delete source.data[key]
  if (version < 6) {
    for (const key of ['facilities', 'zones', 'appMetadata']) delete source.data[key]
    for (const row of [...source.data.trips, ...source.data.catches]) for (const field of ['facilityId', 'currentZoneId', 'zoneId', 'locationSnapshot']) delete row[field]
  }
  if (version < 5) delete source.data.fishSpecies
  if (version < 4) for (const key of schema.tackleTableNames) delete source.data[key]
  if (version < 3) {
    for (const c of source.data.catches) delete c.lureVariantId
    for (const m of source.data.myLures) delete m.ownershipStatus
  }
  if (version === 1) delete source.data.tripEvents
  if (version === 8) Object.assign(source.data, { lureVisualProfiles: [], temporaryLureColors: [] })
  await backup.importBackup(file(source))
  assert.deepEqual(await db.lureMasterImportHistory.get(a.id), a)
  const rows = await db.lureMasterImportHistory.toArray()
  assert.equal(rows.length, 2); assert.notEqual(head(rows).contextId, a.contextId)
  assert.equal(await db.lureVariants.count(), source.data.lureVariants.length)
})

test('v9 preserves representative/temporary colors and snapshots; legacy restore still detaches local references', async () => {
  const source = v9([record()]), s = backup.validateBackup(source)
  const v = s.lureVariants[0], m = s.lureModels.find(m => m.id === v.modelId), p = s.lureSeries.find(p => p.id === m.seriesId), maker = s.lureManufacturers.find(row => row.id === p.manufacturerId)
  const identity = schema.visualIdentityForVariant(v, m, p, maker)
  const appearance = { version: 1, paletteVersion: 1, layout: 'spoon', regions: { front: { colors: ['red'], attributes: [] } } }
  const profile = { id: crypto.randomUUID(), variantId: v.id, identity, naturalKey: schema.visualNaturalKey(identity), appearance,
    origin: 'user', userEdited: true, confirmed: true, revision: 1, updatedAt: '2026-11-01T00:00:00.000Z' }
  const temporary = { ...profile, id: crypto.randomUUID(), modelId: m.id, modelIdentity: { manufacturer: maker.name, series: p.name, model: m.name } }
  delete temporary.variantId; delete temporary.identity; delete temporary.naturalKey
  source.data.lureVisualProfiles.push(profile); source.data.temporaryLureColors.push(temporary)
  const savedSnapshot = createVisualSnapshot(appearance, profile)
  source.data.catches[0].visualColorSnapshot = savedSnapshot
  await backup.importBackup(file(source))
  assert.deepEqual(await db.lureVisualProfiles.get(profile.id), profile)
  const exported = await backup.createBackup(); await backup.importBackup(file(exported))
  assert.deepEqual(await db.temporaryLureColors.get(temporary.id), temporary)
  assert.deepEqual((await db.catches.get(source.data.catches[0].id)).visualColorSnapshot, savedSnapshot)
  await backup.importBackup(file(rc30Fixture()))
  const detached = { ...profile }; delete detached.variantId
  const detachedTemporary = { ...temporary }; delete detachedTemporary.modelId
  assert.deepEqual(await db.lureVisualProfiles.get(profile.id), detached)
  assert.deepEqual(await db.temporaryLureColors.get(temporary.id), detachedTemporary)
})

test('restore and incoming history roll back when final restore-event insertion fails', async () => {
  const a = record(); await db.lureMasterImportHistory.add(a)
  const source = v9([record()]); source.data.lureVariants[0].colorName = 'rolled back'
  const before = await state(), fail = (_key, row) => { if (row.kind === 'restore') throw new Error('late history failure') }
  db.lureMasterImportHistory.hook('creating', fail)
  try { await assert.rejects(backup.importBackup(file(source)), /late history failure/) }
  finally { db.lureMasterImportHistory.hook('creating').unsubscribe(fail) }
  assert.deepEqual(await state(), before)
})

test('late failure in a legacy store also rolls back restoration and leaves all local history intact', async () => {
  await db.lureMasterImportHistory.add(record())
  const before = await state(), fail = () => { throw new Error('master failure') }
  db.catches.hook('creating', fail)
  try { await assert.rejects(backup.importBackup(file(v9([record()]))), /master failure/) }
  finally { db.catches.hook('creating').unsubscribe(fail) }
  assert.deepEqual(await state(), before)
})

test('history finalization joins its enclosing transaction and rolls back, and restored runs cannot succeed in a new context', async () => {
  const run = await history.startLureMasterImport(identity()), c = counts(); c.lureVariants.added = 1
  await assert.rejects(db.transaction('rw', db.lureMasterImportHistory, async () => {
    await history.finishLureMasterImport(run, { status: 'succeeded', counts: c })
    throw new Error('enclosing transaction rollback')
  }), /rollback/)
  assert.deepEqual(await db.lureMasterImportHistory.get(run.id), run)
  await backup.importBackup(file(rc30Fixture()))
  await assert.rejects(history.finishLureMasterImport(run, { status: 'succeeded', counts: c }), /文脈/)
  await history.finishLureMasterImport(run, { status: 'interrupted', counts: counts(), error: { code: 'restored', message: 'explicit interruption' } })
})

test('past successful history never suppresses a current planner diff after restore', async () => {
  await db.lureMasterImportHistory.add(record())
  await backup.importBackup(file(rc30Fixture()))
  const snapshot = Object.fromEntries(await Promise.all(['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures', 'lureVisualProfiles'].map(async name => [name, await db.table(name).toArray()])))
  const p = planLureMaster(snapshot)
  assert.ok(p.addedColors > 0)
  assert.ok((await db.lureMasterImportHistory.toArray()).some(row => row.kind === 'import' && row.status === 'succeeded'))
})

test('reopening does not auto-import or automatically interrupt a running record', async () => {
  const run = await history.startLureMasterImport(identity()), before = await state()
  db.close(); await db.open()
  assert.deepEqual(await state(), before)
  assert.deepEqual(await db.lureMasterImportHistory.get(run.id), run)
})

test('history write errors propagate without corrupting existing data or reporting a completed run', async () => {
  const before = await state(), fail = () => { throw new Error('history write failure') }
  db.lureMasterImportHistory.hook('creating', fail)
  try { await assert.rejects(history.startLureMasterImport(identity()), /history write failure/) }
  finally { db.lureMasterImportHistory.hook('creating').unsubscribe(fail) }
  assert.deepEqual(await state(), before)
  const run = await history.startLureMasterImport(identity())
  db.lureMasterImportHistory.hook('updating', fail)
  try { await assert.rejects(history.finishLureMasterImport(run, { status: 'no_changes', counts: counts() }), /history write failure/) }
  finally { db.lureMasterImportHistory.hook('updating').unsubscribe(fail) }
  assert.deepEqual(await db.lureMasterImportHistory.get(run.id), run)
  assert.deepEqual(await oldState(), Object.fromEntries(Object.entries(before).filter(([name]) => name !== 'lureMasterImportHistory')))
})

const invalid = {
  uuid: r => { r.id = 'bad' }, context: r => { r.contextId = 'bad' }, sequence: r => { r.sequence = -1 },
  timestamp: r => { r.startedAt = '2026-02-30T00:00:00.000Z' }, completion: r => { delete r.completedAt },
  order: r => { r.completedAt = '2026-10-01T00:00:00.000Z' }, hash: r => { r.manifestHash = 'not-a-hash' },
  counts: r => { r.counts.lureVariants.added = -1 }, fraction: r => { r.counts.lureVariants.held = 0.5 },
  missingCounts: r => { delete r.counts.myLures }, options: r => { r.options.includePurchases = 'yes' },
  status: r => { r.status = 'unknown' }, noChanges: r => { r.status = 'no_changes' },
  failedAdds: r => { r.status = 'failed'; r.error = { code: 'x', message: 'x' } },
  missingError: r => { r.status = 'failed'; r.counts = counts() },
  unknownField: r => { r.variantId = 386 }, heldStatus: r => { r.status = 'succeeded_with_holds' },
}
for (const [name, change] of Object.entries(invalid)) test(`invalid history ${name} is rejected before any restored write`, async () => {
  const r = record(); change(r)
  const before = await state()
  assert.throws(() => validate(r))
  await assert.rejects(backup.importBackup(file(v9([r]))))
  assert.deepEqual(await state(), before)
})

test('duplicate UUIDs, missing v9 history and history hidden in v8 are rejected', async () => {
  const a = record(), missing = v9([]); delete missing.data.lureMasterImportHistory
  const old = v9([a]); old.version = 8
  for (const source of [v9([a, a]), missing, old]) {
    const before = await state(); await assert.rejects(backup.importBackup(file(source))); assert.deepEqual(await state(), before)
  }
})
