import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc20-test-'))
const paths = Object.fromEntries(['database', 'data', 'rc20'].map(n => [n, join(directory, `${n}.mjs`)]))
for (const [name, source] of [['database', 'db/database.ts'], ['data', 'data/rc20Catalog.ts'], ['rc20', 'utils/rc20Catalog.ts']]) {
  const code = ts.transpileModule(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
    .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href))
    .replace("'../data/rc20Catalog'", JSON.stringify(pathToFileURL(paths.data).href))
  await writeFile(paths[name], code)
}
const { db } = await import(pathToFileURL(paths.database).href)
const { rc20Catalog } = await import(pathToFileURL(paths.data).href)
const { previewRc20Catalog, applyRc20Catalog, rc20DiffCsv } = await import(pathToFileURL(paths.rc20).href)
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
})

test('frozen JSON and application pack agree; exact 30 HUNT codes, per-model palettes and only verified targets', async () => {
  const pack = JSON.parse(await readFile(new URL('../docs/rc20/RC20_OFFICIAL_CATALOG.json', import.meta.url), 'utf8'))
  assert.deepEqual(pack.targets, rc20Catalog)
  assert.deepEqual(rc20Catalog[0].colors.map(c => c.code), Array.from({ length: 30 }, (_, i) => `T-${i + 1}`))
  const csv = await readFile(new URL('../docs/rc20/HUNT_GRANDE_13G_OFFICIAL_COLORS.csv', import.meta.url), 'utf8')
  const sourceColors = csv.trim().split(/\r?\n/).slice(1).map(line => line.split(','))
  assert.deepEqual(sourceColors.map(([code, name, english, url]) => ({ code, name,
    label: `${code} ${name}（${english}）`, aliases: [name, english], sourceUrl: url })), rc20Catalog[0].colors)
  assert.equal(rc20Catalog.reduce((n, t) => n + t.colors.length, 0), 332)
  for (const t of rc20Catalog) {
    assert.equal(new Set(t.colors.map(c => c.label)).size, t.colors.length)
    assert.ok(t.colors.every(c => c.sourceUrl.startsWith('https://')))
    assert.equal(t.allowNewModel, t.model === 'HUNT GRANDE 1.3g')
    assert.ok(!/30S|70XS|パペット/.test(t.model))
  }
  const forte06 = rc20Catalog.find(t => t.model === 'フォルテ 0.6g')
  const forte21 = rc20Catalog.find(t => t.model === 'フォルテ 2.1g')
  assert.notDeepEqual(forte06.colors.map(c => c.code), forte21.colors.map(c => c.code))
})

test('preview/cancel is read-only; first apply adds 28 HUNT colors, preserves every old row and adds no ownership', async () => {
  const before = await state()
  const preview = await previewRc20Catalog()
  assert.deepEqual(await state(), before)
  assert.equal(preview.addedColors, 48)
  assert.equal(preview.retainedColors, 2)
  assert.equal(preview.pendingColors, 282)
  assert.equal(preview.addedModels, 0)
  await applyRc20Catalog(preview.comparisonToken)
  const after = await state()
  for (const [table, rows] of Object.entries(before)) {
    for (const row of rows) assert.deepEqual(after[table].find(r => (r.id ?? r.fish_id) === (row.id ?? row.fish_id)), row)
    if (table !== 'lureVariants') assert.deepEqual(after[table], rows)
  }
  assert.equal((await db.lureVariants.where('modelId').equals(305).toArray()).length, 30)
  assert.equal(db.verno, 9)
  const again = await previewRc20Catalog()
  assert.equal(again.addedColors, 0)
  await applyRc20Catalog(again.comparisonToken)
  assert.deepEqual(await state(), after)
  db.close(); await db.open()
  assert.deepEqual(await state(), after)
})

test('missing HUNT hierarchy may be added under existing manufacturer; other missing models and manufacturers remain pending', async () => {
  await db.catches.clear(); await db.myLures.clear(); await db.lureVariants.clear()
  await db.lureModels.delete(305); await db.lureSeries.delete(135); await db.lureManufacturers.delete(62)
  const preview = await previewRc20Catalog()
  assert.equal(preview.addedModels, 1)
  assert.equal(preview.addedSeries, 1)
  assert.ok(preview.rows.some(r => r.action === 'hold_missing_manufacturer'))
  await applyRc20Catalog(preview.comparisonToken)
  assert.equal(await db.lureManufacturers.count(), 3)
  assert.equal(await db.lureModels.count(), 3)
  assert.equal(await db.myLures.count(), 0)
})

test('other brands add only colors of exact existing models; SMITH collaboration is not merged', async () => {
  await db.lureSeries.bulkAdd([{ id: 200, manufacturerId: 62, name: 'FORTE' }, { id: 201, manufacturerId: 71, name: 'チェルシー' }])
  await db.lureModels.bulkAdd([{ id: 400, seriesId: 200, name: 'FORTE 0.9g', weightG: 0.9 },
    { id: 401, seriesId: 201, name: 'チェルシー SS', weightG: 1.8 }])
  await db.lureVariants.add({ id: 3000, modelId: 400, colorName: '4 フリッカーゴールド' })
  const preview = await previewRc20Catalog()
  await applyRc20Catalog(preview.comparisonToken)
  assert.equal((await db.lureVariants.get(3000)).colorName, '4 フリッカーゴールド')
  assert.equal(await db.lureVariants.where('modelId').equals(400).count(), 25)
  assert.equal(await db.lureVariants.where('modelId').equals(401).count(), 9)
  assert.equal(await db.lureModels.count(), 5)
})

for (const ambiguity of ['manufacturer', 'series', 'model', 'color', 'wrong-series', 'weight']) {
  test(`reject ${ambiguity} ambiguity without writes`, async () => {
    if (ambiguity === 'manufacturer') await db.lureManufacturers.add({ name: 'New Drawer' })
    if (ambiguity === 'series') await db.lureSeries.add({ manufacturerId: 49, name: 'ハントグランデ' })
    if (ambiguity === 'model') await db.lureModels.add({ seriesId: 135, name: 'ハントグランデ1.3g' })
    if (ambiguity === 'color') await db.lureVariants.add({ modelId: 305, colorName: 'Silver' })
    if (ambiguity === 'wrong-series') { await db.lureSeries.add({ id: 200, manufacturerId: 49, name: 'HUNT' }); await db.lureModels.update(305, { seriesId: 200 }) }
    if (ambiguity === 'weight') await db.lureModels.update(305, { weightG: 1 })
    const before = await state()
    await assert.rejects(previewRc20Catalog())
    assert.deepEqual(await state(), before)
  })
}

test('partial write failure rolls back every addition', async () => {
  const before = await state(), preview = await previewRc20Catalog()
  let count = 0
  const fail = () => { if (++count === 20) throw new Error('injected RC20 failure') }
  db.lureVariants.hook('creating', fail)
  try { await assert.rejects(applyRc20Catalog(preview.comparisonToken), /injected/) }
  finally { db.lureVariants.hook('creating').unsubscribe(fail) }
  assert.deepEqual(await state(), before)
})

test('stale previews and concurrent double apply cannot duplicate colors', async () => {
  const preview = await previewRc20Catalog()
  const results = await Promise.allSettled([applyRc20Catalog(preview.comparisonToken), applyRc20Catalog(preview.comparisonToken)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.match(results.find(r => r.status === 'rejected').reason.message, /もう一度/)
  assert.equal(await db.lureVariants.where('modelId').equals(305).count(), 30)
})

test('device diff export has actual historical IDs and source URLs', async () => {
  const csv = rc20DiffCsv(await previewRc20Catalog())
  assert.ok(csv.startsWith('\uFEFFmanufacturer,series,model'))
  assert.ok(csv.includes('"1887","keep"'))
  assert.ok(csv.includes('"1888","keep"'))
  assert.ok(csv.includes('https://zenmaru-group.co.jp/newdrawer/'))
})

test('code formatting differences preserve IDs and T-1 never matches T-15', async () => {
  await db.lureVariants.update(1887, { colorName: 'Ｔ１５シルバー' })
  await db.lureVariants.update(1888, { colorName: 'T-018黄茶次郎' })
  const preview = await previewRc20Catalog()
  assert.equal(preview.retainedColors, 2)
  assert.equal(preview.rows.find(r => r.color_code === 'T-1').action, 'add_color')
  assert.equal(preview.rows.find(r => r.color_code === 'T-15').existing_id, 1887)
  await applyRc20Catalog(preview.comparisonToken)
  assert.equal((await db.lureVariants.get(1887)).colorName, 'Ｔ１５シルバー')
  assert.equal(await db.lureVariants.where('modelId').equals(305).count(), 30)
})
