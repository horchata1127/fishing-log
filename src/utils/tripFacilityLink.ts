import { db, type FishingTrip } from '../db/database'

const tables = [db.trips, db.catches, db.facilities, db.zones]
export interface FacilityLinkPreview {
  trip: FishingTrip
  facility: { id: string; name: string }
  affected: { id?: number; result: string; zoneId?: string; zoneName: string; facilityName: string }[]
  clearCurrentZone: boolean
  stateKey: string
}
export async function listLinkableFacilities() {
  return (await db.facilities.toArray()).filter(f => f.origin === 'official' && f.catalogState === 'listed' && typeof f.name === 'string' && !!f.name.trim())
    .map(f => ({ id: f.id, name: f.name as string })).sort((a,b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id))
}
async function inspect(tripId: number, facilityId: string): Promise<FacilityLinkPreview> {
  const trip = await db.trips.get(tripId), facility = await db.facilities.get(facilityId)
  if (!trip) throw new Error('釣行が見つかりません。')
  if (!facility || facility.origin !== 'official' || facility.catalogState !== 'listed' || typeof facility.name !== 'string' || !facility.name.trim()) throw new Error('配布中の正式施設を選択してください。')
  const catches = await db.catches.where('tripId').equals(tripId).sortBy('id')
  const zones = await db.zones.toArray(), byId = new Map(zones.map(z => [z.id,z]))
  const affected = catches.filter(c => c.zoneId ? byId.get(c.zoneId)?.facilityId !== facilityId || c.facilityId !== facilityId :
    !!c.locationSnapshot?.zoneName && c.facilityId !== facilityId).map(c => ({ id:c.id, result: c.resultType === 'lost' ? 'バラシ' : '釣果', zoneId:c.zoneId,
      zoneName:c.locationSnapshot?.zoneName || (c.zoneId && typeof byId.get(c.zoneId)?.name === 'string' ? byId.get(c.zoneId)!.name as string : undefined) || '名称未記録', facilityName:c.locationSnapshot?.facilityName || c.facilityId || '所属未確認' }))
  const clearCurrentZone = !!trip.currentZoneId && byId.get(trip.currentZoneId)?.facilityId !== facilityId
  return { trip, facility:{ id:facility.id, name:facility.name }, affected, clearCurrentZone,
    stateKey:JSON.stringify({ trip, catches, zones, facility }) }
}
export async function previewTripFacilityLink(tripId: number, facilityId: string) {
  return db.transaction('r', tables, () => inspect(tripId,facilityId))
}
export async function saveTripFacilityLink(preview: FacilityLinkPreview, confirmed: boolean) {
  return db.transaction('rw', tables, async () => {
    const current = await inspect(preview.trip.id!,preview.facility.id)
    if (current.stateKey !== preview.stateKey) throw new Error('釣行・釣果・マスターが変更されました。選択し直して影響を再確認してください。')
    if ((current.affected.length || current.clearCurrentZone) && !confirmed) throw new Error('旧施設のエリアと現在エリアへの影響を確認してください。')
    await db.trips.update(current.trip.id!, { facilityId:current.facility.id, fishingAreaName:current.facility.name,
      ...(current.clearCurrentZone ? { currentZoneId:undefined } : {}) })
    return (await db.trips.get(current.trip.id!))!
  })
}
