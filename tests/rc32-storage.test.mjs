import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// fake-indexeddb is process-local. No browser DB, backup file, or live user data.
const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc32-'))
const sources = { database: 'src/db/database.ts', backup: 'src/utils/backup.ts', storage: 'src/utils/visualColorStorage.ts',
  facilityStorage: 'src/utils/facilityStorage.ts', facilityMaster: 'src/utils/facilityMaster.ts', fixture: 'tests/rc30Fixture.ts' }
const paths = Object.fromEntries([...Object.keys(sources), 'legacy'].map(n => [n, join(directory, n + '.mjs')]))
const compile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
for (const [name, source] of Object.entries(sources)) {
  let code = compile(await readFile(source, 'utf8')).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
  for (const [from, to] of [['../db/database', 'database'], ['./facilityStorage', 'facilityStorage'], ['./facilityMaster', 'facilityMaster']]) {
    code = code.replaceAll(`'${from}'`, JSON.stringify(pathToFileURL(paths[to]).href))
  }
  await writeFile(paths[name], code)
}
const databaseSource = await readFile(sources.database, 'utf8')
await writeFile(paths.legacy, compile(databaseSource.slice(0, databaseSource.indexOf('db.version(9)'))).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie'))))
const schema = await import(pathToFileURL(paths.database).href)
const { db, visualPalette, visualAttributes, visualNaturalKey, validateVisualAppearance, validateVisualSnapshot } = schema
const { createBackup, validateBackup, importBackup } = await import(pathToFileURL(paths.backup).href)
const { saveVisualProfile, saveTemporaryColor, createVisualSnapshot, saveRepresentative, readVisualProfiles, linkCatchAppearance, linkTemporaryAppearance } = await import(pathToFileURL(paths.storage).href)
const { rc30Fixture } = await import(pathToFileURL(paths.fixture).href)
const copy = x => structuredClone(x)
const json = x => JSON.parse(JSON.stringify(x))
const file = value => new File([JSON.stringify(value)], 'synthetic-rc32.json')
const state = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
const appearance = () => ({ version: 1, paletteVersion: 1, layout: 'spoon', regions: {
  front: { colors: ['red', 'gold'], attributes: ['metallic'] }, back: { colors: ['black'], attributes: ['matte'] },
} })
const identity = () => ({ manufacturer: 'RODIO CRAFT', series: 'USSA', model: 'USSA', color: { kind: 'name', value: 'ハラオリ' } })
const status = () => ({ origin: 'user', userEdited: true, confirmed: true, revision: 1, updatedAt: '2026-10-31T00:00:00.000Z' })
const profile = () => ({ id: '00000000-0000-4000-8000-000000000001', variantId: 386, identity: identity(),
  naturalKey: visualNaturalKey(identity()), appearance: appearance(), ...status() })
const temporary = () => ({ id: '00000000-0000-4000-8000-000000000002', name: '現場仮カラー', modelId: 144,
  modelIdentity: { manufacturer: 'RODIO CRAFT', series: 'USSA', model: 'USSA' }, linkedVariantId: 386, linkedIdentity: identity(), appearance: appearance(), ...status() })

beforeEach(async () => {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    for (const [table, rows] of Object.entries(validateBackup(rc30Fixture()))) await db.table(table).bulkAdd(rows)
  })
})
after(async () => {
  db.close()
  assert(resolve(directory).startsWith(resolve(tmpdir()) + sep))
  await rm(directory, { recursive: true, force: true })
})

test('fixed palette has 48 unique IDs and attributes have 12; all layouts validate and remain distinct from unknown', () => {
  assert.equal(visualPalette.length, 48); assert.equal(new Set(visualPalette.map(c => c[0])).size, 48)
  assert.ok(visualPalette.every(c => /^#[0-9A-F]{6}$/.test(c[2])))
  assert.equal(visualAttributes.length, 12); assert.equal(new Set(visualAttributes.map(a => a[0])).size, 12)
  validateVisualAppearance(appearance())
  validateVisualAppearance({ version: 1, paletteVersion: 1, layout: 'body', regions: { dorsal: { colors: ['blue'], attributes: [] }, side: { colors: ['silver'], attributes: ['glitter'] }, belly: { colors: [], attributes: ['transparent'] } } })
  validateVisualAppearance({ version: 1, paletteVersion: 1, layout: 'generic', regions: {} })
  for (const edit of [a => a.layout = 'bad', a => a.paletteVersion = 2, a => a.regions.belly = a.regions.front,
    a => a.regions.front.colors.push('red'), a => a.regions.front.colors.push('unknown'), a => a.regions.back.attributes.push('wrong')]) {
    const a = appearance(); edit(a); assert.throws(() => validateVisualAppearance(a))
  }
})

test('v8 to v9 preserves all 19 populated tables, primary keys, indexes, and auto-increment sequence', async () => {
  db.close(); await db.delete()
  const { db: legacy } = await import(pathToFileURL(paths.legacy).href)
  await legacy.open()
  try {
    for (const [table, rows] of Object.entries(validateBackup(rc30Fixture()))) await legacy.table(table).bulkAdd(rows)
    for (const [table, row] of Object.entries({ rods: { id: 71 }, reels: { id: 72 }, lines: { id: 73 }, tackleSets: { id: 74 },
      fishSpecies: { fish_id: 'synthetic' }, appMetadata: { key: 'facilityMaster', marker: 'retained' },
      tripEvents: { id: 75, tripId: 13 }, tripWeatherHours: { tripId: 13, timestamp: 0 }, tripWeatherRequests: { id: 76, tripId: 13 } })) await legacy.table(table).add(row)
    assert.equal(legacy.verno, 8); assert.equal(legacy.tables.length, 19)
    assert.ok((await Promise.all(legacy.tables.map(t => t.count()))).every(n => n > 0))
    const before = Object.fromEntries(await Promise.all(legacy.tables.map(async t => [t.name, await t.toArray()])))
    const schemas = Object.fromEntries(legacy.tables.map(t => [t.name, [t.schema.primKey.src, t.schema.indexes.map(i => i.src)]]))
    legacy.close(); await db.open()
    assert.equal(db.verno, 9); assert.equal(db.tables.length, 21)
    for (const [table, rows] of Object.entries(before)) {
      assert.deepEqual(await db.table(table).toArray(), rows, table)
      assert.deepEqual([db.table(table).schema.primKey.src, db.table(table).schema.indexes.map(i => i.src)], schemas[table])
    }
    assert.equal(await db.lureVisualProfiles.count(), 0); assert.equal(await db.temporaryLureColors.count(), 0)
    assert.ok(await db.lureVariants.add({ modelId: 144, colorName: '追加の合成色' }) > 386)
  } finally { legacy.close() }
})

test('save/reopen visual profiles and temporary colors touches no existing record or ownership', async () => {
  const before = await state()
  assert.equal(await saveVisualProfile(profile()), 'saved'); await saveTemporaryColor(temporary())
  db.close(); await db.open()
  assert.deepEqual(await db.lureVisualProfiles.get(profile().id), profile())
  assert.deepEqual(await db.temporaryLureColors.get(temporary().id), temporary())
  for (const [table, rows] of Object.entries(before).filter(([t]) => !schema.visualTableNames.includes(t))) assert.deepEqual(await db.table(table).toArray(), rows, table)
})

test('automatic update cannot overwrite user-edited or confirmed values; manual updates use revision checks', async () => {
  const p = profile(); await saveVisualProfile(p)
  const auto = { ...p, origin: 'name', userEdited: false, confirmed: false, revision: 2, appearance: { version: 1, paletteVersion: 1, layout: 'generic', regions: {} } }
  assert.equal(await saveVisualProfile(auto, 1), 'protected'); assert.deepEqual(await db.lureVisualProfiles.get(p.id), p)
  await assert.rejects(saveVisualProfile({ ...p, revision: 2 }, 0))
  await saveVisualProfile({ ...p, revision: 2 }, 1)
  await assert.rejects(saveVisualProfile({ ...p, revision: 3 }, 1))
  const inferred = { ...p, revision: 3, origin: 'photo', userEdited: false, confirmed: true }
  await db.lureVisualProfiles.put(inferred)
  assert.equal(await saveVisualProfile({ ...auto, revision: 4 }, 3), 'protected')
  await saveTemporaryColor(temporary())
  await assert.rejects(saveTemporaryColor({ ...temporary(), origin: 'name', userEdited: false, revision: 2 }, 1))
})

test('unprotected inference may update, but cannot substitute a different natural identity', async () => {
  const p = { ...profile(), origin: 'name', userEdited: false, confirmed: false }
  await saveVisualProfile(p)
  await saveVisualProfile({ ...p, origin: 'photo', revision: 2, evidence: { sourceUrl: 'https://example.com/synthetic', confidence: 0.8, estimatorVersion: 'fixture-v1' } }, 1)
  const bad = { ...p, revision: 3, identity: { ...identity(), color: { kind: 'name', value: '別色' } } }
  bad.naturalKey = visualNaturalKey(bad.identity)
  await assert.rejects(saveVisualProfile(bad, 2))
})

test('natural keys are model-scoped; normalization never changes stored official spelling', async () => {
  const a = { ...identity(), color: { kind: 'code', value: 'T-458' } }
  assert.equal(visualNaturalKey(a), visualNaturalKey({ ...a, color: { kind: 'code', value: 'Ｔ４５８' } }))
  assert.notEqual(visualNaturalKey(a), visualNaturalKey({ ...a, model: 'another model' }))
  await db.lureVariants.update(386, { colorName: 'T458 ひのえ２' })
  const p = { ...profile(), identity: a, naturalKey: visualNaturalKey(a) }; await saveVisualProfile(p)
  assert.deepEqual((await db.lureVisualProfiles.get(p.id)).identity, a)
})

test('snapshot is a value copy and v8 backup round trip preserves all 21 stores', async () => {
  await saveVisualProfile(profile()); await saveTemporaryColor(temporary())
  const a = appearance(), saved = createVisualSnapshot(a, status())
  a.regions.front.colors[0] = 'blue'; assert.equal(saved.appearance.regions.front.colors[0], 'red')
  validateVisualSnapshot(saved)
  await db.catches.update(1, { visualColorSnapshot: saved })
  const before = await state(), backup = await createBackup()
  assert.equal(backup.version, 8); assert.equal(Object.keys(backup.data).length, 21)
  const input = json(backup), frozen = copy(input); validateBackup(input); assert.deepEqual(input, frozen)
  await importBackup(file(backup)); assert.deepEqual(await state(), before)
  await saveVisualProfile({ ...profile(), revision: 2, appearance: a }, 1)
  assert.deepEqual((await db.catches.get(1)).visualColorSnapshot, saved)
})

test('snapshot alone triggers v8; invalid rendering values cannot be exported', async () => {
  await db.catches.update(1, { visualColorSnapshot: createVisualSnapshot(appearance(), status()) })
  assert.equal((await createBackup()).version, 8)
  const snapshot = (await db.catches.get(1)).visualColorSnapshot
  delete snapshot.colorValues.red
  await db.catches.update(1, { visualColorSnapshot: snapshot })
  await assert.rejects(createBackup())
})

test('Phase 2 patterns round trip; Phase 1 records without patterns or with more than three legacy colors remain valid', async () => {
  for (const [pattern] of schema.visualPatterns) {
    const p = profile(); p.appearance.regions.front.pattern = pattern
    await db.lureVisualProfiles.clear(); await saveVisualProfile(p)
    const backup = await createBackup(); await importBackup(file(backup))
    assert.equal((await db.lureVisualProfiles.get(p.id)).appearance.regions.front.pattern, pattern)
  }
  const old = profile(); old.appearance.regions.front.colors = ['red', 'blue', 'white', 'black']
  await db.lureVisualProfiles.clear(); await saveVisualProfile(old)
  const backup = await createBackup(); await importBackup(file(backup))
  assert.deepEqual(await db.lureVisualProfiles.get(old.id), old)
  const bad = copy(backup); bad.data.lureVisualProfiles[0].appearance.regions.front.pattern = 'unknown'
  await assert.rejects(importBackup(file(bad)))
})

for (const version of [1, 2, 3, 4, 5, 6, 7]) test(`legacy v${version} restores with visual values retained and every local reference detached`, async () => {
  await saveVisualProfile(profile()); await saveTemporaryColor(temporary())
  const source = rc30Fixture(); source.version = version
  if (version < 7) for (const n of schema.weatherTableNames) delete source.data[n]
  if (version < 6) {
    for (const n of ['facilities', 'zones', 'appMetadata']) delete source.data[n]
    for (const t of source.data.trips) delete t.facilityId
  }
  if (version < 5) delete source.data.fishSpecies
  if (version < 4) for (const n of schema.tackleTableNames) delete source.data[n]
  if (version < 3) {
    for (const c of source.data.catches) delete c.lureVariantId
    for (const l of source.data.myLures) delete l.ownershipStatus
  }
  if (version === 1) delete source.data.tripEvents
  source.data.lureVariants[0].colorName = '同じIDの別カラー'
  await importBackup(file(source))
  const p = profile(); delete p.variantId
  const t = temporary(); delete t.modelId; delete t.linkedVariantId
  assert.deepEqual(await db.lureVisualProfiles.toArray(), [p]); assert.deepEqual(await db.temporaryLureColors.toArray(), [t])
  assert.equal((await db.lureVariants.get(386)).colorName, '同じIDの別カラー')
  const backup = await createBackup(); assert.equal(backup.version, 8)
  await importBackup(file(backup)); assert.deepEqual(await db.lureVisualProfiles.toArray(), [p])
})

test('v8 rejects duplicates, dangling IDs, wrong natural keys and malformed state before writing', async () => {
  await saveVisualProfile(profile()); await saveTemporaryColor(temporary())
  const backup = json(await createBackup()), before = await state()
  for (const edit of [
    b => b.data.lureVisualProfiles.push(copy(b.data.lureVisualProfiles[0])),
    b => b.data.temporaryLureColors.push(copy(b.data.temporaryLureColors[0])),
    b => b.data.lureVisualProfiles[0].variantId = 999,
    b => b.data.lureVisualProfiles[0].naturalKey = 'wrong',
    b => b.data.lureVisualProfiles[0].identity.model = 'another model',
    b => b.data.temporaryLureColors[0].modelId = 999,
    b => b.data.temporaryLureColors[0].linkedVariantId = 999,
    b => b.data.lureVisualProfiles[0].id = 'not-a-uuid',
    b => b.data.lureVisualProfiles[0].updatedAt = 'yesterday',
    b => b.data.lureVisualProfiles[0].userEdited = false,
    b => b.data.lureVisualProfiles[0].appearance.regions.front.colors.push('invalid'),
    b => b.data.lureVisualProfiles.push({ ...copy(b.data.lureVisualProfiles[0]), id: '00000000-0000-4000-8000-000000000003' }),
    b => delete b.data.temporaryLureColors,
    b => b.version = 7,
  ]) {
    const bad = copy(backup); edit(bad); await assert.rejects(importBackup(file(bad))); assert.deepEqual(await state(), before)
  }
})

test('storage rejects bad references and duplicate variant/natural key without changing any table', async () => {
  const before = await state()
  await assert.rejects(saveVisualProfile({ ...profile(), variantId: 999 }))
  await assert.rejects(saveTemporaryColor({ ...temporary(), modelId: 999 }))
  assert.deepEqual(await state(), before)
  await saveVisualProfile(profile())
  const saved = await state()
  await assert.rejects(saveVisualProfile({ ...profile(), id: '00000000-0000-4000-8000-000000000003' }))
  assert.deepEqual(await state(), saved)
})

test('v8 restore and legacy detachment roll back all tables after a mid-write failure', async () => {
  await saveVisualProfile(profile()); await saveTemporaryColor(temporary())
  const before = await state(), v8 = json(await createBackup())
  const fail = () => { throw new Error('synthetic write failure') }
  for (const source of [v8, rc30Fixture()]) {
    db.catches.hook('creating', fail)
    try { await assert.rejects(importBackup(file(source)), /synthetic write failure/) }
    finally { db.catches.hook('creating').unsubscribe(fail) }
    assert.deepEqual(await state(), before)
  }
})

test('Phase 3 representative edits require identity and revision, protect inference, and leave every historical row unchanged', async () => {
  const before = await state()
  await saveRepresentative(386, identity(), appearance())
  const [p] = await readVisualProfiles()
  assert.equal(p.userEdited, true); assert.equal(p.confirmed, true)
  const a = appearance(); a.regions.front.colors = ['blue']
  await assert.rejects(saveRepresentative(386, identity(), a))
  await assert.rejects(saveRepresentative(386, identity(), a, { id: p.id, revision: 0 }))
  await saveRepresentative(386, identity(), a, { id: p.id, revision: p.revision })
  assert.equal(await saveVisualProfile({ ...p, revision: 3, origin: 'photo', userEdited: false, confirmed: false }, 2), 'protected')
  for (const [table, rows] of Object.entries(before)) if (!schema.visualTableNames.includes(table)) assert.deepEqual(await db.table(table).toArray(), rows)
  const backup = await createBackup(); await importBackup(file(backup))
  assert.deepEqual((await readVisualProfiles())[0].appearance, a)
})

test('Phase 3 ambiguous natural keys and wrong ID/identity are rejected without writes', async () => {
  const before = await state()
  await assert.rejects(saveRepresentative(999, identity(), appearance()))
  await assert.rejects(saveRepresentative(386, { ...identity(), model: 'wrong' }, appearance()))
  assert.deepEqual(await state(), before)
  await db.lureVariants.add({ id: 999, modelId: 144, colorName: 'ハラオリ' })
  const duplicate = await state()
  await assert.rejects(saveRepresentative(386, identity(), appearance()), /複数/)
  assert.deepEqual(await state(), duplicate)
})

test('Phase 3 linking a provisional catch preserves snapshot, ownership and existing representative, stores linked alternative, and round trips', async () => {
  const snap = createVisualSnapshot(appearance(), status())
  await db.catches.add({ id: 99, tripId: 13, caughtAt: new Date('2026-10-31T00:00:00Z'), lureName: '仮', visualColorSnapshot: snap })
  const representative = appearance(); representative.regions.front.colors = ['blue']
  await saveRepresentative(386, identity(), representative)
  const p = (await readVisualProfiles())[0], expected = await db.catches.get(99), before = await state()
  await linkCatchAppearance(expected, 386, identity())
  const linked = await db.catches.get(99)
  assert.equal(linked.lureVariantId, 386); assert.equal(linked.lureName, 'USSA'); assert.equal(linked.lureId, undefined)
  assert.deepEqual(linked.visualColorSnapshot, snap)
  assert.deepEqual((await readVisualProfiles())[0], p)
  const [alternative] = await db.temporaryLureColors.toArray()
  assert.deepEqual(alternative.appearance, snap.appearance); assert.equal(alternative.linkedVariantId, 386)
  for (const [table, rows] of Object.entries(before)) if (!['catches', 'temporaryLureColors'].includes(table)) assert.deepEqual(await db.table(table).toArray(), rows)
  const stateBefore = await state()
  await assert.rejects(linkCatchAppearance(expected, 386, identity()))
  assert.deepEqual(await state(), stateBefore)
  await importBackup(file(await createBackup())); assert.deepEqual(await state(), stateBefore)
})

test('Phase 3 linking creates a missing representative, reconnects detached profiles explicitly, and is atomic on late failure', async () => {
  const snap = createVisualSnapshot(appearance(), status())
  await db.catches.add({ id: 99, tripId: 13, caughtAt: new Date('2026-10-31T00:00:00Z'), visualColorSnapshot: snap })
  const expected = await db.catches.get(99), before = await state()
  const fail = () => { throw new Error('synthetic link failure') }
  db.catches.hook('updating', fail)
  try { await assert.rejects(linkCatchAppearance(expected, 386, identity()), /synthetic link failure/) }
  finally { db.catches.hook('updating').unsubscribe(fail) }
  assert.deepEqual(await state(), before)
  await linkCatchAppearance(expected, 386, identity())
  assert.deepEqual((await readVisualProfiles())[0].appearance, snap.appearance)
  const profile = (await readVisualProfiles())[0]
  await db.lureVisualProfiles.update(profile.id, { variantId: undefined })
  assert.equal((await readVisualProfiles()).length, 0)
  await db.catches.add({ ...expected, id: 100 })
  await linkCatchAppearance(await db.catches.get(100), 386, identity())
  assert.equal((await readVisualProfiles())[0].id, profile.id)
})

test('Phase 3 standalone temporary colors link safely without modifying any historical or owned records', async () => {
  const entry = temporary(); delete entry.linkedVariantId; delete entry.linkedIdentity
  await saveTemporaryColor(entry)
  const before = await state()
  await linkTemporaryAppearance(entry, 386, identity())
  const linked = await db.temporaryLureColors.get(entry.id)
  assert.equal(linked.linkedVariantId, 386); assert.deepEqual(linked.appearance, entry.appearance)
  for (const [table, rows] of Object.entries(before)) if (!schema.visualTableNames.includes(table)) assert.deepEqual(await db.table(table).toArray(), rows)
  await assert.rejects(linkTemporaryAppearance(entry, 386, identity()))
  await importBackup(file(await createBackup()))
  assert.deepEqual(await db.temporaryLureColors.get(entry.id), linked)
})
