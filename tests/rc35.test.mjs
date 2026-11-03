import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { existsSync } from 'node:fs'

const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc35-'))
const sources = { database:'src/db/database.ts', fixture:'tests/rc30Fixture.ts',
  master:'src/utils/facilityMaster.ts',storage:'src/utils/facilityStorage.ts',backup:'src/utils/backup.ts',events:'src/utils/tripEvents.ts',calendar:'src/utils/calendarDate.ts',timeline:'src/utils/tripTimeline.ts',
  catches:'src/utils/catchRegistration.ts', tackles:'src/utils/tackleManagement.ts', fish:'src/utils/fishSpecies.ts', fishMaster:'src/data/fishMaster.ts', locations:'src/utils/tripLocations.ts' }
const paths = Object.fromEntries(Object.keys(sources).map(n=>[n,join(directory,n+'.mjs')]))
const replacements = { dexie:import.meta.resolve('dexie'), '../db/database':pathToFileURL(paths.database).href,
  './tripLocations':pathToFileURL(paths.locations).href, './tackleManagement':pathToFileURL(paths.tackles).href, './fishSpecies':pathToFileURL(paths.fish).href, '../data/fishMaster':pathToFileURL(paths.fishMaster).href,'./facilityStorage':pathToFileURL(paths.storage).href,'./facilityMaster':pathToFileURL(paths.master).href,'./calendarDate':pathToFileURL(paths.calendar).href }
for(const [name,path] of Object.entries(sources)) {
  let code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  for(const [from,to] of Object.entries(replacements)) code=code.replaceAll(JSON.stringify(from),JSON.stringify(to)).replaceAll("'"+from+"'",JSON.stringify(to))
  if (name === 'database') code = code.replace('FishingLogDatabase', 'FishingLogRC35IsolatedTest')
  await writeFile(paths[name],code)
}
const {db,validateWeatherObservation}=await import(pathToFileURL(paths.database).href)
const {rc30Fixture}=await import(pathToFileURL(paths.fixture).href)
const {validateBackup,createBackup,importBackup}=await import(pathToFileURL(paths.backup).href)
const {saveTripEvent,deleteTripEvent,parseEventDateTime,eventDateTime,saveTripMemo}=await import(pathToFileURL(paths.events).href)
const {buildTripTimeline,layoutTimelineMarkers,buildCatchSummary}=await import(pathToFileURL(paths.timeline).href)

const {registerCatch,updateCatch,deleteCatch,registerSameAsPrevious}=await import(pathToFileURL(paths.catches).href)
const state=async()=>Object.fromEntries(await Promise.all(db.tables.map(async t=>[t.name,await t.toArray()])))
beforeEach(async()=>{
  await db.transaction('rw',db.tables,async()=>{
    for(const table of db.tables) await table.clear()
    for(const [table,rows] of Object.entries(validateBackup(rc30Fixture()))) if(rows.length) await db.table(table).bulkAdd(rows)
  })
})
after(async()=>{db.close();await rm(directory,{recursive:true,force:true})})
const observation={source:'observed',sky:'cloudy',wind:'strong',changes:['sunHidden','windStronger'],note:'test'}
const input={type:'weather',dateTime:'2026-10-24T10:30',zoneId:'',note:'',weatherObservation:observation}
const json = value => JSON.parse(JSON.stringify(value))

test('trip memo create/update/clear in ongoing and ended trips, stale writes rejected',async()=>{
  const before=await state(), trip=await db.trips.get(13)
  const saved=await saveTripMemo(trip,'line1\nline2')
  assert.equal((await db.trips.get(13)).memo,'line1\nline2')
  await assert.rejects(()=>saveTripMemo(trip,'stale'))
  await saveTripMemo(saved,'')
  await db.trips.update(13,{endedAt:undefined})
  await saveTripMemo(await db.trips.get(13),'ongoing')
  for(const name of Object.keys(before)) if(name!=='trips') assert.deepEqual((await state())[name],before[name])
})

test('weather CRUD, multiple changes, JST/seconds preserved, invalid and stale writes rejected',async()=>{
  const trip=await db.trips.get(13), id=await saveTripEvent(trip,input)
  let row=await db.tripEvents.get(id)
  assert.deepEqual(row.weatherObservation,observation)
  assert.equal(row.occurredAt.toISOString(),'2026-10-24T01:30:00.000Z')
  await saveTripEvent(trip,{...input,dateTime:'2026-10-24T11:00',weatherObservation:{source:'observed',changes:['flowWeaker']}},row)
  await assert.rejects(()=>saveTripEvent(trip,input,row))
  await assert.rejects(()=>deleteTripEvent(row))
  row=await db.tripEvents.get(id)
  assert.deepEqual(row.weatherObservation.changes,['flowWeaker'])
  await deleteTripEvent(row); assert.equal(await db.tripEvents.count(),0)
  for(const value of [undefined,{}, {source:'inherited',changes:['sunHidden']},{source:'observed',changes:[]},{...observation,sky:'fake'},{...observation,changes:['fake']},{...observation,changes:['sunHidden','sunHidden']}]) {
    assert.throws(()=>validateWeatherObservation(value))
    await assert.rejects(()=>saveTripEvent(trip,{...input,weatherObservation:value}))
  }
  for(const dateTime of ['2026-02-30T10:00','2026-10-24T07:00','2026-10-24T16:00','2026-10-25T10:00']) await assert.rejects(()=>saveTripEvent(trip,{...input,dateTime}))
  assert.equal(eventDateTime(parseEventDateTime('2026-10-24T10:30')),'2026-10-24T10:30')
  await db.trips.update(13,{startedAt:new Date('2026-10-24T01:30:40Z'),endedAt:undefined})
  const captured=new Date('2026-10-24T01:30:50Z')
  const exact=await saveTripEvent(await db.trips.get(13),{...input,initialOccurredAt:captured})
  assert.equal((await db.tripEvents.get(exact)).occurredAt.getTime(),captured.getTime())
})

test('optional catch/lost observation edits, clear, no implicit previous condition copy, atomic failure',async()=>{
  await db.trips.update(13,{endedAt:undefined})
  const base={tripId:13,caughtAt:new Date('2026-10-24T03:00:00Z')}, lure={kind:'manual',lureName:'test',lureColor:'test'}
  const plain=await registerCatch(base,lure)
  assert.equal((await db.catches.get(plain)).weatherObservation,undefined)
  const id=await registerCatch({...base,resultType:'lost',lostDistance:'near',weatherObservation:observation},lure)
  let row=await db.catches.get(id)
  assert.deepEqual(row.weatherObservation,observation)
  const copy=await registerSameAsPrevious(13,new Date('2026-10-24T04:00:00Z'))
  assert.equal((await db.catches.get(copy)).weatherObservation,undefined)
  await db.trips.update(13,{endedAt:new Date('2026-10-24T06:00:00Z')})
  await updateCatch(id,{...row,caughtAt:new Date('2026-10-24T03:30:00Z'),weatherObservation:{source:'observed',changes:['rainStarted']}},undefined,row)
  row=await db.catches.get(id)
  const marker=buildTripTimeline(await db.trips.get(13),[row],[],[]).markers.find(m=>m.kind==='weather')
  assert.equal(marker.timestamp,row.caughtAt.getTime());assert.equal(marker.record.id,id)
  await updateCatch(id,{...row,weatherObservation:undefined},undefined,row)
  assert.equal((await db.catches.get(id)).weatherObservation,undefined)
  assert.equal(buildTripTimeline(await db.trips.get(13),[await db.catches.get(id)],[],[]).markers.filter(m=>m.kind==='weather').length,0)
  const snapshot=await state()
  await assert.rejects(async()=>updateCatch(id,{...await db.catches.get(id),weatherObservation:{source:'inherited',changes:['sunHidden']}},lure))
  assert.deepEqual(await state(),snapshot)
  await deleteCatch(id,13);assert.equal(await db.catches.get(id),undefined)
})

test('same-time markers occupy separate 44px collision lanes without double persistence',async()=>{
  const trip=await db.trips.get(13)
  await saveTripEvent(trip,input);await saveTripEvent(trip,input)
  await db.catches.update(1,{weatherObservation:observation,caughtAt:parseEventDateTime(input.dateTime)})
  const model=buildTripTimeline(trip,await db.catches.toArray(),await db.tripEvents.toArray(),[])
  const weather=model.markers.filter(m=>m.kind==='weather')
  assert.equal(weather.length,3);assert.equal(await db.tripEvents.count(),2)
  const placed=layoutTimelineMarkers(weather,model.range.start,model.range.end,390).markers
  assert.equal(new Set(placed.map(p=>p.y)).size,3)
  assert.equal(new Set(placed.map(p=>p.x)).size,1)
})

test('weather expands hourly bounds without catches, preserving totals and duration semantics', async()=>{
  const trip={...await db.trips.get(13),endedAt:undefined}
  const time=Date.parse('2026-10-24T05:30:00Z')
  const summary=buildCatchSummary(trip,[], 'all', true, undefined, [time])
  assert.equal(summary.total,0);assert.equal(summary.pace,null)
  assert.ok(summary.bins.some(bin=>bin.timestamp<=time && time<bin.timestamp+3600000))
  assert.ok(summary.bins.every(bin=>bin.count===0))
})

test('v7 stays v7; v10 validation and repeated restore preserve original rows and observations',async()=>{
  assert.equal((await createBackup()).version,7)
  const trip=await db.trips.get(13);await saveTripMemo(trip,'memo\nsecond line')
  await saveTripEvent(await db.trips.get(13),input)
  await db.catches.update(1,{weatherObservation:observation})
  const before=json(await state()), backup=json(await createBackup())
  assert.equal(backup.version,10)
  for(let i=0;i<2;i++) {
    await importBackup(new File([JSON.stringify(backup)],'isolated.json'))
    const actual=json(await state())
    for(const name of Object.keys(before)) if(name!=='lureMasterImportHistory') assert.deepEqual(actual[name],before[name],name)
  }
  const beforeInvalid=json(await state()), bad=structuredClone(backup)
  bad.data.tripEvents[0].weatherObservation.source='inherited'
  await assert.rejects(()=>importBackup(new File([JSON.stringify(bad)],'invalid.json')))
  assert.deepEqual(json(await state()),beforeInvalid)
})

test('provided Tamako backup is read-only input; isolated v8/v10 roundtrip retains every master, personal row and ID', { skip: !existsSync('docs/rc35/Tamako_fishing-log-backup-2026-11-03.json') },async()=>{
  const path='docs/rc35/Tamako_fishing-log-backup-2026-11-03.json'
  const text=await readFile(path,'utf8'), backup=JSON.parse(text), restored=validateBackup(backup)
  await db.transaction('rw',db.tables,async()=>{
    for(const table of db.tables) await table.clear()
    for(const [name,rows] of Object.entries(restored)) if(rows.length) await db.table(name).bulkAdd(rows)
  })
  const before=json(await state()), trip=(await db.trips.toArray()).at(-1)
  await saveTripMemo(trip,(trip.memo??'')+'\nRC35 isolated test')
  const time=eventDateTime(new Date(Math.ceil(new Date(trip.startedAt).getTime()/60000)*60000))
  await saveTripEvent(await db.trips.get(trip.id),{...input,dateTime:time})
  const expected=json(await state()), upgraded=json(await createBackup())
  assert.equal(upgraded.version,10)
  await importBackup(new File([JSON.stringify(upgraded)],'isolated-tamako.json'))
  const after=json(await state())
  for(const name of Object.keys(expected)) if(name!=='lureMasterImportHistory') assert.deepEqual(after[name],expected[name],name)
  for(const name of Object.keys(before)) if(!['trips','tripEvents','lureMasterImportHistory'].includes(name)) assert.deepEqual(after[name],before[name],name)
  assert.equal(await readFile(path,'utf8'),text)
  console.log('Tamako source counts',JSON.stringify(Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.length]))))
})
