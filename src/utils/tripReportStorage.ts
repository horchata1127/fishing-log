import { db, validateTripSummaryMvp, type FishingTrip, type TripSummaryMvp } from '../db/database'

export async function saveTripMvp(expected: FishingTrip, mvp?: TripSummaryMvp): Promise<FishingTrip> {
  if (mvp !== undefined) validateTripSummaryMvp(mvp)
  return db.transaction('rw', db.trips, async () => {
    const trip = expected.id === undefined ? undefined : await db.trips.get(expected.id)
    if (!trip || JSON.stringify(trip) !== JSON.stringify(expected)) throw new Error('釣行が変更されました。開き直してください。')
    await db.trips.update(trip.id!, { summaryMvp: mvp === undefined ? undefined : structuredClone(mvp) })
    return (await db.trips.get(trip.id!))!
  })
}
