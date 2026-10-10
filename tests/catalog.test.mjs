import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// 合成カタログだけをプロセス内DBへ反映する。実ブラウザDBには接続しない。
const directory = await mkdtemp(join(tmpdir(), 'fishing-log-catalog-test-'))
const databaseFile = join(directory, 'database.mjs')
const catalogFile = join(directory, 'catalog.mjs')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
await writeFile(databaseFile, compile(await readFile(new URL('../src/db/database.ts', import.meta.url), 'utf8'))
  .replace("'dexie'", JSON.stringify(import.meta.resolve('dexie'))))
await writeFile(catalogFile, compile(await readFile(new URL('../src/importLureCatalog.ts', import.meta.url), 'utf8'))
  .replace("'./db/database'", JSON.stringify(pathToFileURL(databaseFile).href)))
const { db } = await import(pathToFileURL(databaseFile).href)
const { catalogTables, previewLureCatalog, importLureCatalog } = await import(pathToFileURL(catalogFile).href)

after(async () => {
  db.close()
  await unlink(databaseFile)
  await unlink(catalogFile)
  await rmdir(directory)
})

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    await db.lureManufacturers.add({ id: 701, name: 'Synthetic maker' })
    await db.lureSeries.add({ id: 702, manufacturerId: 701, name: 'Synthetic series' })
    await db.lureModels.add({ id: 703, seriesId: 702, name: 'Synthetic model', category: 'その他', weightG: 9 })
    await db.lureVariants.add({ id: 704, modelId: 703, colorName: 'Synthetic color' })
    await db.myLures.bulkAdd([{ id: 705, variantId: 704, active: true, memo: 'Keep' },
      { id: 706, variantId: 704, active: false }])
    await db.trips.add({ id: 707, fishingAreaName: 'Synthetic lake', fishingDate: '2026-10-10',
      fishingStyle: 'AREA_TROUT', startedAt: new Date('2026-10-10T00:00:00Z') })
    await db.catches.add({ id: 708, tripId: 707, lureId: 705, caughtAt: new Date('2026-10-10T01:00:00Z') })
    await db.tripEvents.add({ id: 709, tripId: 707, type: 'pellet', occurredAt: new Date('2026-10-10T02:00:00Z') })
  })
})

function seed() {
  return { format: 'fishing-log-catalog-seed', version: 1, catalogVersion: '1.0-rc18', data: {
    lureManufacturers: [{ id: 1, name: 'Synthetic maker' }],
    lureSeries: [{ id: 2, manufacturerId: 1, name: 'Synthetic series' }],
    lureModels: [{ id: 3, seriesId: 2, name: 'Synthetic model', category: 'スプーン', weightG: 1.5 }],
    lureVariants: [{ id: 4, modelId: 3, colorName: 'Synthetic color' }, { id: 5, modelId: 3, colorName: 'New color' }],
    ownedLures: [{ variantId: 4, quantity: 100, active: false }, { variantId: 5, quantity: 100 }],
  } }
}

async function snapshot(names = db.tables.map(table => table.name)) {
  return JSON.stringify(await Promise.all(names.map(async name => [name, await db.table(name).orderBy('id').toArray()])))
}
const protectedTables = ['myLures', 'trips', 'catches', 'tripEvents']

test('preview is read-only and reports additions, category update, unchanged rows and ignored ownership', async () => {
  const before = await snapshot()
  const preview = await previewLureCatalog(seed())
  assert.deepEqual(preview.counts.lureModels, { added: 0, updated: 1, unchanged: 0 })
  assert.deepEqual(preview.counts.lureVariants, { added: 1, updated: 0, unchanged: 1 })
  assert.equal(preview.ignoredOwnership, true)
  assert.equal(preview.ignoredOwnershipRows, 2)
  assert.deepEqual(preview.errors, [])
  assert.equal(await snapshot(), before)
})

test('import and reimport never alter ownership, catches, trips or events; existing catalog IDs remain', async () => {
  const before = await snapshot(protectedTables)
  const preview = await previewLureCatalog(seed())
  const result = await importLureCatalog(seed(), preview.comparisonToken)
  assert.equal(result.counts.lureVariants.added, 1)
  assert.equal(await snapshot(protectedTables), before)
  assert.equal((await db.lureModels.get(703)).weightG, 9)
  assert.equal((await db.lureModels.get(703)).category, 'スプーン')
  assert.equal((await db.lureVariants.get(704)).modelId, 703)
  const catalog = await snapshot(catalogTables)
  const repeat = await importLureCatalog(seed())
  assert.ok(catalogTables.every(table => repeat.counts[table].added === 0 && repeat.counts[table].updated === 0))
  assert.equal(await snapshot(catalogTables), catalog)
  assert.equal(await snapshot(protectedTables), before)
})

test('ownership field is ignored even when malformed or references nonexistent colors', async () => {
  const before = await snapshot(protectedTables)
  for (const ownership of [null, 'not an array', [{ variantId: -1, quantity: -999 }]]) {
    const input = seed()
    input.data.ownedLures = ownership
    const preview = await previewLureCatalog(input)
    assert.equal(preview.ignoredOwnership, true)
    assert.deepEqual(preview.errors, [])
    await importLureCatalog(input)
  }
  assert.equal(await snapshot(protectedTables), before)
})

test('empty process-local DB imports synthetic catalog only, even with old ownership data', async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
  const input = seed()
  await importLureCatalog(input)
  await importLureCatalog(input)
  assert.equal(await db.myLures.count(), 0)
  assert.equal(await db.catches.count(), 0)
  assert.equal(await db.lureModels.count(), 1)
  assert.equal(await db.lureVariants.count(), 2)
})

test('write transaction includes exactly the four catalog tables', async () => {
  let checked = false
  const inspect = (_key, _row, transaction) => {
    assert.deepEqual([...transaction.storeNames].sort(), [...catalogTables].sort())
    checked = true
  }
  db.lureVariants.hook('creating', inspect)
  try {
    await importLureCatalog(seed())
  } finally {
    db.lureVariants.hook('creating').unsubscribe(inspect)
  }
  assert.equal(checked, true)
})

test('normalized color collisions retain distinct original spellings and IDs on repeated imports', async () => {
  const input = seed()
  input.data.lureVariants.push({ id: 6, modelId: 3, colorName: 'Color II' }, { id: 7, modelId: 3, colorName: 'Color ＩＩ' })
  const checked = await previewLureCatalog(input)
  assert.equal(checked.collisions.length, 1)
  assert.deepEqual(checked.errors, [])
  await importLureCatalog(input, checked.comparisonToken)
  const rows = await db.lureVariants.toArray()
  const ascii = rows.find(row => row.colorName === 'Color II')
  const full = rows.find(row => row.colorName === 'Color ＩＩ')
  assert.notEqual(ascii.id, full.id)
  const before = await snapshot()
  await importLureCatalog(input)
  assert.equal(await snapshot(), before)
})

test('collision with existing spelling adds a separate record and does not rename the existing ID', async () => {
  const input = seed()
  input.data.lureVariants[0].colorName = 'Ｓｙｎｔｈｅｔｉｃ color'
  const checked = await previewLureCatalog(input)
  assert.equal(checked.collisions.length, 1)
  await importLureCatalog(input)
  assert.equal((await db.lureVariants.get(704)).colorName, 'Synthetic color')
  assert.ok((await db.lureVariants.toArray()).some(row => row.colorName === 'Ｓｙｎｔｈｅｔｉｃ color' && row.id !== 704))
})

test('new hierarchy maps seed IDs to local IDs without affecting existing parent references', async () => {
  const input = seed()
  input.data.lureManufacturers[0].name = 'New maker'
  const before = await snapshot(protectedTables)
  await importLureCatalog(input)
  const maker = await db.lureManufacturers.where('name').equals('New maker').first()
  assert.notEqual(maker.id, 1)
  const series = await db.lureSeries.where('manufacturerId').equals(maker.id).first()
  const model = await db.lureModels.where('seriesId').equals(series.id).first()
  const colors = await db.lureVariants.where('modelId').equals(model.id).toArray()
  assert.equal(colors.length, 2)
  assert.equal((await db.lureSeries.get(702)).manufacturerId, 701)
  assert.equal(await snapshot(protectedTables), before)
})

test('stale preview refuses all writes after another catalog edit', async () => {
  const input = seed()
  const checked = await previewLureCatalog(input)
  await db.lureVariants.add({ modelId: 703, colorName: 'Concurrent edit' })
  const before = await snapshot()
  await assert.rejects(importLureCatalog(input, checked.comparisonToken), /事前確認後/)
  assert.equal(await snapshot(), before)
})

test('write failure rolls back category updates and preceding catalog inserts', async () => {
  const before = await snapshot()
  const input = seed()
  input.data.lureManufacturers.push({ id: 10, name: 'Rollback maker' })
  input.data.lureSeries.push({ id: 11, manufacturerId: 10, name: 'Rollback series' })
  input.data.lureModels.push({ id: 12, seriesId: 11, name: 'Rollback model' })
  const fail = () => { throw new Error('injected catalog failure') }
  db.lureVariants.hook('creating', fail)
  try {
    await assert.rejects(importLureCatalog(input), /injected catalog failure/)
  } finally {
    db.lureVariants.hook('creating').unsubscribe(fail)
  }
  assert.equal(await snapshot(), before)
})

test('concurrent synthetic imports do not duplicate catalog rows or change ownership', async () => {
  const before = await snapshot(protectedTables)
  await Promise.all([importLureCatalog(seed()), importLureCatalog(seed())])
  assert.equal(await db.lureVariants.count(), 2)
  assert.equal(await snapshot(protectedTables), before)
})

test('ambiguous exact existing names block import instead of selecting an arbitrary ID', async () => {
  await db.lureVariants.add({ modelId: 703, colorName: 'Synthetic color' })
  const before = await snapshot()
  const checked = await previewLureCatalog(seed())
  assert.equal(checked.duplicates.length, 1)
  assert.ok(checked.errors.length > 0)
  await assert.rejects(importLureCatalog(seed()))
  assert.equal(await snapshot(), before)
})

const invalid = [
  ['null root', () => null],
  ['unsupported version', s => { s.version = 2; return s }],
  ['missing array', s => { delete s.data.lureVariants; return s }],
  ['invalid row', s => { s.data.lureModels[0] = null; return s }],
  ['duplicate ID', s => { s.data.lureVariants[1].id = 4; return s }],
  ['invalid name', s => { s.data.lureVariants[0].colorName = 123; return s }],
  ['invalid parent', s => { s.data.lureSeries[0].manufacturerId = 999; return s }],
  ['invalid model parent', s => { s.data.lureModels[0].seriesId = 999; return s }],
  ['invalid color parent', s => { s.data.lureVariants[0].modelId = 999; return s }],
  ['invalid category', s => { s.data.lureModels[0].category = 'invalid'; return s }],
  ['negative weight', s => { s.data.lureModels[0].weightG = -1; return s }],
  ['duplicate exact name', s => { s.data.lureVariants[1].colorName = 'Synthetic color'; return s }],
]
for (const [name, change] of invalid) {
  test(`invalid catalog ${name} is reported in preview and rejected without writes`, async () => {
    const input = change(seed())
    const before = await snapshot()
    const checked = await previewLureCatalog(input)
    assert.ok(checked.errors.length > 0)
    await assert.rejects(importLureCatalog(input))
    assert.equal(await snapshot(), before)
  })
}

test('latest reference JSON is previewed only: 304 models, 1886 separate colors and a collision warning', async () => {
  const reference = JSON.parse(await readFile(new URL('../docs/catalog-handoff/fishing_log_catalog_1886_only.json', import.meta.url), 'utf8'))
  const before = await snapshot()
  const checked = await previewLureCatalog(reference)
  assert.deepEqual(checked.errors, [])
  assert.equal(checked.counts.lureModels.added, 304)
  assert.equal(checked.counts.lureVariants.added, 1886)
  assert.equal(checked.collisions.length, 1)
  assert.equal(checked.ignoredOwnership, false)
  assert.equal(await snapshot(), before)
})
