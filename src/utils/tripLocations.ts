import { db, type FishingTrip, type CatchRecord } from '../db/database'
import { validateFacilityStorage, readFacilityStorage } from './facilityStorage'

export interface LocationChoice { id: string; name: string; origin: 'official' | 'user'; retired: boolean }
export interface CatchLocationSelection {
  expectedFacilityId: string | undefined
  expectedCurrentZoneId: string | undefined
  zoneId: string | undefined
}
const retired = (row: { origin: string; catalogState?: unknown }) => row.origin === 'official' && row.catalogState === 'retired'
const label = (row: { id: string; name?: unknown; origin: 'official' | 'user'; catalogState?: unknown }): LocationChoice => {
  if (typeof row.name !== 'string' || !row.name.trim()) throw new Error('施設・エリアの名称が不正です。')
  if (!['official', 'user'].includes(row.origin) || !row.id.startsWith(`${row.origin}:`) || (row.origin === 'official' && !['listed', 'retired'].includes(row.catalogState as string))) throw new Error('施設・エリアの登録状態が不正です。')
  return { id: row.id, name: row.name, origin: row.origin, retired: retired(row) }
}
function name(value: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('名称を入力してください。')
  return value.trim()
}
const normalized = (value: string) => value.normalize('NFC').toLocaleLowerCase('ja-JP')

export async function loadLocationChoices(facilityId?: string, retainedZoneId?: string, allowUnresolvedRetained = false) {
  return db.transaction('r', [db.facilities, db.zones], async () => {
    const facilities = (await db.facilities.toArray()).filter(f => !retired(f)).map(label)
    const facility = facilityId ? await db.facilities.get(facilityId) : undefined
    if (facilityId && !facility) throw new Error('施設の参照先がありません。保存できません。')
    const allZones = facilityId ? await db.zones.where('facilityId').equals(facilityId).toArray() : []
    if (retainedZoneId && !allowUnresolvedRetained && !allZones.some(z => z.id === retainedZoneId)) throw new Error('現在エリアの参照先・所属が不正です。')
    const zones = allZones.filter(z => !retired(z) || z.id === retainedZoneId).sort((a,b) =>
      Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.id.localeCompare(b.id)).map(label)
    return { facilities, facility: facility ? label(facility) : undefined, zones }
  })
}

export async function addUserFacility(value: string): Promise<string> {
  const displayName = name(value), id = `user:${crypto.randomUUID()}`
  return db.transaction('rw', [db.facilities, db.zones, db.appMetadata], async () => {
    const current = validateFacilityStorage(await readFacilityStorage())
    if (current.facilities.some(f => normalized(name(f.name as string)) === normalized(displayName))) throw new Error('同じ名称の施設が登録されています。候補から選択してください。')
    const record = { id, name: displayName, origin: 'user' as const }
    validateFacilityStorage({ ...current, facilities: [...current.facilities, record] })
    await db.facilities.add(record)
    return id
  })
}
export async function addUserZone(facilityId: string, value: string, continuationTripId?: number): Promise<string> {
  const displayName = name(value), id = `user:${crypto.randomUUID()}`
  return db.transaction('rw', [db.facilities, db.zones, db.appMetadata, db.trips], async () => {
    const current = validateFacilityStorage(await readFacilityStorage()), parent = current.facilities.find(f => f.id === facilityId)
    if (!parent) throw new Error('施設の参照先がありません。')
    if (retired(parent)) {
      const trip = continuationTripId === undefined ? undefined : await db.trips.get(continuationTripId)
      if (!trip || trip.endedAt || trip.facilityId !== facilityId) throw new Error('退役施設への新しい選択はできません。')
    }
    if (current.zones.some(z => z.facilityId === facilityId && normalized(name(z.name as string)) === normalized(displayName))) throw new Error('この施設に同じ名称のエリアが登録されています。')
    const record = { id, name: displayName, origin: 'user' as const, facilityId }
    validateFacilityStorage({ ...current, zones: [...current.zones, record] })
    await db.zones.add(record)
    return id
  })
}

/** Call inside the trip/catch write transaction, which locks both referenced stores. */
export async function locationSnapshot(trip: FishingTrip, zoneId: string | undefined): Promise<Pick<CatchRecord, 'facilityId' | 'zoneId' | 'locationSnapshot'>> {
  if (trip.facilityId === undefined) {
    if (zoneId !== undefined || trip.currentZoneId !== undefined) throw new Error('エリアには施設の指定が必要です。')
    return {}
  }
  const facility = await db.facilities.get(trip.facilityId)
  if (!facility) throw new Error('施設の参照先がありません。保存できません。')
  const facilityName = label(facility).name
  const zone = zoneId === undefined ? undefined : await db.zones.get(zoneId)
  if (zoneId !== undefined && (!zone || zone.facilityId !== trip.facilityId)) throw new Error('エリアの参照先・所属が不正です。')
  if (zone && retired(zone) && zone.id !== trip.currentZoneId) throw new Error('退役エリアは現在継続中の参照だけ使用できます。')
  return { facilityId: trip.facilityId, ...(zone ? { zoneId: zone.id } : {}),
    locationSnapshot: { facilityName, ...(zone ? { zoneName: label(zone).name } : {}) } }
}
export async function validateNewTripLocation(trip: FishingTrip) {
  await locationSnapshot(trip, trip.currentZoneId)
  if (trip.facilityId && retired((await db.facilities.get(trip.facilityId))!)) throw new Error('退役施設は新規釣行に選択できません。')
  if (trip.currentZoneId && retired((await db.zones.get(trip.currentZoneId))!)) throw new Error('退役エリアは新規釣行に選択できません。')
}
export async function resolveCatchLocation(trip: FishingTrip, selection?: CatchLocationSelection) {
  if (selection && (selection.expectedFacilityId !== trip.facilityId || selection.expectedCurrentZoneId !== trip.currentZoneId)) throw new Error('別の画面で現在エリアが変わりました。釣果画面を開き直して選択してください。')
  await locationSnapshot(trip, trip.currentZoneId)
  // Passing undefined explicitly means clear this catch only, not use the trip default.
  return locationSnapshot({ ...trip }, selection ? selection.zoneId : trip.currentZoneId)
}
export async function changeCurrentZone(tripId: number, zoneId: string | undefined, expectedZoneId: string | undefined) {
  return db.transaction('rw', [db.trips, db.facilities, db.zones], async () => {
    const trip = await db.trips.get(tripId)
    if (!trip || trip.endedAt) throw new Error('釣行が存在しないか終了しています。')
    if (trip.currentZoneId !== expectedZoneId) throw new Error('別の画面で現在エリアが変わりました。開き直してください。')
    await locationSnapshot(trip, trip.currentZoneId) // Never silently repair a missing current reference, even when clearing.
    await locationSnapshot(trip, zoneId)
    await db.trips.update(tripId, { currentZoneId: zoneId })
  })
}
