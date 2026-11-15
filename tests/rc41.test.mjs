import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test, beforeEach, after } from 'node:test'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const directory=await mkdtemp(join(tmpdir(),'fishing-rc41-'))
const sources={database:'db/database.ts',geometry:'utils/areaMapGeometry.ts',maps:'utils/areaMaps.ts',events:'utils/tripEvents.ts',locations:'utils/tripLocations.ts',calendar:'utils/calendarDate.ts',master:'utils/facilityMaster.ts',storage:'utils/facilityStorage.ts',backup:'utils/backup.ts',timeline:'utils/tripTimeline.ts'}
const paths=Object.fromEntries(Object.keys(sources).map(n=>[n,join(directory,n+'.mjs')]))
const replacements={'dexie':import.meta.resolve('dexie'),'../db/database':pathToFileURL(paths.database).href,'./tripLocations':pathToFileURL(paths.locations).href,'./facilityStorage':pathToFileURL(paths.storage).href,'./facilityMaster':pathToFileURL(paths.master).href,'./calendarDate':pathToFileURL(paths.calendar).href}
for(const [name,path] of Object.entries(sources)){
 let code=ts.transpileModule(await readFile('src/'+path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
 for(const [from,to] of Object.entries(replacements))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to)).replaceAll("'"+from+"'",JSON.stringify(to))
 if(name==='database')code=code.replace('FishingLogDatabase','FishingLogRC41Isolated')
 await writeFile(paths[name],code)
}
const {db,validMapOutline,shorePoint,nearestShore,validateAreaMap,validateFishingPosition}=await import(pathToFileURL(paths.database).href)
const {mapTemplates,mapTemplate,transformMapOutline,normalizedMapPoint}=await import(pathToFileURL(paths.geometry).href)
const {saveAreaMap,retireAreaMap}=await import(pathToFileURL(paths.maps).href)
const {saveTripEvent,deleteTripEvent}=await import(pathToFileURL(paths.events).href)
const {createBackup,importBackup,validateBackup}=await import(pathToFileURL(paths.backup).href)
const {buildTripTimeline}=await import(pathToFileURL(paths.timeline).href)
const now='2026-11-15T00:00:00.000Z'
const map=()=>({id:'map-test',facilityId:'user:f',zoneId:'user:z',name:'First pond',waterType:'pond',templateId:'P01',outline:mapTemplate('P01'),features:[],revision:1,createdAt:now,updatedAt:now})
const position=m=>({mapId:m.id,snapshot:structuredClone(m),anchor:{segment:0,t:.35},position:shorePoint(m.outline,{segment:0,t:.35})})
const all=async()=>Object.fromEntries(await Promise.all(db.tables.map(async t=>[t.name,await t.toArray()])))
const json=v=>JSON.parse(JSON.stringify(v))
beforeEach(async()=>{await db.transaction('rw',db.tables,async()=>{for(const t of db.tables)await t.clear();await db.facilities.add({id:'user:f',name:'Facility',origin:'user'});await db.zones.add({id:'user:z',name:'Zone',origin:'user',facilityId:'user:f'});await db.trips.add({id:1,facilityId:'user:f',fishingAreaName:'Facility',fishingDate:'2026-11-15',startedAt:new Date(now)});await db.catches.add({id:1,tripId:1,caughtAt:new Date(now),lureName:'legacy'})})})
after(async()=>{db.close();for(const path of Object.values(paths))await unlink(path);await rmdir(directory)})

test('RC41 v10 to v11 upgrade preserves all 22 existing stores and sparse IDs, adds only an empty map store',async()=>{
 const Dexie=(await import('dexie')).default,legacyName='FishingLogRC41MigrationIsolated',legacy=new Dexie(legacyName)
 const schema=Object.fromEntries(db.tables.filter(t=>t.name!=='areaMaps').map(t=>[t.name,[t.schema.primKey.src,...t.schema.indexes.map(i=>i.src)].join(',')]))
 legacy.version(10).stores(schema)
 await legacy.open()
 for(const t of legacy.tables){const keys=Array.isArray(t.schema.primKey.keyPath)?t.schema.primKey.keyPath:[t.schema.primKey.keyPath];await t.add(Object.fromEntries(keys.map(k=>[k,k==='key'?'fixture':k==='fish_id'?'F-test':k==='tripId'||k==='timestamp'||t.schema.primKey.auto?900:'fixture-id'])))}
 const before=Object.fromEntries(await Promise.all(legacy.tables.map(async t=>[t.name,await t.toArray()])))
 legacy.close()
 const migrationPath=join(directory,'migration.mjs');paths.migration=migrationPath
 const source=(await readFile(paths.database,'utf8')).replace('FishingLogRC41Isolated',legacyName)
 await writeFile(migrationPath,source)
 const {db:upgraded}=await import(pathToFileURL(migrationPath).href)
 try{await upgraded.open();assert.equal(upgraded.verno,11);assert.equal(upgraded.tables.length,23);assert.equal(await upgraded.areaMaps.count(),0)
  for(const [name,rows] of Object.entries(before)){assert.deepEqual(await upgraded.table(name).toArray(),rows);assert.equal([upgraded.table(name).schema.primKey.src,...upgraded.table(name).schema.indexes.map(i=>i.src)].join(','),schema[name])}
  assert.ok(await upgraded.catches.add({tripId:900,caughtAt:new Date(now)})>900)
 }finally{upgraded.close();await upgraded.delete()}
})

for(const [id] of mapTemplates)test(`RC41 template ${id} is a bounded simple water polygon with continuous shore snapping`,()=>{
 const outline=mapTemplate(id);assert.equal(validMapOutline(outline),true)
 for(const p of [{x:0,y:0},{x:.37,y:.58},{x:1,y:1}]){const anchor=nearestShore(outline,p),q=shorePoint(outline,anchor);assert.ok(q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1)}
 for(const kind of ['rotate','flip'])assert.equal(validMapOutline(transformMapOutline(outline,kind)),true)
})
test('RC41 normalized coordinates, exact nearest corners/ellipse approximation and invalid crossing/tiny polygons',()=>{
 assert.deepEqual(normalizedMapPoint(-3,4),{x:.02,y:.98})
 const outline=mapTemplate('P01'),anchor=nearestShore(outline,{x:.333,y:.23}),p=shorePoint(outline,anchor)
 assert.ok(Math.abs(p.x-.333)<1e-9);assert.equal(p.y,.25)
 assert.deepEqual(shorePoint(outline,nearestShore(outline,{x:0,y:0})),{x:.12,y:.25})
 assert.equal(validMapOutline([{x:.1,y:.1},{x:.9,y:.9},{x:.1,y:.9},{x:.9,y:.1}]),false)
 assert.equal(validMapOutline([{x:.4,y:.4},{x:.41,y:.4},{x:.4,y:.41}]),false)
 assert.equal(validMapOutline([{x:NaN,y:.1},{x:.2,y:.4},{x:.4,y:.1}]),false)
})
test('RC41 map CRUD, same-name rejection, optimistic conflicts and independent trip reuse',async()=>{
 const before=await all(),m=await saveAreaMap(map())
 const changed=await saveAreaMap({...m,name:'Renamed',outline:transformMapOutline(m.outline,'rotate')},m)
 assert.equal(changed.id,m.id);assert.equal(changed.revision,2)
 await assert.rejects(saveAreaMap({...m,name:'stale'},m))
 await assert.rejects(saveAreaMap({...map(),id:'duplicate-zone',zoneId:''},undefined,'Zone'))
 assert.equal(await db.zones.count(),1)
 const added=await saveAreaMap({...map(),id:'second',zoneId:'',name:'New area'},undefined,'New area')
 assert.notEqual(added.zoneId,'user:z');assert.equal((await db.zones.get(added.zoneId)).facilityId,'user:f')
 await retireAreaMap(changed);assert.ok((await db.areaMaps.get(m.id)).deletedAt)
 await db.trips.add({id:2,facilityId:'user:f',fishingAreaName:'Facility',fishingDate:'2026-11-15',startedAt:new Date(now)})
 assert.equal((await db.areaMaps.where('facilityId').equals('user:f').toArray()).length,2)
 const afterState=await all();for(const key of Object.keys(before))if(!['trips','zones','areaMaps'].includes(key))assert.deepEqual(afterState[key],before[key])
})
test('RC41 inlet/outlet anchoring survives outline transforms, moves/deletes and invalid anchors roll back',async()=>{
 let m=map();m.features=[{id:'in',type:'inlet',anchor:{segment:0,t:.2},label:'Flow',memo:'note'},{id:'out',type:'outlet',anchor:{segment:2,t:.7}}]
 m=await saveAreaMap(m);const saved=structuredClone(m)
 m=await saveAreaMap({...m,outline:transformMapOutline(m.outline,'rotate')},m)
 assert.deepEqual(m.features,saved.features);assert.notDeepEqual(shorePoint(m.outline,m.features[0].anchor),shorePoint(saved.outline,saved.features[0].anchor))
 const invalid=structuredClone(m);invalid.features[0].anchor.segment=999;const before=await all();await assert.rejects(saveAreaMap(invalid,m));assert.deepEqual(await all(),before)
 const next=await saveAreaMap({...m,features:[{...m.features[0],anchor:{segment:1,t:.4}}]},m);assert.equal(next.features.length,1);validateAreaMap(next)
})
test('RC41 event CRUD, immutable snapshot after map edit/deletion, correct IDs, no ownership/catch mutations',async()=>{
 const m=await saveAreaMap(map()),trip=await db.trips.get(1),before=await all()
 const input={type:'position',dateTime:'2026-11-15T10:00',zoneId:m.zoneId,note:'seat',fishingPosition:{...position(m),castDirection:270}}
 const id=await saveTripEvent(trip,input);let event=await db.tripEvents.get(id)
 assert.equal(event.fishingPosition.mapId,m.id);assert.equal(event.facilityId,m.facilityId)
 const changed=await saveAreaMap({...m,name:'Later',outline:transformMapOutline(m.outline,'rotate')},m);await retireAreaMap(changed)
 await saveTripEvent(trip,{...input,dateTime:'2026-11-15T10:01',note:'edit old snapshot'},event)
 event=await db.tripEvents.get(id);assert.deepEqual(event.fishingPosition,input.fishingPosition)
  const moved={...event.fishingPosition,anchor:{segment:2,t:.6},position:shorePoint(event.fishingPosition.snapshot.outline,{segment:2,t:.6}),castDirection:45}
  await saveTripEvent(trip,{...input,dateTime:'2026-11-15T10:01',fishingPosition:moved},event)
  event=await db.tripEvents.get(id);assert.deepEqual(event.fishingPosition,moved)
 await assert.rejects(saveTripEvent(trip,input))
 const model=buildTripTimeline(trip,[],[event],[]);assert.equal(model.markers[0].kind,'position')
 assert.deepEqual((await all()).catches,before.catches);assert.deepEqual((await all()).myLures,before.myLures)
 await deleteTripEvent(event);assert.equal(await db.tripEvents.count(),0)
})
test('RC41 absent/invalid position, wrong facility, stale maps and mismatched coordinates are rejected atomically',async()=>{
 const m=await saveAreaMap(map()),trip=await db.trips.get(1),input={type:'position',dateTime:'2026-11-15T10:00',zoneId:m.zoneId,note:''}
 const before=await all()
 for(const p of [undefined,{}, {...position(m),position:{x:.5,y:.5}}, {...position(m),castDirection:360},{...position(m),anchor:{segment:99,t:0}}]){
  await assert.rejects(saveTripEvent(trip,{...input,fishingPosition:p}));assert.deepEqual(await all(),before)
 }
 await db.trips.update(1,{facilityId:undefined});await assert.rejects(saveTripEvent(await db.trips.get(1),{...input,fishingPosition:position(m)}))
})
test('RC41 v12 round trip, repeated restore, malformed map rollback and legacy restore retain independent maps',async()=>{
 const m=await saveAreaMap(map()),trip=await db.trips.get(1)
 await saveTripEvent(trip,{type:'position',dateTime:'2026-11-15T10:00',zoneId:m.zoneId,note:'',fishingPosition:position(m)})
 const backup=json(await createBackup());assert.equal(backup.version,12);const before=await all()
 const restore=v=>importBackup({text:async()=>JSON.stringify(v)})
 await restore(backup);assert.equal(await db.areaMaps.count(),1);await restore(backup);assert.equal(await db.areaMaps.count(),1)
 assert.deepEqual(await db.catches.toArray(),before.catches);assert.deepEqual(await db.myLures.toArray(),before.myLures)
 const bad=structuredClone(backup);bad.data.areaMaps[0].outline[0].x=2;const stable=await all();await assert.rejects(restore(bad));assert.deepEqual(await all(),stable)
 const collision=structuredClone(backup);collision.data.areaMaps[0].zoneId='user:other';collision.data.zones.push({id:'user:other',facilityId:'user:f',origin:'user',name:'Other'});await assert.rejects(restore(collision));assert.deepEqual(await all(),stable)
 const old=structuredClone(backup);old.version=11;delete old.data.areaMaps;old.data.tripEvents=[];validateBackup(old);await restore(old);assert.equal(await db.areaMaps.count(),1)
 const missing=structuredClone(backup);missing.data.areaMaps=[];validateBackup(missing)
 assert.throws(()=>validateFishingPosition({...position(m),castDirection:NaN}))
})
