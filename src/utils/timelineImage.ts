import type { FishingTrip } from '../db/database'
import { observationLabel } from '../db/database'
import { formatTimelineTime, layoutTimelineMarkers, markerLabels, markerSymbols,
  type buildTripTimeline, type MarkerKind, type TimelineMarker } from './tripTimeline'

export type TimelineModel = ReturnType<typeof buildTripTimeline>
export type TimelineImageOptions = Record<MarkerKind | 'temperature' | 'memo', boolean>
export const defaultTimelineImageOptions: TimelineImageOptions = {
  temperature: true, catch: true, lost: true, stocking: true, pellet: true, weather: true, memo: false,
}
export const timelineImageColors: Record<MarkerKind | 'temperature', string> = {
  temperature: '#c56832', catch: '#126652', lost: '#a12d40', stocking: '#2857a0', pellet: '#795012', weather: '#37546b',
}
export const timelineTemperatureNote = '線は保存済みの毎正時のモデル推定値を直線で結んでいます。欠損や時間の抜けでは線を切ります。釣果時刻の気温の算出・実測表示は行いません。'
export const timelineLogicalWidth = 484
export const timelineImageWidth = 1080
export const timelineImageMinHeight = 1600

export function timelineMarkerDescription(marker: TimelineMarker) {
  const time = marker.timestamp === null ? '時刻不明' : `${marker.precision === 'approximate' ? '約 ' : ''}${formatTimelineTime(marker.timestamp)} JST`
  const record = marker.record
  const detail = marker.kind === 'weather'
    ? [observationLabel(record.weatherObservation), record.weatherObservation?.note, 'note' in record ? record.note : ''].filter(Boolean).join(' / ')
    : ['catch', 'lost'].includes(marker.kind) ? ['lureName' in record ? record.lureName : '', 'lureColor' in record ? record.lureColor : ''].filter(Boolean).join(' / ') : 'note' in record ? record.note : ''
  return `${time} ${markerSymbols[marker.kind]} ${markerLabels[marker.kind]}${detail ? `：${detail}` : ''}`
}

/** A read-only projection of the on-screen model, including its range and area filter. */
export function buildTimelineImage(trip: FishingTrip, model: TimelineModel, options: TimelineImageOptions = defaultTimelineImageOptions) {
  const markers = model.markers.filter(m => options[m.kind])
  const range = model.range
  const layout = range ? layoutTimelineMarkers(markers, range.start, range.end, timelineLogicalWidth) : null
  const segments = options.temperature ? model.segments : []
  const temperatures = segments.flatMap(segment => segment.map(p => p.temperatureC))
  const low = temperatures.length ? Math.floor(Math.min(...temperatures) - 1) : 0
  const high = temperatures.length ? Math.ceil(Math.max(...temperatures) + 1) : 1
  const x = (time: number) => range ? 84 + (time - range.start) / (range.end - range.start) * (timelineLogicalWidth - 112) : 0
  const y = (temperature: number) => 142 - (temperature - low) / (high - low) * 106
  const paths = segments.filter(s => s.length > 1).map(segment => segment.map((p, i) => `${i ? 'L' : 'M'}${x(p.timestamp)},${y(p.temperatureC)}`).join(' '))
  const points = segments.flat().filter(p => range && p.timestamp >= range.start && p.timestamp <= range.end)
  const ticks = range ? Array.from({ length: 3 }, (_, index) => {
    const timestamp = range.start + (range.end - range.start) * index / 2
    const label = formatTimelineTime(timestamp).split(' ')
    return { timestamp, x: x(timestamp), day: label[0]?.slice(5), time: label[1] }
  }) : []
  return {
    date: trip.fishingDate || '釣行日未記録', area: trip.fishingAreaName || '釣り場未記録', range, layout, markers,
    rangeLabel: range ? `${formatTimelineTime(range.start)} 〜 ${formatTimelineTime(range.end)} JST` : '有効な日時がなく時間軸を表示できません',
    rangeNote: range?.reason === 'records' ? '開始・終了時刻が揃わないため、保存済みの記録時刻などから表示範囲を決めています。実際の釣行時間ではありません。'
      : range?.reason === 'calendar' ? '開始・終了時刻と記録時刻がないため、保存済み釣行日の1日分を表示しています。' : '',
    low, high, x, y, paths, points, ticks,
    eventDetails: markers.filter(m => ['stocking', 'pellet', 'weather'].includes(m.kind)).map(m => ({ key: m.key, text: timelineMarkerDescription(m) })),
    unplaced: [...model.outside.filter(m => options[m.kind]).map(m => ({ key: m.key, text: `表示範囲外：${timelineMarkerDescription(m)}` })),
      ...model.unknown.filter(m => options[m.kind]).map(m => ({ key: m.key, text: timelineMarkerDescription(m) }))],
    hasTemperature: temperatures.length > 0,
    memo: options.memo && trip.memo ? Array.from(trip.memo).slice(0, 400).join('') + (Array.from(trip.memo).length > 400 ? '…' : '') : '',
  }
}
