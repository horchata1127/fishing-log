import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/utils/tripTimeline.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { buildTripTimeline: build, layoutTimelineMarkers: layout, timelineTimestamp, formatTimelineTime, catchZoneKey } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const at = time => Date.parse(`2026-10-17T${time}:00+09:00`)
const trip = { id: 1, startedAt: new Date('2026-10-16T21:03:12.160Z'), endedAt: new Date(at('15:25')), fishingDate: '2026-10-16' }
const catches = ['06:21','10:13','11:22','13:57','14:21','14:53','15:16'].map((t, id) => ({ id, tripId: 1, caughtAt: new Date(at(t)), zoneId: 'pond9', locationSnapshot: { facilityName: '日本イワナセンター', zoneName: '9号池' } }))
const raw = JSON.parse(await readFile(new URL('./fixtures/rc25-iwana-2026-10-17.open-meteo.json', import.meta.url)))
const hours = raw.hourly.time.map((t, i) => ({ tripId: 1, timestamp: t * 1000, temperatureC: raw.hourly.temperature_2m[i] }))
test('seven real-scenario times align with unchanged hourly fixture and JST trip boundaries', () => {
  const original = structuredClone({ trip, catches, hours }), model = build(trip, [...catches].reverse(), [], [...hours].reverse())
  assert.equal(model.range.start, +trip.startedAt); assert.equal(model.range.end, +trip.endedAt)
  assert.deepEqual(model.markers.map(m => m.timestamp), catches.map(c => +c.caughtAt))
  assert.equal(model.segments.length, 1)
  for (const p of model.segments.flat()) assert.equal(p.temperatureC, hours.find(h => h.timestamp === p.timestamp).temperatureC)
  assert.equal(model.markers.length, 7); assert.equal(model.unknown.length, 0)
  const positions = layout(model.markers, model.range.start, model.range.end, 390)
  for (const p of positions.markers) assert.equal(p.x, 84 + (p.marker.timestamp - +trip.startedAt) / (+trip.endedAt - +trip.startedAt) * 278)
  assert.deepEqual({ trip, catches, hours }, original)
})
test('JST midnight is independent of browser zone and timezone-free values are never inferred', () => {
  assert.match(formatTimelineTime(Date.parse('2026-10-16T15:00:00Z')), /2026\/10\/17 00:00/)
  assert.match(formatTimelineTime(Date.parse('2026-10-16T14:59:00Z')), /2026\/10\/16 23:59/)
  for (const bad of [null, undefined, '', '2026-10-17T06:00', new Date(NaN), NaN]) assert.equal(timelineTimestamp(bad), null)
  assert.equal(timelineTimestamp(0), 0)
})
test('missing and nonfinite temperatures break lines; real zero is retained; absent hour also breaks', () => {
  const data = [0, 1, null, 3, NaN, 5].map((v, i) => ({ tripId: 1, timestamp: at('07:00') + i * 3600000, temperatureC: v }))
  data.push({ tripId: 1, timestamp: at('14:00'), temperatureC: 8 })
  assert.deepEqual(build(trip, [], [], data).segments.map(s => s.map(p => p.temperatureC)), [[0,1],[3],[5],[8]])
  assert.deepEqual(build(trip, catches, [], []).segments, [])
  assert.equal(build(trip, catches, [], []).markers.length, 7)
})
test('same-time catches/lost/events remain separately tappable; unknown never gets a made-up time', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ ...catches[0], id: i, resultType: i === 7 ? 'lost' : 'catch' }))
  const events = [{ id: 1, tripId: 1, type: 'pellet', timePrecision: 'unknown', occurredAt: new Date(at('09:00')) }, { id: 2, tripId: 1, type: 'stocking', occurredAt: catches[0].caughtAt, timePrecision: 'approximate' }, { id: 3, tripId: 1, type: 'pellet' }]
  const model = build(trip, rows, events, [])
  assert.equal(model.markers.length, 9); assert.equal(model.unknown.length, 2)
  assert(model.unknown.every(m => m.timestamp === null && m.precision === 'unknown'))
  assert.equal(model.markers.find(m => m.kind === 'stocking').precision, 'approximate')
  const positioned = layout(model.markers, model.range.start, model.range.end, 300).markers
  for (let i = 0; i < positioned.length; i++) for (let j = i + 1; j < positioned.length; j++) assert(Math.abs(positioned[i].x - positioned[j].x) >= 44 || Math.abs(positioned[i].y - positioned[j].y) >= 44)
})
test('zone filter preserves unset records by default and does not filter weather/events or change axis', () => {
  const rows = [...catches, { ...catches[0], id: 8, zoneId: undefined, locationSnapshot: undefined, resultType: 'lost' }, { ...catches[0], id: 9, zoneId: 'pond0' }]
  const event = { id: 2, tripId: 1, type: 'pellet', occurredAt: new Date(at('10:00')) }
  const all = build(trip, rows, [event], hours), filtered = build(trip, rows, [event], hours, 'id:pond9')
  assert.equal(filtered.markers.length, 9); assert.equal(build(trip, rows, [event], hours, 'id:pond9', false).markers.length, 8)
  assert.equal(build(trip, rows, [event], hours, 'unset').markers.length, 2)
  assert.deepEqual(filtered.range, all.range); assert.deepEqual(filtered.segments, all.segments)
  assert.equal(catchZoneKey({ locationSnapshot: { facilityName: '旧名称', zoneName: '旧池' } }), 'snapshot:["旧名称","旧池"]')
})
test('invalid trip times use safe records/calendar fallback; out-of-range records are retained separately', () => {
  assert.equal(build({ id: 1, fishingDate: '2026-10-17' }, [], [], []).range.start, at('00:00'))
  assert.equal(build({ id: 1, fishingDate: '2026-02-30' }, [], [], []).range, null)
  assert.equal(build({ id: 1 }, [], [{ tripId: 1, type: 'pellet' }], []).unknown.length, 1)
  const noEnd = build({ ...trip, endedAt: undefined }, catches, [], [])
  assert.equal(noEnd.range.end, at('15:16')); assert.equal(noEnd.range.reason, 'records')
  const outside = build(trip, [{ ...catches[0], caughtAt: new Date(at('23:00')) }], [], [])
  assert.equal(outside.outside.length, 1); assert.equal(outside.markers.length, 0)
  assert.equal(build(trip, [{ ...catches[0], tripId: 2 }], [], [{ ...hours[0], tripId: 2 }]).markers.length, 0)
})
