import { readFileSync } from 'node:fs'
import { rc43Fixture } from './rc43Fixture'
import { rc45RodioCatalog } from '../src/data/rc45RodioCatalog'
import { lureMasterManifest } from '../src/data/lureMasterManifest'
export const rc45Manifest={...lureMasterManifest,targets:lureMasterManifest.targets.filter(t=>t.revisions.includes('RC45')),pending:[]}
export const rc45Total=rc45RodioCatalog.reduce((n,t)=>n+t.colors.length,0)
export function rc45Fixture(){
 const f=rc43Fixture(),baseline=JSON.parse(readFileSync('docs/rodio-driftspin-bf/BASELINE.json','utf8'))
 const maker=f.data.lureManufacturers.find((m:any)=>m.name==='RODIO CRAFT')!
 f.data.lureSeries.push({id:100,name:'BF',manufacturerId:maker.id},{id:97,name:'DRIFT SPIN',manufacturerId:maker.id})
 for(const row of baseline.models){f.data.lureModels.push({...row.model});f.data.lureVariants.push(...row.variants)}
 // Synthetic personal rows exercise preservation; they never describe the user's catches.
 f.data.myLures.push({id:2,variantId:289,active:true,ownershipStatus:'owned'})
 f.data.catches.push({id:2,tripId:1,caughtAt:'2026-11-21T02:00:00.000Z',lureId:2,lureVariantId:289,lureName:'記録時のドリフト',lureColor:'草色'})
 return f
}
