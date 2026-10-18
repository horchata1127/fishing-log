import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc20-test-'))
const paths = Object.fromEntries(['database', 'data', 'allowlist', 'rc21', 'rc20'].map(n => [n, join(directory, `${n}.mjs`)]))
for (const [name, source] of [['database', 'db/database.ts'], ['data', 'data/rc20Catalog.ts'], ['allowlist', 'data/rc21Catalog.ts'], ['rc21', 'utils/rc21Catalog.ts'], ['rc20', 'utils/rc20Catalog.ts']]) {
  const code = ts.transpileModule(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
    .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href))
    .replace("'../data/rc20Catalog'", JSON.stringify(pathToFileURL(paths.data).href))
  await writeFile(paths[name], code.replace("'./rc20Catalog'", JSON.stringify(pathToFileURL(paths.data).href)).replace("'../data/rc21Catalog'", JSON.stringify(pathToFileURL(paths.allowlist).href)))
}
const { db } = await import(pathToFileURL(paths.database).href)
const { rc20Catalog } = await import(pathToFileURL(paths.data).href)
const { previewRc20Catalog, applyRc20Catalog, rc20DiffCsv } = await import(pathToFileURL(paths.rc20).href)
const { rc21Catalog } = await import(pathToFileURL(paths.allowlist).href)
const { previewRc21Catalog, applyRc21Catalog, rc21DiffCsv } = await import(pathToFileURL(paths.rc21).href)
const state = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
after(async () => { db.close(); for (const path of Object.values(paths)) await unlink(path); await rmdir(directory) })

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    await db.lureManufacturers.bulkAdd([{ id: 49, name: 'ニュードロワー' }, { id: 62, name: 'ベルベットアーツ' },
      { id: 1, name: '1089工房' }, { id: 71, name: 'ロブルアー' }])
    await db.lureSeries.bulkAdd([{ id: 135, manufacturerId: 49, name: 'HUNT GRANDE' }, { id: 1, manufacturerId: 1, name: 'さかさにょろ' }])
    await db.lureModels.bulkAdd([{ id: 305, seriesId: 135, name: 'HUNT GRANDE 1.3g', weightG: 1.3, category: 'スプーン' },
      { id: 1, seriesId: 1, name: 'さかさにょろ 35FS' }, { id: 2, seriesId: 1, name: 'さかさにょろ 60FS' }])
    await db.lureVariants.bulkAdd([{ id: 1887, modelId: 305, colorName: 'T-15 シルバー（SILVER）' },
      { id: 1888, modelId: 305, colorName: 'T-18 黄茶次郎（KICYAJIRO）' }])
    await db.myLures.bulkAdd([{ id: 3, variantId: 1887, active: true, ownershipStatus: 'owned' },
      { id: 4, variantId: 1888, active: true, ownershipStatus: 'owned' }])
    await db.trips.add({ id: 10, fishingDate: '2026-10-11', fishingAreaName: '合成巾着田', fishingStyle: 'CHUBBING',
      startedAt: new Date('2026-10-11T00:00:00+09:00'), endedAt: new Date('2026-10-11T08:00:00+09:00') })
    for (const id of [11, 12, 13, 14]) await db.catches.add({ id, tripId: 10,
      caughtAt: new Date(`2026-10-11T06:${id === 11 ? '12' : id === 12 ? '14' : id === 13 ? '48' : '53'}:00+09:00`),
      lureId: id === 14 ? 4 : 3, lureVariantId: id === 14 ? 1888 : 1887,
      lureName: 'HUNT GRANDE 1.3g', lureColor: id === 14 ? 'T-18 黄茶次郎（KICYAJIRO）' : 'T-15 シルバー（SILVER）', memo: '履歴保持' })
  })
  await applyRc20Catalog((await previewRc20Catalog()).comparisonToken)
})

test('explicit 18-product allowlist reuses exact frozen per-model palettes: 213 + 69', async () => {
  const pack = JSON.parse(await readFile(new URL('../docs/rc20/RC20_OFFICIAL_CATALOG.json', import.meta.url), 'utf8'))
  assert.equal(rc21Catalog.length, 18)
  for (const t of rc21Catalog) {
    assert.equal(t.productVerified, true)
    assert.deepEqual(t.colors, pack.targets.find(p => p.model === t.model).colors)
  }
  assert.equal(rc21Catalog.filter(t => t.expectedManufacturerId === 62).reduce((n, t) => n + t.colors.length, 0), 213)
  assert.equal(rc21Catalog.filter(t => t.expectedManufacturerId === 71).reduce((n, t) => n + t.colors.length, 0), 69)
})

test('preview is read-only; 282 colors, 18 models, 8 unique series; preserve every existing record, repeat and reopen', async () => {
  const before = await state(), preview = await previewRc21Catalog()
  assert.deepEqual(await state(), before)
  assert.equal(preview.addedColors, 282)
  assert.equal(preview.addedModels, 18)
  assert.equal(preview.addedSeries, 8)
  await applyRc21Catalog(preview.comparisonToken)
  const saved = await state()
  for (const [table, rows] of Object.entries(before)) {
    for (const row of rows) assert.deepEqual(saved[table].find(r => (r.id ?? r.fish_id) === (row.id ?? row.fish_id)), row)
    if (!['lureSeries', 'lureModels', 'lureVariants'].includes(table)) assert.deepEqual(saved[table], rows)
  }
  assert.equal(saved.lureVariants.length - before.lureVariants.length, 282)
  assert.equal(saved.lureSeries.length - before.lureSeries.length, 8)
  for (const target of rc21Catalog) {
    const model = saved.lureModels.find(m => m.name === target.model)
    assert.equal(saved.lureVariants.filter(v => v.modelId === model.id).length, target.colors.length)
  }
  const again = await previewRc21Catalog()
  assert.equal(again.addedColors, 0)
  await applyRc21Catalog(again.comparisonToken)
  assert.deepEqual(await state(), saved)
  db.close(); await db.open()
  assert.equal(db.verno, 8)
  assert.deepEqual(await state(), saved)
  assert.equal((await previewRc20Catalog()).addedColors, 0)
})

test('existing alias model and color retain IDs; another weight receives its own palette', async () => {
  await db.lureSeries.add({ id: 500, manufacturerId: 62, name: 'FORTE' })
  await db.lureModels.add({ id: 500, seriesId: 500, name: 'FORTE 0.9g', weightG: 0.9 })
  await db.lureVariants.add({ id: 5000, modelId: 500, colorName: '4 フリッカーゴールド' })
  const p = await previewRc21Catalog()
  assert.equal(p.addedColors, 281)
  assert.equal(p.addedModels, 17)
  assert.equal(p.addedSeries, 7)
  assert.ok(rc21DiffCsv(p).includes('"62","500","500"'))
  await applyRc21Catalog(p.comparisonToken)
  assert.equal(await db.lureVariants.where('modelId').equals(500).count(), 25)
  assert.equal((await db.lureVariants.get(5000)).colorName, '4 フリッカーゴールド')
})

for (const conflict of ['manufacturer', 'id', 'series', 'model', 'weight', 'missing-weight', 'wrong-series', 'color']) {
  test(`hold ${conflict} without writing the affected product`, async () => {
    await db.lureSeries.add({ id: 500, manufacturerId: 62, name: 'FORTE' })
    await db.lureModels.add({ id: 500, seriesId: 500, name: 'FORTE 0.9g', weightG: 0.9 })
    if (conflict === 'manufacturer') await db.lureManufacturers.add({ name: 'VELVET ARTS' })
    if (conflict === 'id') { await db.lureManufacturers.delete(62); await db.lureManufacturers.add({ id: 99, name: 'ベルベットアーツ' }) }
    if (conflict === 'series') await db.lureSeries.add({ manufacturerId: 62, name: 'フォルテ' })
    if (conflict === 'model') await db.lureModels.add({ seriesId: 500, name: 'フォルテ 0.9g', weightG: 0.9 })
    if (conflict === 'weight') await db.lureModels.update(500, { weightG: 1.8 })
    if (conflict === 'missing-weight') await db.lureModels.update(500, { weightG: undefined })
    if (conflict === 'wrong-series') { await db.lureSeries.add({ id: 501, manufacturerId: 62, name: '別シリーズ' }); await db.lureModels.update(500, { seriesId: 501 }) }
    if (conflict === 'color') await db.lureVariants.bulkAdd([{ modelId: 500, colorName: '4 フリッカーゴールド' }, { modelId: 500, colorName: 'フリッカーゴールド' }])
    const before = await state(), p = await previewRc21Catalog()
    assert.deepEqual(await state(), before)
    const rows = p.rows.filter(r => r.model === 'フォルテ 0.9g')
    assert.ok(rows.every(r => r.action === 'hold_conflict' && r.hold_reason))
    await applyRc21Catalog(p.comparisonToken)
    assert.deepEqual(await db.lureVariants.where('modelId').equals(500).toArray(), before.lureVariants.filter(v => v.modelId === 500))
  })
}

test('missing manufacturer remains held, never created', async () => {
  await db.lureManufacturers.delete(62)
  const p = await previewRc21Catalog()
  assert.equal(p.pendingColors, 213)
  assert.equal(p.addedColors, 69)
  await applyRc21Catalog(p.comparisonToken)
  assert.equal(await db.lureManufacturers.get(62), undefined)
})

test('unverified product flag blocks additions even if model creation is allowed', async () => {
  const target = rc21Catalog[0]
  target.productVerified = false
  try {
    const p = await previewRc21Catalog()
    assert.equal(p.pendingColors, 21)
    assert.ok(p.rows.filter(r => r.model === target.model).every(r => r.action === 'hold_unverified'))
    await applyRc21Catalog(p.comparisonToken)
    assert.equal(await db.lureModels.where('name').equals(target.model).count(), 0)
  } finally { target.productVerified = true }
})

test('failure after multiple new models and series rolls back all tables', async () => {
  const before = await state(), p = await previewRc21Catalog()
  let n = 0
  const fail = () => { if (++n === 80) throw new Error('injected RC21 failure') }
  db.lureVariants.hook('creating', fail)
  try { await assert.rejects(applyRc21Catalog(p.comparisonToken), /injected/) }
  finally { db.lureVariants.hook('creating').unsubscribe(fail) }
  assert.deepEqual(await state(), before)
})

test('concurrent apply serializes; stale preview cannot duplicate any hierarchy', async () => {
  const p = await previewRc21Catalog()
  const results = await Promise.allSettled([applyRc21Catalog(p.comparisonToken), applyRc21Catalog(p.comparisonToken)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.match(results.find(r => r.status === 'rejected').reason.message, /もう一度/)
  assert.equal((await previewRc21Catalog()).addedColors, 0)
  assert.equal(await db.lureSeries.count(), 10)
})

test('synthetic iPhone acceptance counts: 1936 -> 2218, 135 -> 143, 305 -> 323; all old rows identical', async () => {
  const pad = async (table, total, make) => {
    const ids = new Set((await table.toArray()).map(r => r.id))
    const additions = []
    for (let id = 1; ids.size + additions.length < total; id++) {
      if (!ids.has(id)) additions.push({ ...make(id), id })
    }
    await table.bulkAdd(additions)
  }
  await pad(db.lureManufacturers, 80, id => ({ name: `synthetic maker ${id}` }))
  await pad(db.lureSeries, 135, id => ({ manufacturerId: 1, name: `synthetic series ${id}` }))
  await pad(db.lureModels, 305, id => ({ seriesId: 1, name: `synthetic model ${id}` }))
  await pad(db.lureVariants, 1936, id => ({ modelId: 1, colorName: `synthetic color ${id}` }))
  const trip = await db.trips.get(10), catchRow = await db.catches.get(11)
  await pad(db.trips, 5, () => ({ ...trip, id: undefined }))
  await pad(db.catches, 7, () => ({ ...catchRow, id: undefined }))
  await pad(db.myLures, 4, () => ({ variantId: 1887, active: true, ownershipStatus: 'owned' }))
  await db.fishSpecies.add({ fish_id: 'synthetic-fish', display_name: 'synthetic fish', group: 'test', active: true, origin: 'user', aliases: '', region: '', lineage_or_type: '', source_status: '', notes: '', source_url: '' })
  const before = await state()
  await applyRc21Catalog((await previewRc21Catalog()).comparisonToken)
  const saved = await state()
  assert.equal(saved.lureVariants.length, 2218)
  assert.equal(saved.lureSeries.length, 143)
  assert.equal(saved.lureModels.length, 323)
  assert.equal(saved.lureManufacturers.length, 80)
  assert.equal(saved.trips.length, 5)
  assert.equal(saved.catches.length, 7)
  assert.equal(saved.myLures.length, 4)
  for (const [table, rows] of Object.entries(before)) {
    for (const row of rows) assert.deepEqual(saved[table].find(r => (r.id ?? r.fish_id) === (row.id ?? row.fish_id)), row)
    if (!['lureSeries', 'lureModels', 'lureVariants'].includes(table)) assert.deepEqual(saved[table], rows)
  }
})
