import { db, type FishingTrip } from '../db/database'

export interface TripDeletionSummary {
  trip: FishingTrip & { id: number }
  catchCount: number
  eventCount: number
}

function requireTripId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('釣行IDが不正です。')
}

async function readSummary(id: number): Promise<TripDeletionSummary> {
  const trip = await db.trips.get(id)
  if (!trip) throw new Error('この釣行は存在しないか、削除済みです。')
  const catchCount = await db.catches.where('tripId').equals(id).count()
  const eventCount = await db.tripEvents.where('tripId').equals(id).count()
  return { trip: { ...trip, id }, catchCount, eventCount }
}

/** Confirmation reads the persisted counts without changing any record. */
export async function getTripDeletionSummary(id: number): Promise<TripDeletionSummary> {
  requireTripId(id)
  return db.transaction('r', [db.trips, db.catches, db.tripEvents], () => readSummary(id))
}

/** Only the selected trip and its child records belong to this transaction. */
export async function deleteFishingTrip(id: number, expected: TripDeletionSummary): Promise<void> {
  requireTripId(id)
  if (expected.trip.id !== id) throw new Error('削除対象の釣行が一致しません。')
  await db.transaction('rw', [db.trips, db.catches, db.tripEvents], async () => {
    const current = await readSummary(id)
    if (current.catchCount !== expected.catchCount || current.eventCount !== expected.eventCount ||
        current.trip.fishingAreaName !== expected.trip.fishingAreaName || current.trip.fishingDate !== expected.trip.fishingDate ||
        current.trip.endedAt?.getTime() !== expected.trip.endedAt?.getTime()) {
      throw new Error('確認後に釣行の内容が変わりました。キャンセルして確認し直してください。')
    }
    await db.catches.where('tripId').equals(id).delete()
    await db.tripEvents.where('tripId').equals(id).delete()
    await db.trips.delete(id)
  })
}
