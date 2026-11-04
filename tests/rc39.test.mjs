import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'
const loader = await localTypeScript()
const { buildTripTimeline } = await loader.load('src/utils/tripTimeline.ts')
const { buildTimelineImage, defaultTimelineImageOptions, timelineTemperatureNote } = await loader.load('src/utils/timelineImage.ts')
const { renderTimelinePng } = await loader.load('src/utils/reportImage.ts')
after(() => loader.close())
const trip = { id: 1, fishingDate: '2026-11-03', fishingAreaName: '合成・多摩湖のタイムライン', startedAt: '2026-11-02T21:53:00Z', endedAt: '2026-11-03T04:36:00Z', memo: '風と日陰を確認\n次回の参考' }
const catches = [{ id: 1, tripId: 1, caughtAt: '2026-11-03T01:00:00Z', weatherObservation: { source: 'observed', sky: 'cloudy', wind: 'strong', changes: ['windStronger'] } },
  { id: 2, tripId: 1, caughtAt: '2026-11-03T01:00:00Z', resultType: 'lost' }, { id: 3, tripId: 99, caughtAt: '2026-11-03T01:00:00Z' }]
const events = [{ id: 1, tripId: 1, type: 'stocking', occurredAt: '2026-11-03T01:00:00Z', timePrecision: 'approximate', note: '放流・合成記録' },
  { id: 2, tripId: 1, type: 'pellet', occurredAt: '2026-11-03T01:00:00Z' },
  { id: 3, tripId: 1, type: 'weather', timePrecision: 'unknown', weatherObservation: { source: 'observed', sky: 'sunny', changes: [] } },
  { id: 4, tripId: 1, type: 'pellet', occurredAt: '2026-11-03T08:00:00Z' }]
const hours = [0, 1, 2, 3, 4].map(i => ({ tripId: 1, timestamp: Date.parse('2026-11-02T22:00:00Z') + i * 3600000, temperatureC: i === 2 ? null : 10 + i }))

test('image mirrors saved timeline bounds, temperature gaps and all five marker kinds without mutating input', () => {
  const model = buildTripTimeline(trip, catches, events, hours), before = structuredClone({ trip, model })
  const image = buildTimelineImage(trip, model)
  assert.equal(image.rangeLabel, '2026/11/03 06:53 〜 2026/11/03 13:36 JST')
  assert.equal(image.paths.length, 2)
  assert.deepEqual(image.markers.map(m => m.key), model.markers.map(m => m.key))
  assert.deepEqual(new Set(image.markers.map(m => m.kind)), new Set(['catch', 'lost', 'weather', 'stocking', 'pellet']))
  assert.match(image.eventDetails.find(r => r.key === 'event:1').text, /約 .*放流.*合成/)
  assert.match(image.eventDetails.find(r => r.key === 'catch-weather:1').text, /手入力|曇|風/)
  assert.ok(image.unplaced.some(r => /時刻不明/.test(r.text)))
  assert.ok(image.unplaced.some(r => /表示範囲外/.test(r.text)))
  assert.match(timelineTemperatureNote, /欠損や時間の抜けでは線を切/)
  assert.deepEqual({ trip, model }, before)
})

test('filters preserve saved bounds and remove only chosen layers, including outside/unknown records', () => {
  const model = buildTripTimeline(trip, catches, events, hours)
  const options = { ...defaultTimelineImageOptions, temperature: false, lost: false, weather: false, pellet: false, memo: true }
  const image = buildTimelineImage(trip, model, options)
  assert.equal(image.paths.length, 0); assert.equal(image.points.length, 0)
  assert.deepEqual(image.range, model.range)
  assert.deepEqual(image.markers.map(m => m.kind), ['catch', 'stocking'])
  assert.equal(image.unplaced.length, 0); assert.equal(image.eventDetails.length, 1)
  assert.equal(image.memo, trip.memo)
})

test('dense and multi-day trips keep every marker within an expanded graph', () => {
  const end = '2026-11-09T21:53:00Z', dense = Array.from({ length: 80 }, (_, i) => ({ ...catches[0], id: i + 1, weatherObservation: undefined }))
  const image = buildTimelineImage({ ...trip, endedAt: end }, buildTripTimeline({ ...trip, endedAt: end }, dense, events, hours))
  assert.equal(image.layout.markers.length, 83)
  assert.ok(image.layout.height > 3600)
  assert.ok(image.layout.markers.every(m => m.y + 22 < image.layout.height && m.x - 22 >= 0 && m.x + 22 <= 484))
  assert.equal(new Set(image.layout.markers.map(m => m.marker.key)).size, 83)
  assert.match(image.rangeLabel, /2026\/11\/10/)
})

test('empty/invalid dates and missing temperature remain explicit; memo excerpt does not split Unicode', () => {
  for (const sample of [{ ...trip, startedAt: '', endedAt: undefined }, { fishingAreaName: '時刻未記録' }]) {
    const image = buildTimelineImage(sample, buildTripTimeline(sample, [], [], []))
    assert.equal(image.paths.length, 0); assert.equal(image.hasTemperature, false)
    assert.equal(image.range?.reason ?? null, sample.fishingDate ? 'calendar' : null)
  }
  const sample = { ...trip, memo: '🎣'.repeat(401) }, image = buildTimelineImage(sample, buildTripTimeline(sample, [], [], []), { ...defaultTimelineImageOptions, memo: true })
  assert.equal(image.memo, '🎣'.repeat(400) + '…')
})

test('oversized timeline images fail before loading renderer instead of cropping', async () => {
  const previous = globalThis.document
  globalThis.document = { fonts: { ready: Promise.resolve() } }
  try {
    await assert.rejects(renderTimelinePng({ getBoundingClientRect: () => ({ height: 12001 }), scrollWidth: 1080 }), /画像が大きすぎます/)
    await assert.rejects(renderTimelinePng({ getBoundingClientRect: () => ({ height: 1600 }), scrollWidth: 1081 }), /画像が大きすぎます/)
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous }
})
