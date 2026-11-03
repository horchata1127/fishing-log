import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc36-'))
const sources = { report:'src/utils/tripReport.ts', reportStorage:'src/utils/tripReportStorage.ts', image:'src/utils/reportImage.ts', database:'src/db/database.ts', fixture:'tests/rc30Fixture.ts',
  master:'src/utils/facilityMaster.ts',storage:'src/utils/facilityStorage.ts',backup:'src/utils/backup.ts',events:'src/utils/tripEvents.ts',calendar:'src/utils/calendarDate.ts',timeline:'src/utils/tripTimeline.ts' }
const paths = Object.fromEntries(Object.keys(sources).map(n=>[n,join(directory,n+'.mjs')]))
const replacements = { './tripTimeline':pathToFileURL(paths.timeline).href, dexie:import.meta.resolve('dexie'), '../db/database':pathToFileURL(paths.database).href,
  './facilityStorage':pathToFileURL(paths.storage).href,'./facilityMaster':pathToFileURL(paths.master).href,'./calendarDate':pathToFileURL(paths.calendar).href }
for(const [name,path] of Object.entries(sources)) {
  let code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  for(const [from,to] of Object.entries(replacements)) code=code.replaceAll(JSON.stringify(from),JSON.stringify(to)).replaceAll("'"+from+"'",JSON.stringify(to))
  if (name === 'database') code = code.replace('FishingLogDatabase', 'FishingLogRC36IsolatedTest')
  await writeFile(paths[name],code)
}
const {db}=await import(pathToFileURL(paths.database).href)
const {rc30Fixture}=await import(pathToFileURL(paths.fixture).href)
const {validateBackup,createBackup,importBackup}=await import(pathToFileURL(paths.backup).href)
const {saveTripEvent}=await import(pathToFileURL(paths.events).href)
const {buildTripTimeline}=await import(pathToFileURL(paths.timeline).href)

const state=async()=>Object.fromEntries(await Promise.all(db.tables.map(async t=>[t.name,await t.toArray()])))
beforeEach(async()=>{
  await db.transaction('rw',db.tables,async()=>{
    for(const table of db.tables) await table.clear()
    for(const [table,rows] of Object.entries(validateBackup(rc30Fixture()))) if(rows.length) await db.table(table).bulkAdd(rows)
  })
})
after(async()=>{db.close();await rm(directory,{recursive:true,force:true})})

const {buildTripReport,groupTripLures,rateLabel,excerpt,reportPage,reportShareText,tablePageSize}=await import(pathToFileURL(paths.report).href)
const {saveTripMvp}=await import(pathToFileURL(paths.reportStorage).href)
const {shareReport}=await import(pathToFileURL(paths.image).href)

test('rates use actual completed duration and trip-scoped legacy catches/lost; formatting is consistent',async()=>{
  const trip={id:8,fishingAreaName:'test',fishingDate:'2026-11-03',startedAt:new Date('2026-11-03T00:00:00Z'),endedAt:new Date('2026-11-03T02:30:00Z')}
  const catches=Array.from({length:6},(_,i)=>({id:i+1,tripId:8,caughtAt:new Date('2026-11-03T01:00:00Z'),...(i<4?{}:{resultType:'lost'})}))
  const report=buildTripReport(trip,[...catches,{tripId:99,resultType:'lost'}])
  assert.equal(report.catchCount,4);assert.equal(report.lostCount,2)
  assert.equal(report.durationLabel,'2時間30分');assert.equal(rateLabel(report.catchRate),'1.6');assert.equal(rateLabel(report.responseRate),'2.4')
  const summary=buildTripTimeline(trip,catches,[],[])
  assert.equal(summary.markers.filter(m=>m.kind==='catch').length,report.catchCount)
  for(const endedAt of [undefined,trip.startedAt,new Date('2026-11-02T23:00:00Z'),new Date('invalid')]) {
    const invalid=buildTripReport({...trip,endedAt},catches)
    assert.equal(invalid.catchRate,null);assert.equal(invalid.responseRate,null)
  }
  const empty=buildTripReport(trip,[])
  assert.equal(empty.catchRate,0);assert.equal(empty.responseRate,0);assert.equal(empty.mvp,null)
  const tiny=buildTripReport({...trip,endedAt:new Date(trip.startedAt.getTime()+30000)},[])
  assert.equal(tiny.durationLabel,'1分未満')
})

test('lure grouping preserves saved IDs/colors/appearance and manual identity, with deterministic ranking',()=>{
  const rows=groupTripLures([
    {lureVariantId:1,lureName:'A',lureColor:'red'}, {lureVariantId:1,lureName:'A',lureColor:'red',resultType:'lost'},
    {lureVariantId:2,lureName:'A',lureColor:'blue'}, {lureName:'manual',lureColor:'red'}, {lureName:'manual',lureColor:'red'},
    {lureId:9,lureName:'owned'}, {lureId:9,lureName:'owned'}, {},
    {lureVariantId:1,lureName:'A',lureColor:'red',visualColorSnapshot:{appearance:{body:'silver'}}},
  ])
  assert.equal(rows.length,6)
  assert.equal(rows.find(r=>r.key==='variant:1').lost,1)
  assert.equal(rows.find(r=>r.name==='manual').catches,2)
  assert.equal(rows.reduce((n,r)=>n+r.catches,0),8)
  assert.equal(rows.reduce((n,r)=>n+r.lost,0),1)
  assert.ok(rows.some(r=>r.name==='ルアー未記録'))
})

test('MVP manual override, provisional color, automatic ties and no catch candidate',async()=>{
  const trip=await db.trips.get(13), catches=await db.catches.toArray()
  const initial=buildTripReport(trip,catches)
  assert.equal(initial.mvp.name,'USSA');assert.equal(initial.mvp.origin,'automatic')
  const saved=await saveTripMvp(trip,{name:'user choice',color:'unconfirmed',provisional:true})
  const report=buildTripReport(saved,catches)
  assert.equal(report.mvp.name,'user choice');assert.equal(report.mvp.origin,'user');assert.equal(report.mvp.provisional,true)
  await assert.rejects(()=>saveTripMvp(trip,{name:'stale'}))
  await assert.rejects(()=>saveTripMvp(saved,{name:' '}))
  const cleared=await saveTripMvp(saved)
  assert.equal(cleared.summaryMvp,undefined);assert.equal(buildTripReport(cleared,catches).mvp.origin,'automatic')
  assert.equal(buildTripReport(trip,catches.filter(c=>c.resultType==='lost')).mvp,null)
  const tie=buildTripReport(trip,[{tripId:13,lureName:'B'},{tripId:13,lureName:'A'}])
  assert.equal(tie.mvp.name,'A')
})

test('export shaping is read-only, Unicode-safe, bounded, paginated without omitted full-table rows',async()=>{
  const before=await state(),trip=await db.trips.get(13)
  const catches=Array.from({length:37},(_,i)=>({tripId:13,lureName:'日本語🐟'.repeat(20)+i,lureColor:'長いカラー名'.repeat(20),lureVariantId:i+1}))
  const report=buildTripReport(trip,catches)
  const summary=reportPage(report,'summary',999)
  assert.equal(summary.rows.length,8);assert.equal(summary.omitted,29);assert.equal(summary.omittedCatch,29)
  const full=Array.from({length:Math.ceil(37/tablePageSize)},(_,i)=>reportPage(report,'lures',i)).flatMap(p=>p.rows)
  assert.deepEqual(full,report.rows);assert.equal(new Set(full.map(r=>r.key)).size,37)
  assert.equal(reportPage(report,'lures',Infinity).page,0)
  assert.equal(excerpt('🐟🐟🐟',2),'🐟…')
  assert.equal(excerpt('one\n two',30),'one two')
  assert.ok(reportShareText(report).includes('自動候補'))
  assert.deepEqual(await state(),before)
})

test('existing weather preferred, observations fallback, own-trip logs only, optional memo is unmodified',async()=>{
  const trip=await db.trips.get(13),obs={source:'observed',sky:'rain',changes:['rainStarted']}
  const events=[{tripId:13,type:'weather',occurredAt:trip.startedAt,weatherObservation:obs}, {tripId:99,type:'weather',weatherObservation:{...obs,sky:'sunny'}}]
  const report=buildTripReport({...trip,memo:'a\nb'},[],events)
  assert.equal(report.weather,'🌧️ 雨（観測）');assert.equal(report.memo,'a\nb')
  assert.ok(report.weatherSummary.includes('雨が降り始めた'));assert.ok(!report.weatherSummary.includes('晴れ'))
  assert.equal(buildTripReport({...trip,weather:'曇り'},[],events).weather,'曇り')
})

test('v11 MVP and v10 weather roundtrip, invalid backup rejected before writes, other rows unchanged',async()=>{
  const before=await state(),trip=await db.trips.get(13)
  assert.equal((await createBackup()).version,7)
  await saveTripMvp(trip,{name:'MVP',color:'test',provisional:true})
  await saveTripEvent(await db.trips.get(13),{type:'weather',dateTime:'2026-10-24T10:30',zoneId:'',note:'',weatherObservation:{source:'observed',changes:['sunHidden']}})
  const expected=await state(),backup=JSON.parse(JSON.stringify(await createBackup()))
  assert.equal(backup.version,11)
  for(let i=0;i<2;i++) {
    await importBackup(new File([JSON.stringify(backup)],'isolated-v11.json'))
    const after=await state()
    for(const name of Object.keys(expected)) if(name!=='lureMasterImportHistory') assert.deepEqual(JSON.parse(JSON.stringify(after[name])),JSON.parse(JSON.stringify(expected[name])),name)
  }
  for(const name of Object.keys(before)) if(!['trips','tripEvents','lureMasterImportHistory'].includes(name)) assert.deepEqual((await state())[name],before[name],name)
  const snapshot=await state(),bad=structuredClone(backup)
  bad.data.trips[0].summaryMvp.name=''
  await assert.rejects(()=>importBackup(new File([JSON.stringify(bad)],'bad.json')))
  assert.deepEqual(await state(),snapshot)
  bad.data.trips[0].summaryMvp.name='valid';bad.version=10
  assert.throws(()=>validateBackup(bad))
  await saveTripMvp(await db.trips.get(13))
  assert.equal((await createBackup()).version,10)
})

test('share uses prepared files from user action; cancellation, unsupported and failed sharing fall back correctly',async()=>{
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),originalDocument=globalThis.document
  const file=new File(['png'],'test.png',{type:'image/png'}),shared=[]
  let downloaded=0
  globalThis.document={createElement:()=>({click(){downloaded++},remove(){}}),body:{appendChild(){}}}
  try {
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare:()=>true,share:async data=>{shared.push(data)}}})
    assert.equal(await shareReport(file,'text','blob:test'),'shared');assert.deepEqual(shared[0].files,[file]);assert.equal(shared[0].text,'text')
    navigator.share=async()=>{throw new DOMException('cancel','AbortError')}
    assert.equal(await shareReport(file,'text','blob:test'),'cancelled');assert.equal(downloaded,0)
    navigator.share=async()=>{throw new DOMException('denied','NotAllowedError')}
    assert.equal(await shareReport(file,'text','blob:test'),'downloaded');assert.equal(downloaded,1)
    navigator.canShare=()=>false
    assert.equal(await shareReport(file,'text','blob:test'),'downloaded');assert.equal(downloaded,2)
    navigator.canShare=undefined;navigator.share=undefined
    assert.equal(await shareReport(file,'text','blob:test'),'downloaded');assert.equal(downloaded,3)
  } finally {
    if(originalNavigator) Object.defineProperty(globalThis,'navigator',originalNavigator)
    else delete globalThis.navigator
    if(originalDocument===undefined) delete globalThis.document
    else globalThis.document=originalDocument
  }
})
