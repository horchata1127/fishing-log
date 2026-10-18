import { db, isCatch, type FishingTrip } from '../db/database'

export interface TripDeletionSummary {
  trip: FishingTrip & { id: number }
  catchCount: number
  lostCount?: number
  eventCount: number
  weatherHourCount?: number
  weatherRequestId?: number
  weatherLocationUpdatedAt?: string
}

function requireTripId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('釣行IDが不正です。')
}

async function readSummary(id: number): Promise<TripDeletionSummary> {
  const trip = await db.trips.get(id)
  if (!trip) throw new Error('この釣行は存在しないか、削除済みです。')
  const records = await db.catches.where('tripId').equals(id).toArray()
  const catchCount = records.filter(isCatch).length
  const lostCount = records.length - catchCount
  const eventCount = await db.tripEvents.where('tripId').equals(id).count()
  const weatherHourCount = await db.tripWeatherHours.where('tripId').equals(id).count()
  const latestRequest = (await db.tripWeatherRequests.where('tripId').equals(id).sortBy('id')).at(-1)
  const location = await db.tripWeatherLocations.get(id)
  return { trip: { ...trip, id }, catchCount, ...(lostCount ? { lostCount } : {}), eventCount,
    ...(weatherHourCount ? { weatherHourCount } : {}), ...(latestRequest ? { weatherRequestId: latestRequest.id } : {}),
    ...(location ? { weatherLocationUpdatedAt: location.updatedAt } : {}) }
}

/** Confirmation reads the persisted counts without changing any record. */
export async function getTripDeletionSummary(id: number): Promise<TripDeletionSummary> {
  requireTripId(id)
  return db.transaction('r', [db.trips, db.catches, db.tripEvents, db.tripWeatherLocations, db.tripWeatherHours, db.tripWeatherRequests], () => readSummary(id))
}

/** Only the selected trip and its child records belong to this transaction. */
export async function deleteFishingTrip(id: number, expected: TripDeletionSummary): Promise<void> {
  requireTripId(id)
  if (expected.trip.id !== id) throw new Error('削除対象の釣行が一致しません。')
  await db.transaction('rw', [db.trips, db.catches, db.tripEvents, db.tripWeatherLocations, db.tripWeatherHours, db.tripWeatherRequests], async () => {
    const current = await readSummary(id)
    if (current.catchCount !== expected.catchCount || current.lostCount !== expected.lostCount || current.eventCount !== expected.eventCount ||
        current.trip.fishingAreaName !== expected.trip.fishingAreaName || current.trip.fishingDate !== expected.trip.fishingDate ||
        current.trip.endedAt?.getTime() !== expected.trip.endedAt?.getTime() || current.weatherHourCount !== expected.weatherHourCount ||
        current.weatherRequestId !== expected.weatherRequestId || current.weatherLocationUpdatedAt !== expected.weatherLocationUpdatedAt) {
      throw new Error('確認後に釣行の内容が変わりました。キャンセルして確認し直してください。')
    }
    await db.catches.where('tripId').equals(id).delete()
    await db.tripEvents.where('tripId').equals(id).delete()
    await db.tripWeatherHours.where('tripId').equals(id).delete()
    await db.tripWeatherRequests.where('tripId').equals(id).delete()
    await db.tripWeatherLocations.delete(id)
    await db.trips.delete(id)
  })
}
