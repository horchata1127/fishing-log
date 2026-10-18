import { db, validateWeatherLocation, type FishingTrip, type TripWeatherLocation } from '../db/database'

export interface ReusableWeatherLocation {
  sourceTripId: number
  facilityId: string
  latitude: number
  longitude: number
  sourceUpdatedAt: string
  sourceStartedAt: string
  sourceName: string
  uses: number
}
function matches(target: FishingTrip, source: FishingTrip | undefined, location: TripWeatherLocation) {
  if (!target.facilityId || !source || source.id === target.id || source.facilityId !== target.facilityId || location.facilityId !== target.facilityId) return false
  try { validateWeatherLocation(location) } catch { return false }
  const before = new Date(source.startedAt).getTime(), after = new Date(target.startedAt).getTime()
  return Number.isFinite(before) && Number.isFinite(after) && before < after
}
export async function findReusableWeatherLocations(tripId: number): Promise<ReusableWeatherLocation[]> {
  return db.transaction('r', [db.trips, db.tripWeatherLocations], async () => {
    const target = await db.trips.get(tripId)
    if (!target?.facilityId || await db.tripWeatherLocations.get(tripId)) return []
    const trips = new Map((await db.trips.toArray()).map(t => [t.id, t]))
    const groups = new Map<string, ReusableWeatherLocation>()
    for (const location of await db.tripWeatherLocations.toArray()) {
      const source = trips.get(location.tripId)
      if (!matches(target, source, location)) continue
      const key = JSON.stringify([location.latitude, location.longitude]), previous = groups.get(key)
      const candidate: ReusableWeatherLocation = { sourceTripId: location.tripId, facilityId: target.facilityId, latitude: location.latitude, longitude: location.longitude,
        sourceUpdatedAt: location.updatedAt, sourceStartedAt: new Date(source!.startedAt).toISOString(), sourceName: source!.fishingAreaName, uses: (previous?.uses ?? 0) + 1 }
      if (!previous || candidate.sourceUpdatedAt > previous.sourceUpdatedAt || (candidate.sourceUpdatedAt === previous.sourceUpdatedAt && candidate.sourceTripId > previous.sourceTripId)) groups.set(key, candidate)
      else previous.uses++
    }
    return [...groups.values()].sort((a, b) => b.sourceUpdatedAt.localeCompare(a.sourceUpdatedAt) || b.sourceTripId - a.sourceTripId)
  })
}
export async function reuseWeatherLocation(tripId: number, candidate: ReusableWeatherLocation) {
  return db.transaction('rw', [db.trips, db.tripWeatherLocations], async () => {
    const target = await db.trips.get(tripId), source = await db.trips.get(candidate.sourceTripId), location = await db.tripWeatherLocations.get(candidate.sourceTripId)
    if (!target || !location || await db.tripWeatherLocations.get(tripId) || !matches(target, source, location) ||
        target.facilityId !== candidate.facilityId || location.updatedAt !== candidate.sourceUpdatedAt || location.latitude !== candidate.latitude || location.longitude !== candidate.longitude ||
        new Date(source!.startedAt).toISOString() !== candidate.sourceStartedAt) throw new Error('以前の地点・施設・釣行が変更されたか、この釣行には地点が保存済みです。候補を確認し直してください。')
    // Existing schema remains manual: this is an explicit user choice, not a master-derived location.
    const copied: TripWeatherLocation = { tripId, latitude: location.latitude, longitude: location.longitude, locationSource: 'manual', coordinateSystem: 'WGS84',
      facilityId: target.facilityId!, facilityName: target.fishingAreaName, updatedAt: new Date().toISOString() }
    validateWeatherLocation(copied); await db.tripWeatherLocations.add(copied)
    return copied
  })
}
