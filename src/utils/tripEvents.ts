import { db, type FishingTrip, type TripEvent, type TripEventType } from '../db/database'
import { validateCalendarDate } from './calendarDate'

export interface EventInput { type: TripEventType; dateTime: string; note: string; zoneId: string }
export function eventDateTime(value: Date): string {
  if (!Number.isFinite(new Date(value).getTime())) return ''
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
export function parseEventDateTime(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('発生日時を入力してください。')
  validateCalendarDate(value.slice(0, 10))
  const date = new Date(`${value}:00+09:00`)
  if (!Number.isFinite(date.getTime()) || eventDateTime(date) !== value) throw new Error('発生日時を確認してください。')
  return date
}
export function validateEventTime(trip: FishingTrip, occurredAt: Date) {
  const day = eventDateTime(occurredAt).slice(0, 10)
  const startDay = eventDateTime(new Date(trip.startedAt)).slice(0, 10)
  const endDay = trip.endedAt ? eventDateTime(new Date(trip.endedAt)).slice(0, 10) : eventDateTime(new Date()).slice(0, 10)
  // RC29 allows reviewed calendar corrections without rewriting historical timestamps.
  // The fishing day is authoritative; a genuine overnight period also admits its later days.
  const overnight = startDay === trip.fishingDate && endDay > startDay
  if (day !== trip.fishingDate && !(overnight && day >= startDay && day <= endDay)) throw new Error('発生日は釣行日（夜釣りは終了日まで）にしてください。')
  if (startDay === trip.fishingDate && occurredAt < new Date(trip.startedAt)) throw new Error('釣行開始より前の日時にはできません。')
  if (trip.endedAt && endDay >= trip.fishingDate && occurredAt > new Date(trip.endedAt)) throw new Error('釣行終了より後の日時にはできません。')
}
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b) }
export async function saveTripEvent(expectedTrip: FishingTrip, input: EventInput, original?: TripEvent) {
  const requestedAt = parseEventDateTime(input.dateTime)
  if (!['stocking', 'pellet'].includes(input.type)) throw new Error('イベント種別を選択してください。')
  return db.transaction('rw', [db.trips, db.tripEvents, db.zones], async () => {
    const trip = expectedTrip.id === undefined ? undefined : await db.trips.get(expectedTrip.id)
    if (!trip || !same(trip, expectedTrip)) throw new Error('釣行が変更されました。開き直してください。')
    const existing = original?.id === undefined ? undefined : await db.tripEvents.get(original.id)
    if (original && (!existing || existing.tripId !== trip.id || !same(existing, original))) throw new Error('イベントが変更・削除されました。開き直してください。')
    // Memo/area edits must preserve the seconds of an existing timestamp.
    const unchangedTime = existing && eventDateTime(existing.occurredAt) === input.dateTime && existing.timePrecision !== 'unknown'
    const occurredAt = unchangedTime ? existing.occurredAt : requestedAt
    validateEventTime(trip, occurredAt)
    const zone = input.zoneId ? await db.zones.get(input.zoneId) : undefined
    const unchangedZone = existing?.zoneId === input.zoneId
    if (input.zoneId && !unchangedZone && (!zone || zone.facilityId !== trip.facilityId)) throw new Error('対象施設のエリアを選択してください。')
    const changes = { type: input.type, occurredAt, ...(existing?.timePrecision ? { timePrecision: unchangedTime ? existing.timePrecision : 'exact' as const } : {}), note: input.note, zoneId: input.zoneId || undefined,
      facilityId: input.zoneId ? (unchangedZone ? existing?.facilityId : trip.facilityId) : undefined,
      zoneName: input.zoneId ? (unchangedZone ? existing?.zoneName : typeof zone?.name === 'string' ? zone.name : undefined) : undefined }
    if (existing) { await db.tripEvents.update(existing.id!, changes); return existing.id! }
    return db.tripEvents.add({ tripId: trip.id!, ...changes })
  })
}
export async function deleteTripEvent(original: TripEvent) {
  return db.transaction('rw', db.tripEvents, async () => {
    const existing = original.id === undefined ? undefined : await db.tripEvents.get(original.id)
    if (!existing || !same(existing, original)) throw new Error('イベントが変更・削除されました。開き直してください。')
    await db.tripEvents.delete(existing.id!)
  })
}
