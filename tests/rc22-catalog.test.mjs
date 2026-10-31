import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc20-test-'))
const paths = Object.fromEntries(['database', 'data', 'allowlist', 'rc21', 'rc20', 'rc22data', 'rc22'].map(n => [n, join(directory, `${n}.mjs`)]))
for (const [name, source] of [['database', 'db/database.ts'], ['data', 'data/rc20Catalog.ts'], ['allowlist', 'data/rc21Catalog.ts'], ['rc21', 'utils/rc21Catalog.ts'], ['rc20', 'utils/rc20Catalog.ts'], ['rc22data', 'data/rc22Catalog.ts'], ['rc22', 'utils/rc22Catalog.ts']]) {
  const code = ts.transpileModule(await readFile(new URL(`../src/${source}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
    .replace("'../db/database'", JSON.stringify(pathToFileURL(paths.database).href))
    .replace("'../data/rc20Catalog'", JSON.stringify(pathToFileURL(paths.data).href))
  await writeFile(paths[name], code.replace("'./rc20Catalog'", JSON.stringify(pathToFileURL(paths.data).href)).replace("'../data/rc21Catalog'", JSON.stringify(pathToFileURL(paths.allowlist).href)).replace("'../data/rc22Catalog'", JSON.stringify(pathToFileURL(paths.rc22data).href)))
}
const { db } = await import(pathToFileURL(paths.database).href)
const { rc20Catalog } = await import(pathToFileURL(paths.data).href)
const { previewRc20Catalog, applyRc20Catalog, rc20DiffCsv } = await import(pathToFileURL(paths.rc20).href)
const { rc21Catalog } = await import(pathToFileURL(paths.allowlist).href)
const { previewRc21Catalog, applyRc21Catalog, rc21DiffCsv } = await import(pathToFileURL(paths.rc21).href)
const { rc22Catalog } = await import(pathToFileURL(paths.rc22data).href)
const { previewRc22Catalog, applyRc22Catalog, rc22DiffCsv } = await import(pathToFileURL(paths.rc22).href)
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
  await applyRc21Catalog((await previewRc21Catalog()).comparisonToken)
})

test('independent frozen pack: nine products, exact official captions and per-model retailer evidence', async () => {
  const pack = JSON.parse(await readFile(new URL('../docs/rc22/RC22_CATALOG.json', import.meta.url), 'utf8'))
  assert.deepEqual(pack.targets, rc22Catalog)
  assert.equal(pack.officialListedCount, 61)
  assert.equal(pack.officialNamedCount, 35)
  assert.equal(rc22Catalog.length, 9)
  assert.equal(rc22Catalog.reduce((n,t) => n + t.colors.filter(c => c.sourceTier === 'manufacturer').length, 0), 35)
  assert.equal(rc22Catalog.reduce((n,t) => n + t.colors.filter(c => c.verified && t.productVerified).length, 0), 89)
  const evidence = JSON.parse(await readFile(new URL('../docs/rc22/RC22_RETAILER_EVIDENCE.json', import.meta.url), 'utf8')).rows
  for (const t of rc22Catalog) for (const c of t.colors) {
    if (c.jan) {
      const item = evidence.find(r => r.jan === c.jan)
      assert.ok(item)
      assert.equal(item.model, t.modelAliases[0])
      assert.ok(item.detail.includes(c.name.normalize('NFKC')) || c.name.normalize('NFKC') === 'が〜こちゃん')
    }
  }
  const heroes = rc22Catalog.flatMap(t => t.colors.filter(c => c.colorClass === 'heroes'))
  assert.equal(heroes.length, 6)
  assert.equal(new Set(heroes.map(c => c.jan)).size, 6)
  assert.ok(rc22Catalog.every(t => t.colors.every(c => c.colorClass !== '1091')))
})

test('read-only preview, 89 colors/8 models/4 series, all records unchanged, repeat, RC20/21 repeat and reopen', async () => {
  const before = await state(), p = await previewRc22Catalog()
  assert.deepEqual(await state(), before)
  assert.equal(p.addedColors, 89); assert.equal(p.addedModels, 8); assert.equal(p.addedSeries, 4)
  assert.equal(p.pendingColors, 11)
  assert.equal(p.rows.filter(r => r.kind === 'model').length, 9)
  await applyRc22Catalog(p.comparisonToken)
  const saved = await state()
  for (const [table, rows] of Object.entries(before)) {
    for (const row of rows) assert.deepEqual(saved[table].find(r => (r.id ?? r.fish_id) === (row.id ?? row.fish_id)), row)
    if (!['lureSeries','lureModels','lureVariants'].includes(table)) assert.deepEqual(saved[table],rows)
  }
  const again = await previewRc22Catalog()
  assert.equal(again.addedColors, 0); assert.equal(again.retainedColors, 89); assert.equal(again.pendingColors, 11)
  await applyRc22Catalog(again.comparisonToken)
  assert.deepEqual(await state(),saved)
  assert.equal((await previewRc20Catalog()).addedColors,0)
  assert.equal((await previewRc21Catalog()).addedColors,0)
  db.close(); await db.open(); assert.equal(db.verno, 9)
  assert.deepEqual(await state(),saved)
})

test('each F/SS palette stays on its own model; SSS weight conflict creates no 1.5/1.6 duplicates; metadata persisted', async () => {
  await applyRc22Catalog((await previewRc22Catalog()).comparisonToken)
  for (const t of rc22Catalog) {
    const m = await db.lureModels.where('name').equals(t.model).first()
    if (!t.productVerified) { assert.equal(m, undefined); continue }
    assert.equal(m.weightG,t.weight); assert.equal(m.actionType,t.actionType)
    const colors = await db.lureVariants.where('modelId').equals(m.id).toArray()
    assert.deepEqual(colors.map(c => c.colorName), t.colors.filter(c => c.verified).map(c => c.label))
    assert.ok(colors.every(c => c.catalogEvidence.revision === 'RC22'))
  }
})

test('existing alias F model and named color retain IDs; held alias is not double-added', async () => {
  await db.lureSeries.add({id:500,manufacturerId:71,name:'バービー ロング'})
  await db.lureModels.add({id:500,seriesId:500,name:'バービー ロング',weightG:1.6})
  await db.lureVariants.add({id:5000,modelId:500,colorName:'1 スケスケオリーブ'})
  const p=await previewRc22Catalog()
  assert.equal(p.addedColors,88); assert.equal(p.addedModels,7); assert.equal(p.addedSeries,3)
  assert.ok(p.rows.some(r => r.existing_id===5000 && r.action==='keep_existing'))
  await applyRc22Catalog(p.comparisonToken)
  assert.equal((await db.lureVariants.get(5000)).colorName,'1 スケスケオリーブ')
  assert.equal(await db.lureVariants.where('modelId').equals(500).count(),13)
})

for (const conflict of ['manufacturer','manufacturer-id','series','model','weight','type','wrong-series','color','code','unspecified-type']) {
  test(`hold ${conflict}: affected model receives no additions`, async () => {
    await db.lureSeries.add({id:500,manufacturerId:71,name:'バービー'})
    await db.lureModels.add({id:500,seriesId:500,name:'バービー F',weightG:1.4})
    if(conflict==='manufacturer') await db.lureManufacturers.add({name:'rob lure'})
    if(conflict==='manufacturer-id') {await db.lureManufacturers.delete(71); await db.lureManufacturers.add({id:99,name:'ロブルアー'})}
    if(conflict==='series') await db.lureSeries.add({manufacturerId:71,name:'バービー '})
    if(conflict==='model') await db.lureModels.add({seriesId:500,name:'バービーF',weightG:1.4})
    if(conflict==='weight') await db.lureModels.update(500,{weightG:1.6})
    if(conflict==='type') await db.lureModels.update(500,{actionType:'SS'})
    if(conflict==='wrong-series') {await db.lureSeries.add({id:501,manufacturerId:71,name:'別シリーズ'});await db.lureModels.update(500,{seriesId:501})}
    if(conflict==='color') await db.lureVariants.bulkAdd([{modelId:500,colorName:'15 クリペナプラス'},{modelId:500,colorName:'クリペナプラス'}])
    if(conflict==='code') await db.lureVariants.add({modelId:500,colorName:'15 違う名前'})
    if(conflict==='unspecified-type') await db.lureModels.update(500,{name:'バービー'})
    const before=await state(), p=await previewRc22Catalog()
    assert.deepEqual(await state(),before)
    assert.ok(p.rows.filter(r=>r.model==='バービー F').every(r=>r.action==='hold_conflict' && r.hold_reason))
    await applyRc22Catalog(p.comparisonToken)
    assert.deepEqual(await db.lureVariants.where('modelId').equals(500).toArray(),before.lureVariants.filter(r=>r.modelId===500))
  })
}

test('late failure rolls back added series, models, colors and evidence', async () => {
  const before=await state(), p=await previewRc22Catalog(); let n=0
  const fail=()=>{if(++n===50)throw new Error('injected RC22 failure')}
  db.lureVariants.hook('creating',fail)
  try {await assert.rejects(applyRc22Catalog(p.comparisonToken),/injected/)}
  finally {db.lureVariants.hook('creating').unsubscribe(fail)}
  assert.deepEqual(await state(),before)
})

test('parallel apply succeeds once; stale preview and cancellation preserve records', async () => {
  const p=await previewRc22Catalog()
  const results=await Promise.allSettled([applyRc22Catalog(p.comparisonToken),applyRc22Catalog(p.comparisonToken)])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
  assert.match(results.find(r=>r.status==='rejected').reason.message,/もう一度/)
  assert.equal((await previewRc22Catalog()).addedColors,0)
})

test('CSV contains all nine models, hierarchy actions, source tiers, limited classes and actual IDs', async () => {
  const csv=rc22DiffCsv(await previewRc22Catalog())
  assert.ok(csv.startsWith('\uFEFFkind,manufacturer'))
  assert.ok(csv.includes('"add_series"'));assert.ok(csv.includes('"add_model"'))
  assert.ok(csv.includes('"heroes"'));assert.ok(csv.includes('"unknown"'))
  assert.ok(csv.includes('"hold_product"'));assert.ok(csv.includes('"hold_color"'))
  assert.ok(csv.includes('https://rob-lure.com/'));assert.ok(csv.includes('https://www.fishing-otsuka.co.jp/'))
})

test('2218-color RC21 acceptance state retains every historical record; catches7/ownership4/trips5 unchanged', async () => {
  const pad = async (table,total,make) => {
    const ids=new Set((await table.toArray()).map(r=>r.id)), rows=[]
    for(let id=1;ids.size+rows.length<total;id++) if(!ids.has(id))rows.push({...make(id),id})
    await table.bulkAdd(rows)
  }
  await pad(db.lureManufacturers,80,id=>({name:`synthetic maker ${id}`}))
  await pad(db.lureSeries,143,id=>({manufacturerId:1,name:`synthetic series ${id}`}))
  await pad(db.lureModels,323,id=>({seriesId:1,name:`synthetic model ${id}`}))
  await pad(db.lureVariants,2218,id=>({modelId:1,colorName:`synthetic color ${id}`}))
  const trip=await db.trips.get(10), catchRow=await db.catches.get(11)
  await pad(db.trips,5,()=>trip);await pad(db.catches,7,()=>catchRow)
  await pad(db.myLures,4,()=>({variantId:1887,active:true,ownershipStatus:'owned'}))
  await db.fishSpecies.add({fish_id:'F001',group:'ニジマス',display_name:'ニジマス',active:true,origin:'reviewed',aliases:'',region:'',lineage_or_type:'',source_status:'',notes:'',source_url:''})
  await db.rods.add({id:1,manufacturer:'test',modelName:'preserved rod',active:true})
  await db.reels.add({id:1,manufacturer:'test',modelName:'preserved reel',active:true})
  await db.lines.add({id:1,material:'ナイロン',strengthLb:3,active:true})
  await db.tackleSets.add({id:1,name:'preserved set',rodId:1,reelId:1,active:true})
  const before=await state()
  await applyRc22Catalog((await previewRc22Catalog()).comparisonToken)
  const saved=await state()
  assert.equal(saved.lureVariants.length,2307);assert.equal(saved.lureModels.length,331);assert.equal(saved.lureSeries.length,147)
  assert.equal(saved.catches.length,7);assert.equal(saved.trips.length,5);assert.equal(saved.myLures.length,4)
  for(const [table,rows] of Object.entries(before)) {
    for(const row of rows)assert.deepEqual(saved[table].find(r=>(r.id??r.fish_id)===(row.id??row.fish_id)),row)
    if(!['lureSeries','lureModels','lureVariants'].includes(table))assert.deepEqual(saved[table],rows)
  }
})
