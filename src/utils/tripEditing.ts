import { db, type FishingTrip } from '../db/database'
import { validateCalendarDate } from './calendarDate'

export type TripInformation = Pick<FishingTrip, 'fishingDate' | 'fishingAreaName' | 'fishingStyle' | 'weather'>

export function validateTripInformation(input: TripInformation): void {
  validateCalendarDate(input.fishingDate)
  if (!input.fishingAreaName.trim()) throw new Error('釣り場を入力してください。')
  if (!['AREA_TROUT', 'CHUBBING', 'NATIVE_TROUT', 'BASS', 'OTHER'].includes(input.fishingStyle)) throw new Error('釣りスタイルを選択してください。')
}

/** Update only reviewed information; retain timestamps and every relationship. */
export async function saveTripInformation(expected: FishingTrip, input: TripInformation): Promise<FishingTrip> {
  validateTripInformation(input)
  return db.transaction('rw', db.trips, async () => {
    const trip = expected.id === undefined ? undefined : await db.trips.get(expected.id)
    if (!trip || !trip.endedAt) throw new Error('終了済みの釣行が見つかりません。')
    if (JSON.stringify(trip) !== JSON.stringify(expected)) throw new Error('釣行が変更されました。開き直して確認してください。')
    if (trip.facilityId && input.fishingAreaName !== trip.fishingAreaName) throw new Error('施設名は「施設を設定・変更」から変更してください。')
    const changes: Partial<TripInformation> = {}
    for (const key of ['fishingDate', 'fishingAreaName', 'fishingStyle', 'weather'] as const) {
      if (input[key] !== trip[key]) Object.assign(changes, { [key]: input[key] })
    }
    await db.trips.update(trip.id!, changes)
    return (await db.trips.get(trip.id!))!
  })
}
