import type { CatchRecord, FishingTrip, TripEvent, TripWeatherHour } from '../db/database'

export type TimelineEvent = Omit<TripEvent, 'occurredAt'> & { occurredAt?: Date | string | number; timePrecision?: 'exact' | 'approximate' | 'unknown' }
export type MarkerKind = 'catch' | 'lost' | 'stocking' | 'pellet'
export interface TimelineMarker {
  key: string
  kind: MarkerKind
  timestamp: number | null
  precision: 'exact' | 'approximate' | 'unknown'
  record: CatchRecord | TimelineEvent
}
export const markerLabels: Record<MarkerKind, string> = { catch: '釣果', lost: 'バラシ', stocking: '放流', pellet: 'ペレット散布' }
export const markerSymbols: Record<MarkerKind, string> = { catch: '●', lost: '×', stocking: '◆', pellet: '▲' }
export function timelineTimestamp(value: unknown): number | null {
  // Never interpret missing values as epoch zero or timezone-free text as the device's local time.
  if (!(value instanceof Date) && typeof value !== 'number' && !(typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}
export function formatTimelineTime(time: number, short = false) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', ...(short ? {} : { year: 'numeric' as const }), month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(time))
}
export function catchZoneKey(row: CatchRecord) {
  if (row.zoneId) return `id:${row.zoneId}`
  if (row.locationSnapshot?.zoneName) return `snapshot:${JSON.stringify([row.facilityId ?? row.locationSnapshot.facilityName, row.locationSnapshot.zoneName])}`
  return 'unset'
}
export function timelineZones(catches: CatchRecord[]) {
  const groups = new Map<string, { key: string; label: string; count: number }>()
  for (const row of catches) {
    const key = catchZoneKey(row)
    if (key === 'unset') continue
    const group = groups.get(key) ?? { key, label: row.locationSnapshot?.zoneName || '名称の記録がないエリア', count: 0 }
    group.count++; groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'ja') || a.key.localeCompare(b.key))
}
export function filterTimelineCatches(catches: CatchRecord[], zone = 'all', includeUnset = true) {
  return catches.filter(row => zone === 'all' || catchZoneKey(row) === zone || (zone !== 'unset' && includeUnset && catchZoneKey(row) === 'unset'))
}
function orderedMarkers(catches: CatchRecord[], events: TimelineEvent[]) {
  const markers: TimelineMarker[] = catches.map((record, index) => ({ key: `catch:${record.id ?? `index-${index}`}`, kind: record.resultType === 'lost' ? 'lost' : 'catch', timestamp: timelineTimestamp(record.caughtAt), precision: 'exact', record }))
  for (const [index, record] of events.entries()) {
    if (record.type !== 'stocking' && record.type !== 'pellet') continue
    const timestamp = record.timePrecision === 'unknown' ? null : timelineTimestamp(record.occurredAt)
    markers.push({ key: `event:${record.id ?? `index-${index}`}`, kind: record.type, timestamp, precision: timestamp === null ? 'unknown' : record.timePrecision === 'approximate' ? 'approximate' : 'exact', record })
  }
  for (const marker of markers) if (marker.timestamp === null) marker.precision = 'unknown'
  return markers.sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity) ||
    Object.keys(markerLabels).indexOf(a.kind) - Object.keys(markerLabels).indexOf(b.kind) || (a.record.id ?? 0) - (b.record.id ?? 0) || a.key.localeCompare(b.key))
}
export function buildTripTimeline(trip: FishingTrip, catches: CatchRecord[], events: TimelineEvent[], hours: TripWeatherHour[], zone = 'all', includeUnset = true) {
  const own = <T extends { tripId: number }>(rows: T[]) => rows.filter(row => trip.id !== undefined && row.tripId === trip.id)
  const allCatches = own(catches), allEvents = own(events), allHours = own(hours)
  const allMarkers = orderedMarkers(allCatches, allEvents)
  const markers = orderedMarkers(filterTimelineCatches(allCatches, zone, includeUnset), allEvents)
  const start = timelineTimestamp(trip.startedAt), end = timelineTimestamp(trip.endedAt)
  const times = [...allMarkers.flatMap(m => m.timestamp === null ? [] : [m.timestamp]), ...allHours.map(h => timelineTimestamp(h.timestamp)).filter((t): t is number => t !== null)]
  let range: { start: number; end: number; reason: 'trip' | 'records' | 'calendar' } | null = null
  if (start !== null && end !== null && end > start) range = { start, end, reason: 'trip' }
  else if (start !== null && end === null) range = { start, end: Math.max(start + 3600000, ...allMarkers.flatMap(m => m.timestamp !== null && m.timestamp >= start ? [m.timestamp] : [])), reason: 'records' }
  else if (end !== null && start === null) range = { start: Math.min(end - 3600000, ...times.filter(t => t <= end)), end, reason: 'records' }
  else if (times.length || start !== null || end !== null) {
    const values = [...times, ...(start === null ? [] : [start]), ...(end === null ? [] : [end])]
    const first = Math.min(...values), last = Math.max(...values)
    range = { start: first === last ? first - 1800000 : first, end: first === last ? last + 1800000 : last, reason: 'records' }
  } else if (typeof trip.fishingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(trip.fishingDate) &&
      Number.isFinite(Date.parse(trip.fishingDate)) && new Date(trip.fishingDate).toISOString().slice(0, 10) === trip.fishingDate) {
    const start = Date.parse(`${trip.fishingDate}T00:00:00+09:00`)
    range = { start, end: start + 86400000, reason: 'calendar' }
  }
  const unknown = markers.filter(m => m.timestamp === null)
  const outside = markers.filter(m => m.timestamp !== null && (!range || m.timestamp < range.start || m.timestamp > range.end))
  const visible = markers.filter(m => m.timestamp !== null && range && m.timestamp >= range.start && m.timestamp <= range.end)
  const segments: { timestamp: number; temperatureC: number }[][] = []
  let segment: { timestamp: number; temperatureC: number }[] = []
  for (const hour of [...allHours].sort((a, b) => a.timestamp - b.timestamp)) {
    if (!range || !Number.isFinite(hour.timestamp) || hour.timestamp < range.start - 3600000 || hour.timestamp > range.end + 3600000) continue
    const valid = typeof hour.temperatureC === 'number' && Number.isFinite(hour.temperatureC)
    if (!valid || (segment.length && hour.timestamp - segment.at(-1)!.timestamp !== 3600000)) {
      if (segment.length) segments.push(segment)
      segment = []
    }
    if (valid) segment.push({ timestamp: hour.timestamp, temperatureC: hour.temperatureC! })
  }
  if (segment.length) segments.push(segment)
  return { range, markers: visible, unknown, outside, segments, zones: timelineZones(allCatches) }
}

/** Minimum 44px hit targets. Collision lanes keep simultaneous/nearby records separately tappable. */
export function layoutTimelineMarkers(markers: TimelineMarker[], start: number, end: number, width: number) {
  const output: { marker: TimelineMarker; x: number; y: number }[] = []
  const lanes: { kind: MarkerKind; y: number }[] = []
  let top = 190
  for (const kind of Object.keys(markerLabels) as MarkerKind[]) {
    const lastX: number[] = []
    lanes.push({ kind, y: top + 22 })
    for (const marker of markers.filter(m => m.kind === kind)) {
      const x = 84 + ((marker.timestamp! - start) / (end - start)) * (width - 112)
      let lane = lastX.findIndex(value => x - value >= 46)
      if (lane < 0) lane = lastX.length
      lastX[lane] = x
      output.push({ marker, x, y: top + lane * 46 + 22 })
    }
    top += Math.max(1, lastX.length) * 46 + 8
  }
  return { markers: output, lanes, height: top + 44 }
}

export interface CatchHourBucket {
  key: string
  timestamp: number | null
  dayJst: string
  label: string
  count: number
}
const hourMs = 3600000
const hourFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23' })

/** Read-only totals. Graph fallback bounds must never become the pace denominator. */
export function buildCatchSummary(trip: FishingTrip, catches: CatchRecord[], zone = 'all', includeUnset = true) {
  const all = catches.filter(row => trip.id !== undefined && row.tripId === trip.id && row.resultType !== 'lost')
  const displayed = filterTimelineCatches(all, zone, includeUnset)
  const start = timelineTimestamp(trip.startedAt), end = timelineTimestamp(trip.endedAt)
  const duration = start !== null && end !== null && end > start ? end - start : null
  const pace = duration === null ? null : all.length / (duration / hourMs)
  const paceReason = trip.endedAt == null ? 'missing-end' : 'invalid-period'
  const counts = new Map<number, number>()
  let unknownCount = 0
  for (const row of displayed) {
    const time = timelineTimestamp(row.caughtAt)
    if (time === null) unknownCount++
    else { const hour = Math.floor(time / hourMs) * hourMs; counts.set(hour, (counts.get(hour) ?? 0) + 1) }
  }
  // Bounds use all catches, regardless of the zone, so filters don't hide empty hours.
  const recordTimes = all.flatMap(row => { const time = timelineTimestamp(row.caughtAt); return time === null ? [] : [time] })
  const times = [...recordTimes]
  if (start !== null) times.push(start)
  if (end !== null) times.push(duration === null ? end : end - 1)
  const first = times.length ? Math.floor(times.reduce((a, b) => Math.min(a, b)) / hourMs) * hourMs : null
  const last = times.length ? Math.floor(times.reduce((a, b) => Math.max(a, b)) / hourMs) * hourMs : null
  const hourCount = first === null || last === null ? 0 : Math.round((last - first) / hourMs) + 1
  // Protect a mobile renderer from corrupt dates spanning centuries. No time is invented.
  const periodTooLong = hourCount > 24 * 366
  const bins: CatchHourBucket[] = []
  if (periodTooLong) bins.push({ key: 'unavailable', timestamp: null, dayJst: '', label: '期間過大', count: displayed.length - unknownCount })
  else if (first !== null) for (let index = 0; index < hourCount; index++) {
    const timestamp = first + index * hourMs
    const parts = Object.fromEntries(hourFormatter.formatToParts(timestamp).map(part => [part.type, part.value]))
    bins.push({ key: String(timestamp), timestamp, dayJst: `${parts.year}-${parts.month}-${parts.day}`, label: `${Number(parts.hour)}時台`, count: counts.get(timestamp) ?? 0 })
  }
  if (all.length !== recordTimes.length) {
    bins.push({ key: 'unknown', timestamp: null, dayJst: '', label: '時刻不明', count: unknownCount })
  }
  return { total: all.length, displayed: displayed.length, pace, paceReason, bins, periodTooLong,
    unknownCount, outsideCount: duration === null ? 0 : recordTimes.filter(time => time < start! || time > end!).length }
}
