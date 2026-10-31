import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc31-'))
const sources = { database:'src/db/database.ts',data:'src/data/rc31Catalog.ts',importer:'src/utils/rc31Catalog.ts',fixture:'tests/rc31Fixture.ts',baseFixture:'tests/rc30Fixture.ts',
  master:'src/utils/facilityMaster.ts',storage:'src/utils/facilityStorage.ts',backup:'src/utils/backup.ts',calendar:'src/utils/calendarDate.ts' }
const paths = Object.fromEntries(Object.keys(sources).map(n=>[n,join(directory,n+'.mjs')]))
const replacements = { dexie:import.meta.resolve('dexie'), '../db/database':pathToFileURL(paths.database).href,
  '../data/rc31Catalog':pathToFileURL(paths.data).href,'./rc30Fixture':pathToFileURL(paths.baseFixture).href,'./facilityStorage':pathToFileURL(paths.storage).href,'./facilityMaster':pathToFileURL(paths.master).href,'./calendarDate':pathToFileURL(paths.calendar).href }
for(const [name,path] of Object.entries(sources)) {
  let code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  for(const [from,to] of Object.entries(replacements)) code=code.replaceAll(JSON.stringify(from),JSON.stringify(to)).replaceAll("'"+from+"'",JSON.stringify(to))
  await writeFile(paths[name],code)
}
const {db}=await import(pathToFileURL(paths.database).href)
const {rc31Catalog}=await import(pathToFileURL(paths.data).href)
const {previewRc31Catalog,applyRc31Catalog,rc31DiffCsv}=await import(pathToFileURL(paths.importer).href)
const {rc31Fixture}=await import(pathToFileURL(paths.fixture).href)
const {validateBackup,createBackup,importBackup}=await import(pathToFileURL(paths.backup).href)
const state=async()=>Object.fromEntries(await Promise.all(db.tables.map(async t=>[t.name,await t.toArray()])))
beforeEach(async()=>{
  await db.transaction('rw',db.tables,async()=>{
    for(const table of db.tables) await table.clear()
    for(const [table,rows] of Object.entries(validateBackup(rc31Fixture()))) if(rows.length) await db.table(table).bulkAdd(rows)
  })
})
after(async()=>{db.close();await rm(directory,{recursive:true,force:true})})

test('CSV parity, additive 1/3/7/83, two applications, reopen and v7 restore preserve all records',async()=>{
  const csv=(await readFile('docs/rc31/palms_little_diner_83colors.csv','utf8')).trim().split(/\r?\n/).slice(1).map(l=>l.split(','))
  assert.equal(csv.length,83)
  const frozen=rc31Catalog.flatMap(t=>t.colors.map(c=>[t.manufacturer,t.series,t.model,String(t.length),t.weight,t.buoyancy,c.code,c.name,t.sourceUrl]))
  assert.deepEqual(frozen,csv.map(r=>[r[0],r[1],r[2],r[3],Number(r[4]),r[5],r[7],r[8],r[9]]))
  const before=await state(), p=await previewRc31Catalog()
  assert.deepEqual(await state(),before)
  assert.deepEqual([p.addedManufacturers,p.addedSeries,p.addedModels,p.addedColors,p.pendingColors],[1,3,7,83,0])
  assert.ok(rc31DiffCsv(p).includes('sourceUrl'))
  await applyRc31Catalog(p.comparisonToken)
  const saved=await state()
  assert.deepEqual(['lureManufacturers','lureSeries','lureModels','lureVariants','myLures','trips','catches','tripEvents'].map(t=>saved[t].length),[81,155,362,2899,9,3,15,1])
  for(const [table,rows] of Object.entries(before)) for(const row of rows) assert.deepEqual(saved[table].find(r=>r.id===row.id),row)
  for(const table of Object.keys(before).filter(t=>!['lureManufacturers','lureSeries','lureModels','lureVariants'].includes(t))) assert.deepEqual(saved[table],before[table],table)
  const manufacturer=saved.lureManufacturers.find(m=>m.name==='PALMS')
  const series=saved.lureSeries.filter(s=>s.manufacturerId===manufacturer.id)
  assert.equal(series.length,3)
  const models=saved.lureModels.filter(m=>series.some(s=>s.id===m.seriesId))
  assert.equal(models.length,7)
  assert.equal(new Set(models.map(m=>`${m.seriesId}/${m.name}`)).size,7)
  assert.deepEqual(rc31Catalog.map(t=>{
    const model=models.find(m=>m.name===t.model), variants=saved.lureVariants.filter(v=>v.modelId===model.id)
    assert.equal(new Set(variants.map(v=>v.catalogEvidence.colorCode)).size,variants.length)
    for(const c of t.colors) {
      const v=variants.find(v=>v.catalogEvidence.colorCode===c.code)
      assert.equal(v.colorName,c.label);assert.equal(v.catalogEvidence.originalName,c.name)
      assert.equal(v.catalogEvidence.manufacturerUrl,t.sourceUrl)
      assert.equal(v.catalogEvidence.sourceTier,'manufacturer')
      assert.equal(v.catalogEvidence.weightG,t.weight);assert.equal(v.catalogEvidence.lengthMm,t.length)
      assert.equal(v.catalogEvidence.buoyancy,t.buoyancy)
      assert.equal(v.catalogEvidence.jan,'');assert.equal(v.catalogEvidence.rattle,undefined)
    }
    return variants.length
  }),[12,12,7,16,16,10,10])
  const again=await previewRc31Catalog()
  assert.deepEqual([again.addedManufacturers,again.addedSeries,again.addedModels,again.addedColors,again.retainedColors,again.pendingColors],[0,0,0,0,83,0])
  await applyRc31Catalog(again.comparisonToken); assert.deepEqual(await state(),saved)
  db.close();await db.open();assert.equal(db.verno, 9);assert.deepEqual(await state(),saved)
  const backup=await createBackup();assert.equal(backup.version,7)
  await importBackup(new File([JSON.stringify(backup)],'synthetic-rc31-v7.json'))
  assert.deepEqual(await state(),saved)
  assert.equal((await previewRc31Catalog()).retainedColors,83)
})

test('manufacturer/series/model aliases, code-only match, code-less names, model-scoped codes and official spelling',async()=>{
  await db.lureManufacturers.add({id:500,name:'ＰＡＬＭＳ（パームス）'})
  await db.lureSeries.add({id:501,manufacturerId:500,name:'ポワレ'})
  await db.lureModels.add({id:502,seriesId:501,name:'PO-32F'})
  const t=rc31Catalog[0], c=t.colors.find(c=>c.code==='T458')
  assert.ok(c)
  await db.lureVariants.bulkAdd([{id:503,modelId:502,colorName:t.colors[0].name},
    {id:504,modelId:502,colorName:`T-458 ${c.name}`},
    {id:505,modelId:502,colorName:t.colors[1].name.normalize('NFKC')}])
  const before=await state(), p=await previewRc31Catalog()
  assert.deepEqual([p.addedManufacturers,p.addedSeries,p.addedModels,p.addedColors,p.retainedColors,p.pendingColors],[0,2,6,80,3,0])
  await applyRc31Catalog(p.comparisonToken)
  for(const row of before.lureVariants) assert.deepEqual(await db.lureVariants.get(row.id),row)
  assert.equal((await previewRc31Catalog()).addedColors,0)
  const variants=await db.lureVariants.toArray()
  const color=(model,code)=>variants.find(v=>v.modelId===model.id && v.catalogEvidence?.colorCode===code)?.catalogEvidence.originalName
  const models=await db.lureModels.toArray()
  assert.equal(color(models.find(m=>m.name==='GA-24S'),'T-4A'),'かべるね')
  assert.equal(color(models.find(m=>m.name==='GL-31F'),'T-4A'),'かるべね')
  assert.ok(variants.some(v=>v.catalogEvidence?.originalName==='ひのえ2'))
  assert.ok(variants.some(v=>v.catalogEvidence?.originalName==='ひのえ２'))
})

test('ambiguous manufacturer, model and colors hold; stale preview and failed writes cannot partially apply',async()=>{
  const p=await previewRc31Catalog()
  await db.lureManufacturers.add({id:500,name:'パームス'})
  const changed=await state()
  await assert.rejects(()=>applyRc31Catalog(p.comparisonToken),/もう一度/)
  assert.deepEqual(await state(),changed)
  const original=db.lureVariants.add;let count=0
  db.lureVariants.add=function(...args){if(++count===3)throw new Error('injected');return original.apply(this,args)}
  try{await assert.rejects(async()=>applyRc31Catalog((await previewRc31Catalog()).comparisonToken),/injected/)}finally{db.lureVariants.add=original}
  assert.deepEqual(await state(),changed)
  await db.lureManufacturers.add({id:501,name:'PALMS'})
  assert.equal((await previewRc31Catalog()).pendingColors,83)
  await db.lureManufacturers.delete(501)
  await db.lureSeries.add({id:502,manufacturerId:500,name:'Powale'})
  await db.lureModels.bulkAdd([{id:503,seriesId:502,name:'PO-32F'},{id:504,seriesId:502,name:'PO-32F'}])
  assert.equal((await previewRc31Catalog()).pendingColors,12)
  await db.lureModels.delete(504)
  await db.lureVariants.bulkAdd([{id:505,modelId:503,colorName:'MT915 マットクリア'}, {id:506,modelId:503,colorName:'マットクリア'}])
  assert.equal((await previewRc31Catalog()).pendingColors,12)
})

test('NFKC name fallback reuses code-less colors; explicit wrong codes and conflicting model specs are held',async()=>{
  await db.lureManufacturers.add({id:500,name:'PALMS'})
  await db.lureSeries.add({id:501,manufacturerId:500,name:'GANOFF'})
  await db.lureModels.add({id:502,seriesId:501,name:'GA-31S'})
  await db.lureVariants.add({id:503,modelId:502,colorName:'ひのえ2'})
  const p=await previewRc31Catalog()
  assert.equal(p.retainedColors,1);assert.equal(p.pendingColors,0)
  await db.lureVariants.update(503,{catalogEvidence:{revision:'RC31',colorClass:'',sourceTier:'manufacturer',
    manufacturerUrl:'',retailerUrl:'',jan:'',originalName:'ひのえ２',colorCode:'WRONG'}})
  const conflict=await previewRc31Catalog()
  assert.equal(conflict.rows.filter(r=>r.model==='GA-31S'&&r.action==='hold').length,10)
  await db.lureModels.update(502,{weightG:99})
  assert.equal((await previewRc31Catalog()).rows.filter(r=>r.model==='GA-31S'&&r.action==='hold').length,10)
})

test('legacy v2 backup remains usable and gains RC31 without changing original IDs or personal records',async()=>{
  await importBackup(new File([JSON.stringify({format:'fishing-log-backup',version:2,exportedAt:'2026-10-01T00:00:00Z',
    data:{trips:[],catches:[],tripEvents:[],lureManufacturers:[{id:77,name:'パームス'}],lureSeries:[],lureModels:[],lureVariants:[],myLures:[]}})],'synthetic-legacy-v2.json'))
  const p=await previewRc31Catalog();assert.equal(p.addedManufacturers,0)
  await applyRc31Catalog(p.comparisonToken)
  assert.deepEqual(await db.lureManufacturers.toArray(),[{id:77,name:'パームス'}])
  assert.equal(await db.myLures.count(),0)
  const saved=await state(),backup=await createBackup()
  await importBackup(new File([JSON.stringify(backup)],'synthetic-legacy-roundtrip.json'))
  assert.deepEqual(await state(),saved)
  assert.equal((await previewRc31Catalog()).retainedColors,83)
})
