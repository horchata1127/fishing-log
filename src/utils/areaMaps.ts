import { db, validateAreaMap, type AreaMap } from '../db/database'
import { addUserZone } from './tripLocations'

export async function saveAreaMap(draft: AreaMap, original?: AreaMap, newZoneName?: string, tripId?: number) {
  return db.transaction('rw',[db.areaMaps,db.facilities,db.zones,db.appMetadata,db.trips],async()=>{
    const current=await db.areaMaps.get(draft.id)
    if (original ? !current || JSON.stringify(current)!==JSON.stringify(original) : !!current) throw new Error('マップが変更されました。開き直してください。')
    const record=structuredClone(draft)
    if (newZoneName) record.zoneId=await addUserZone(record.facilityId,newZoneName,tripId)
    const facility=await db.facilities.get(record.facilityId),zone=await db.zones.get(record.zoneId)
    if (!facility || !zone || zone.facilityId!==record.facilityId || original && (record.facilityId!==original.facilityId || record.zoneId!==original.zoneId)) throw new Error('マップの施設・エリアを確認してください。')
    record.revision=(original?.revision??0)+1;record.updatedAt=new Date().toISOString()
    validateAreaMap(record)
    await db.areaMaps.put(record)
    return record
  })
}
export async function retireAreaMap(original: AreaMap) {
  return db.transaction('rw',db.areaMaps,async()=>{
    const current=await db.areaMaps.get(original.id)
    if (!current || JSON.stringify(current)!==JSON.stringify(original)) throw new Error('マップが変更されました。開き直してください。')
    await db.areaMaps.update(original.id,{deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:original.revision+1})
  })
}
