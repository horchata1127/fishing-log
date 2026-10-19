import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc28-'))
const paths = Object.fromEntries(['database','data','importer','fixture','master','storage','backup'].map(n=>[n,join(directory,n+'.mjs')]))
const sources = { database:'src/db/database.ts',data:'src/data/rc28Catalog.ts',importer:'src/utils/rc28Catalog.ts',fixture:'tests/rc28Fixture.ts',
  master:'src/utils/facilityMaster.ts',storage:'src/utils/facilityStorage.ts',backup:'src/utils/backup.ts' }
const replacements = { dexie:import.meta.resolve('dexie'), '../db/database':pathToFileURL(paths.database).href,
  '../data/rc28Catalog':pathToFileURL(paths.data).href,'./facilityStorage':pathToFileURL(paths.storage).href,'./facilityMaster':pathToFileURL(paths.master).href }
for(const [name,path] of Object.entries(sources)) {
  let code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  for(const [from,to] of Object.entries(replacements)) code=code.replaceAll(JSON.stringify(from),JSON.stringify(to)).replaceAll("'"+from+"'",JSON.stringify(to))
  await writeFile(paths[name],code)
}
const {db}=await import(pathToFileURL(paths.database).href)
const {rc28Catalog,rc28Pending}=await import(pathToFileURL(paths.data).href)
const {previewRc28Catalog,previewRc28Snapshot,applyRc28Catalog,rc28DiffCsv}=await import(pathToFileURL(paths.importer).href)
const {rc28Fixture}=await import(pathToFileURL(paths.fixture).href)
const {validateBackup,createBackup,importBackup}=await import(pathToFileURL(paths.backup).href)
const state=async()=>Object.fromEntries(await Promise.all(db.tables.map(async t=>[t.name,await t.toArray()])))
beforeEach(async()=>{
  await db.transaction('rw',db.tables,async()=>{
    for(const table of db.tables) await table.clear()
    const fixture=validateBackup(rc28Fixture())
    for(const [table,rows] of Object.entries(fixture)) if(rows.length) await db.table(table).bulkAdd(rows)
  })
})
after(async()=>{db.close();await rm(directory,{recursive:true,force:true})})

test('frozen evidence: exact weights and captions, JAN checksums, model-scoped uniqueness, Rhomy 48', async()=>{
  const pack=JSON.parse(await readFile('docs/rc28/CATALOG.json','utf8'))
  assert.deepEqual(JSON.parse(JSON.stringify(rc28Catalog)),JSON.parse(JSON.stringify(pack,(k,v)=>v===null?undefined:v)))
  const captions=JSON.parse(await readFile('docs/rc28/TIMON_CAPTIONS.json','utf8'))
  const retailer=JSON.parse(await readFile('docs/rc28/RETAILER_EVIDENCE.json','utf8'))
  const shopify=JSON.parse(await readFile('docs/rc28/SHOPIFY_EVIDENCE.json','utf8'))
  const jans=new Set()
  for(const t of rc28Catalog){
    assert.equal(new Set(t.colors.map(c=>c.label.normalize('NFKC'))).size,t.colors.length)
    for(const c of t.colors){
      if(c.jan){
        assert.match(c.jan,/^\d{13}$/)
        assert.equal([...c.jan].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10,0)
        assert.ok(!jans.has(c.jan),c.jan);jans.add(c.jan)
      }
      if(c.sourceTier==='manufacturer'){
        const cap=captions.find(r=>r.url===c.sourceUrl && r.caption===c.evidence)
        assert.ok(cap)
        assert.ok(cap.pairs.some(([w,j])=>Number(w)===t.weight && (!c.jan||j===c.jan)))
      }else assert.ok(retailer.some(r=>r.url===c.sourceUrl && r.weight===t.weight && r.jan===c.jan)||shopify.some(r=>r.url===c.sourceUrl && r.model===t.model)||c.sourceUrl==='https://www.kitiya.jp/?pid=188884454')
    }
  }
  const rhomy=rc28Catalog.filter(t=>t.series==='Rhomy')
  assert.deepEqual(rhomy.map(t=>[t.weight,t.length,t.colors.length]),[[2.1,31,12],[2.4,31,12],[3.1,37,12],[3.9,37,12]])
  assert.ok(rc28Pending.some(p=>p.name==='ゴールド'))
})

test('read-only preview; additive update retains every record/ID; repeat, reopen, backup v7 round trip',async()=>{
  const before=await state(),p=await previewRc28Catalog()
  assert.deepEqual(await state(),before)
  assert.equal(p.addedColors,rc28Catalog.reduce((n,t)=>n+t.colors.length,0))
  assert.equal(p.addedModels,20);assert.equal(p.addedSeries,5)
  assert.ok(!p.rows.some(r=>r.action==='hold'))
  assert.ok(rc28DiffCsv(p).includes('sourceUrl'))
  await applyRc28Catalog(p.comparisonToken)
  const saved=await state()
  for(const [table,rows] of Object.entries(before)){
    for(const row of rows) assert.deepEqual(saved[table].find(r=>r.id===row.id),row)
    if(!['lureSeries','lureModels','lureVariants'].includes(table)) assert.deepEqual(saved[table],rows)
  }
  assert.equal(saved.lureVariants.filter(v=>v.modelId===110).length,25)
  assert.equal(saved.lureModels.find(m=>m.name==='WAH 37FⅡ').weightG,2.5)
  assert.equal(saved.lureVariants.filter(v=>v.modelId===226).length,0)
  const again=await previewRc28Catalog()
  assert.equal(again.addedColors,0);assert.equal(again.pendingColors,rc28Pending.length)
  await applyRc28Catalog(again.comparisonToken);assert.deepEqual(await state(),saved)
  db.close();await db.open();assert.equal(db.verno,8);assert.deepEqual(await state(),saved)
  const backup=await createBackup()
  assert.equal(backup.version,7)
  validateBackup(JSON.parse(JSON.stringify(backup)))
  await importBackup(new File([JSON.stringify(backup)],'synthetic.json',{type:'application/json'}))
  assert.deepEqual(await state(),saved)
})

test('stale preview refuses writes; later user ownership/history additions survive application',async()=>{
  const p=await previewRc28Catalog()
  await db.lureVariants.add({id:9500,modelId:110,colorName:'開発中の追加色'})
  const changed=await state()
  await assert.rejects(()=>applyRc28Catalog(p.comparisonToken),/もう一度/)
  assert.deepEqual(await state(),changed)
  const next=await previewRc28Catalog()
  await db.myLures.add({id:95,variantId:9500,active:true})
  await db.catches.add({id:75,tripId:80,lureId:95,lureVariantId:9500,caughtAt:new Date('2020-01-01T01:00:00Z')})
  await applyRc28Catalog(next.comparisonToken)
  assert.ok(await db.myLures.get(95));assert.ok(await db.catches.get(75));assert.deepEqual(await db.lureVariants.get(9500),changed.lureVariants.find(v=>v.id===9500))
})

test('read-only exported snapshot and existing Japanese weight/color aliases retain user IDs',async()=>{
  const target=rc28Catalog.find(t=>t.model==='Tearo 1.6g'),color=target.colors[0]
  await db.lureSeries.add({id:700,manufacturerId:8,name:'ティアロ'})
  await db.lureModels.add({id:1700,seriesId:700,name:'ティアロ1.6g',weightG:1.6,lengthMm:22})
  await db.lureVariants.add({id:9700,modelId:1700,colorName:color.name})
  const before=await state(),snapshot=['lureManufacturers','lureSeries','lureModels','lureVariants'].map(n=>before[n])
  const exported=structuredClone(snapshot),p=await previewRc28Snapshot(snapshot)
  assert.deepEqual(snapshot,exported);assert.deepEqual(await state(),before)
  assert.equal(p.retainedColors,1)
  assert.ok(p.rows.some(r=>r.existingId===9700&&r.action==='keep'))
  await applyRc28Catalog(p.comparisonToken)
  assert.deepEqual(await db.lureVariants.get(9700),before.lureVariants.find(v=>v.id===9700))
  assert.deepEqual(await db.lureModels.get(1700),before.lureModels.find(v=>v.id===1700))
  assert.equal((await previewRc28Catalog()).addedColors,0)
})

for(const conflict of ['manufacturer','series','model','weight','length','type','color','jan','missing-weight','wrong-series','code','code-name']) test(`hold conflict: ${conflict}`,async()=>{
  if(conflict==='manufacturer') await db.lureManufacturers.add({name:'TIMON '})
  if(conflict==='series') await db.lureSeries.add({manufacturerId:5,name:'Wah '})
  if(conflict==='model') await db.lureModels.add({seriesId:103,name:'RCワウ37HF',lengthMm:37})
  if(conflict==='weight') await db.lureModels.update(110,{weightG:2.3})
  if(conflict==='length') await db.lureModels.update(110,{lengthMm:40})
  if(conflict==='type') await db.lureModels.update(110,{actionType:'SS'})
  if(conflict==='color') await db.lureVariants.bulkAdd([{modelId:110,colorName:'S.M VI'},{modelId:110,colorName:'1 S.M VI'}])
  if(conflict==='jan') await db.lureVariants.add({modelId:109,colorName:'別色',catalogEvidence:{revision:'RC28',jan:rc28Catalog[0].colors[0].jan,colorClass:'RC',sourceTier:'retailer',manufacturerUrl:'',retailerUrl:'',originalName:'別色'}})
  if(conflict==='missing-weight') {await db.lureSeries.add({id:500,manufacturerId:8,name:'Rhomy'});await db.lureModels.add({seriesId:500,name:'Rhomy 2.1g'})}
  if(conflict==='wrong-series') {await db.lureSeries.add({id:500,manufacturerId:5,name:'別シリーズ'});await db.lureModels.add({seriesId:500,name:'WAH 37FⅡ',weightG:2.5})}
  if(conflict==='code') await db.lureVariants.add({modelId:110,colorName:'2 S.M VI'})
  if(conflict==='code-name') await db.lureVariants.add({modelId:110,colorName:'1 未確認の別色'})
  const before=await state(),p=await previewRc28Catalog()
  assert.ok(p.rows.some(r=>r.action==='hold'))
  await applyRc28Catalog(p.comparisonToken)
  for(const row of p.rows.filter(r=>r.action==='hold')){
    const target=rc28Catalog.find(t=>t.model===row.model)
    const existingModel=before.lureModels.find(m=>m.name===target.model)
    if(existingModel) assert.deepEqual(await db.lureVariants.where('modelId').equals(existingModel.id).toArray(),before.lureVariants.filter(v=>v.modelId===existingModel.id))
    else assert.ok(!(await db.lureModels.toArray()).some(m=>m.name===target.model))
  }
})

test('transaction rolls back on write failure; concurrent application commits once',async()=>{
  const before=await state(),p=await previewRc28Catalog()
  const original=db.lureVariants.add
  let writes=0
  db.lureVariants.add=function(...args){if(++writes===3)throw new Error('injected write failure');return original.apply(this,args)}
  try{await assert.rejects(()=>applyRc28Catalog(p.comparisonToken),/injected/)}finally{db.lureVariants.add=original}
  assert.deepEqual(await state(),before)
  const results=await Promise.allSettled([applyRc28Catalog(p.comparisonToken),applyRc28Catalog(p.comparisonToken)])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
  assert.equal((await previewRc28Catalog()).addedColors,0)
})
