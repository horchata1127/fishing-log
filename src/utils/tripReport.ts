import { isCatch, observationLabel, skyLabels, type CatchRecord, type FishingTrip, type TripEvent, type TripSummaryMvp } from '../db/database'
import { buildCatchSummary, timelineTimestamp } from './tripTimeline'

export interface LureReportRow { key: string; name: string; color: string; catches: number; lost: number }
export interface ReportOptions { table: boolean; mvp: boolean; memo: boolean; weather: boolean }
export const defaultReportOptions: ReportOptions = { table: true, mvp: true, memo: false, weather: false }
export const summaryRowLimit = 8, tablePageSize = 14

/** Keep saved variant/ownership identities and appearance distinctions used by RC35. */
export function groupTripLures(catches: CatchRecord[]): LureReportRow[] {
  const groups = new Map<string, LureReportRow>()
  for (const row of catches) {
    const key = (row.lureVariantId !== undefined ? `variant:${row.lureVariantId}` : row.lureId !== undefined ? `owned:${row.lureId}` : JSON.stringify([row.lureName, row.lureColor])) + (row.visualColorSnapshot ? JSON.stringify(row.visualColorSnapshot.appearance) : '')
    const group = groups.get(key) ?? { key, name: row.lureName?.trim() || 'ルアー未記録', color: row.lureColor?.trim() || '', catches: 0, lost: 0 }
    if (isCatch(row)) group.catches++
    else group.lost++
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.catches - a.catches || b.lost - a.lost || a.name.localeCompare(b.name, 'ja') || a.key.localeCompare(b.key, 'ja'))
}
export function rateLabel(value: number): string { return value.toFixed(1) }
export function excerpt(value: string, limit: number) {
  const characters = Array.from(value.replace(/\s+/gu, ' ').trim())
  return characters.length <= limit ? characters.join('') : `${characters.slice(0, limit - 1).join('')}…`
}
export function buildTripReport(trip: FishingTrip, catches: CatchRecord[], events: TripEvent[] = []) {
  const own = catches.filter(row => trip.id !== undefined && row.tripId === trip.id)
  const summary = buildCatchSummary(trip, own)
  const start = timelineTimestamp(trip.startedAt), end = timelineTimestamp(trip.endedAt)
  const durationMs = start !== null && end !== null && end > start ? end - start : null
  const rows = groupTripLures(own), catchCount = summary.total, lostCount = own.length - catchCount
  const candidate = rows.find(row => row.catches > 0)
  const mvp: (TripSummaryMvp & { origin: 'user' | 'automatic' }) | null = trip.summaryMvp ? { ...trip.summaryMvp, origin: 'user' } : candidate ? { name: candidate.name, color: candidate.color, origin: 'automatic' } : null
  const observations = [
    ...own.filter(row => row.weatherObservation).map(row => ({ time: timelineTimestamp(row.caughtAt), value: row.weatherObservation! })),
    ...events.filter(row => row.tripId === trip.id && row.type === 'weather' && row.weatherObservation).map(row => ({ time: row.timePrecision === 'unknown' ? null : timelineTimestamp(row.occurredAt), value: row.weatherObservation! })),
  ].sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity))
  const latestSky = observations.find(row => row.value.sky)?.value.sky
  const weather = trip.weather?.trim() || (latestSky ? `${skyLabels[latestSky]}（観測）` : '未記録')
  const hours = durationMs === null ? null : durationMs / 3600000
  const minutes = durationMs === null ? null : Math.floor(durationMs / 60000)
  return {
    area: trip.fishingAreaName, date: trip.fishingDate, weather, start, end, catchCount, lostCount,
    durationMs, durationLabel: minutes === null ? (trip.endedAt ? '時間不明' : '釣行中・未確定') : minutes === 0 ? '1分未満' : `${Math.floor(minutes / 60)}時間${minutes % 60}分`,
    catchRate: hours === null ? null : catchCount / hours, responseRate: hours === null ? null : (catchCount + lostCount) / hours,
    mvp, rows, memo: trip.memo ?? '', weatherSummary: observations.map(row => observationLabel(row.value)).join(' ／ '),
    outsideCount: summary.outsideCount, bins: summary.bins,
  }
}
export type TripReport = ReturnType<typeof buildTripReport>
export function reportPage(report: TripReport, mode: 'summary' | 'lures', page: number) {
  const pageCount = mode === 'summary' ? 1 : Math.max(1, Math.ceil(report.rows.length / tablePageSize))
  const safePage = Math.max(0, Math.min(pageCount - 1, Math.floor(Number.isFinite(page) ? page : 0)))
  const rows = mode === 'summary' ? report.rows.slice(0, summaryRowLimit) : report.rows.slice(safePage * tablePageSize, (safePage + 1) * tablePageSize)
  const remaining = mode === 'summary' ? report.rows.slice(summaryRowLimit) : []
  return { rows, page: safePage, pageCount, omitted: remaining.length, omittedCatch: remaining.reduce((n, row) => n + row.catches, 0), omittedLost: remaining.reduce((n, row) => n + row.lost, 0) }
}
export function reportShareText(report: TripReport) {
  return `${report.date} ${excerpt(report.area, 50)}\nキャッチ ${report.catchCount}匹 / バラシ ${report.lostCount}回${report.mvp ? `\nMVP：${excerpt(report.mvp.name, 50)}${report.mvp.color ? ` / ${excerpt(report.mvp.color, 30)}` : ''}${report.mvp.provisional ? '（暫定）' : ''}${report.mvp.origin === 'automatic' ? '（自動候補）' : ''}` : ''}\n#FishingLog`
}
