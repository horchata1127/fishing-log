import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc30-'))
const sources = { database:'src/db/database.ts',data:'src/data/rc30Catalog.ts',importer:'src/utils/rc30Catalog.ts',fixture:'tests/rc30Fixture.ts',
  master:'src/utils/facilityMaster.ts',storage:'src/utils/facilityStorage.ts',backup:'src/utils/backup.ts',events:'src/utils/tripEvents.ts',calendar:'src/utils/calendarDate.ts',timeline:'src/utils/tripTimeline.ts' }
const paths = Object.fromEntries(Object.keys(sources).map(n=>[n,join(directory,n+'.mjs')]))
const replacements = { dexie:import.meta.resolve('dexie'), '../db/database':pathToFileURL(paths.database).href,
  '../data/rc30Catalog':pathToFileURL(paths.data).href,'./facilityStorage':pathToFileURL(paths.storage).href,'./facilityMaster':pathToFileURL(paths.master).href,'./calendarDate':pathToFileURL(paths.calendar).href }
for(const [name,path] of Object.entries(sources)) {
  let code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  for(const [from,to] of Object.entries(replacements)) code=code.replaceAll(JSON.stringify(from),JSON.stringify(to)).replaceAll("'"+from+"'",JSON.stringify(to))
  await writeFile(paths[name],code)
}
const {db}=await import(pathToFileURL(paths.database).href)
const {rc30Catalog}=await import(pathToFileURL(paths.data).href)
const {previewRc30Catalog,applyRc30Catalog,rc30DiffCsv}=await import(pathToFileURL(paths.importer).href)
const {rc30Fixture}=await import(pathToFileURL(paths.fixture).href)
const {validateBackup,createBackup,importBackup}=await import(pathToFileURL(paths.backup).href)
const {saveTripEvent,deleteTripEvent,parseEventDateTime,eventDateTime}=await import(pathToFileURL(paths.events).href)
const {buildTripTimeline}=await import(pathToFileURL(paths.timeline).href)
const state=async()=>Object.fromEntries(await Promise.all(db.tables.map(async t=>[t.name,await t.toArray()])))
beforeEach(async()=>{
  await db.transaction('rw',db.tables,async()=>{
    for(const table of db.tables) await table.clear()
    for(const [table,rows] of Object.entries(validateBackup(rc30Fixture()))) if(rows.length) await db.table(table).bulkAdd(rows)
  })
})
after(async()=>{db.close();await rm(directory,{recursive:true,force:true})})
const input={type:'stocking',dateTime:'2026-10-24T10:30',zoneId:'user:rc30-zone',note:'イワナ・ロック・レインボー放流予定時刻。現地放流を確認した記録'}
test('ended trip 13 CRUD, explicit JST, mixed timeline, full v7 restore, catches untouched',async()=>{
  const before=await state(),trip=await db.trips.get(13)
  const id=await saveTripEvent(trip,input), row=await db.tripEvents.get(id)
  assert.equal(row.occurredAt.toISOString(),'2026-10-24T01:30:00.000Z');assert.equal(row.zoneName,'合成エリア')
  const timeline=buildTripTimeline(trip,before.catches,[row],[])
  assert.deepEqual(timeline.markers.map(m=>m.kind),['stocking','catch','lost'])
  await saveTripEvent(trip,{...input,type:'pellet',dateTime:'2026-10-24T11:00',note:'修正'},row)
  assert.equal(await db.tripEvents.count(),1);assert.equal((await db.tripEvents.get(id)).type,'pellet')
  await deleteTripEvent(await db.tripEvents.get(id));assert.equal(await db.tripEvents.count(),0)
  await saveTripEvent(trip,input)
  const saved=await state(),backup=await createBackup();assert.equal(backup.version,7)
  await importBackup(new File([JSON.stringify(backup)],'synthetic-v7.json'))
  assert.deepEqual(await state(),saved)
  for(const table of Object.keys(before)) if(table!=='tripEvents') assert.deepEqual(saved[table],before[table],table)
})
test('date validation, overnight, device timezone independence, stale edit/delete and zone mismatch',async()=>{
  const trip=await db.trips.get(13)
  assert.equal(eventDateTime(parseEventDateTime('2026-10-24T10:30')),'2026-10-24T10:30')
  for(const dateTime of ['','2026-02-30T10:30','2026-10-24T24:00','2026-10-23T10:30','2026-10-24T07:59','2026-10-24T15:01']) {
    await assert.rejects(()=>saveTripEvent(trip,{...input,dateTime}))
  }
  await assert.rejects(()=>saveTripEvent(trip,{...input,zoneId:'missing'}))
  assert.equal(await db.tripEvents.count(),0)
  const id=await saveTripEvent(trip,input),row=await db.tripEvents.get(id)
  await db.tripEvents.update(id,{note:'別画面の更新'})
  await assert.rejects(()=>saveTripEvent(trip,input,row),/変更/);await assert.rejects(()=>deleteTripEvent(row),/変更/)
  await db.trips.update(13,{startedAt:new Date('2026-10-24T14:00:00Z'),endedAt:new Date('2026-10-24T17:00:00Z')})
  const night=await db.trips.get(13)
  await saveTripEvent(night,{...input,dateTime:'2026-10-25T01:00'})
  await assert.rejects(()=>saveTripEvent(night,{...input,dateTime:'2026-10-25T02:01'}))
  await assert.rejects(()=>saveTripEvent(trip,input),/釣行が変更/)
})
test('memo edits preserve seconds and approximate precision; explicit unknown-time correction becomes exact',async()=>{
  const trip=await db.trips.get(13)
  const id=await db.tripEvents.add({tripId:13,type:'pellet',occurredAt:new Date('2026-10-24T01:30:42.123Z'),timePrecision:'approximate'})
  await saveTripEvent(trip,{...input,note:'メモだけ修正'},await db.tripEvents.get(id))
  assert.equal((await db.tripEvents.get(id)).occurredAt.toISOString(),'2026-10-24T01:30:42.123Z')
  assert.equal((await db.tripEvents.get(id)).timePrecision,'approximate')
  await db.tripEvents.update(id,{occurredAt:undefined,timePrecision:'unknown'})
  assert.equal(eventDateTime(undefined),'')
  await saveTripEvent(trip,input,await db.tripEvents.get(id))
  assert.equal((await db.tripEvents.get(id)).timePrecision,'exact')
  assert.equal((await db.tripEvents.get(id)).occurredAt.toISOString(),'2026-10-24T01:30:00.000Z')
})
test('additive catalog, frozen product evidence, all original IDs and references retained; repeat/reopen/v7 roundtrip',async()=>{
  const before=await state(),p=await previewRc30Catalog()
  assert.deepEqual(await state(),before);assert.equal(p.addedModels,4);assert.equal(p.addedColors,140)
  assert.equal(p.rows.filter(r=>r.action==='hold').length,0)
  assert.ok(rc30DiffCsv(p).includes('sourceUrl'))
  const route=JSON.parse(await readFile('docs/rc30/ROUTE_VARIANTS.json','utf8'))
  for(const t of rc30Catalog) for(const c of t.colors) if(c.jan) {
    assert.ok(route.variants.some(v=>v.barcode===c.jan&&v.title===c.evidence))
    assert.equal([...c.jan].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10,0)
  }
  await applyRc30Catalog(p.comparisonToken)
  const saved=await state()
  for(const [table,rows] of Object.entries(before)) for(const row of rows) assert.deepEqual(saved[table].find(r=>r.id===row.id),row)
  for(const table of ['trips','catches','myLures','tripEvents']) assert.deepEqual(saved[table],before[table])
  assert.equal(saved.lureModels.find(m=>m.name==='Fat USSA Jr. XS').weightG,1.7)
  const again=await previewRc30Catalog();assert.equal(again.addedColors,0);assert.equal(again.retainedColors,140)
  await applyRc30Catalog(again.comparisonToken);assert.deepEqual(await state(),saved)
  db.close();await db.open();assert.equal(db.verno, 9);assert.deepEqual(await state(),saved)
  const backup=await createBackup();await importBackup(new File([JSON.stringify(backup)],'synthetic.json'));assert.deepEqual(await state(),saved)
})
test('aliases retain IDs, distinct C colors coexist, same color in another model is independent',async()=>{
  await db.lureModels.add({id:500,seriesId:82,name:'USSA S'})
  await db.lureVariants.bulkAdd([{id:900,modelId:500,colorName:'クロまんじゅう'}, {id:901,modelId:500,colorName:'03 S.MⅥ'}, {id:902,modelId:500,colorName:'2015 ノブカラー'}])
  const p=await previewRc30Catalog()
  assert.equal(p.retainedColors,3);assert.equal(p.rows.filter(r=>r.action==='hold').length,0)
  await applyRc30Catalog(p.comparisonToken)
  assert.equal((await db.lureVariants.get(900)).colorName,'クロまんじゅう')
  assert.equal((await db.lureVariants.where('modelId').equals(500).toArray()).filter(v=>v.colorName.includes('S.M')).length,2)
  assert.equal((await previewRc30Catalog()).addedColors,0)
})
test('conflicts hold whole model; stale token and write failures do not partially modify data',async()=>{
  const p=await previewRc30Catalog()
  await db.lureModels.add({id:500,seriesId:82,name:'USSA S',weightG:99})
  const changed=await state()
  await assert.rejects(()=>applyRc30Catalog(p.comparisonToken),/もう一度/);assert.deepEqual(await state(),changed)
  const next=await previewRc30Catalog();assert.equal(next.rows.filter(r=>r.model==='USSA S'&&r.action==='hold').length,48)
  const original=db.lureVariants.add;let count=0
  db.lureVariants.add=function(...args){if(++count===3)throw new Error('injected');return original.apply(this,args)}
  try{await assert.rejects(()=>applyRc30Catalog(next.comparisonToken),/injected/)}finally{db.lureVariants.add=original}
  assert.deepEqual(await state(),changed)
})
