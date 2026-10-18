import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/utils/tripTimeline.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { buildCatchSummary: summarize, buildTripTimeline: build, layoutTimelineMarkers: layout, timelineTimestamp, formatTimelineTime, catchZoneKey } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
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

test('PR4 Iwana seven catches, zero hours and 0.75/hour pace use only existing catch records', () => {
  const input = structuredClone({ trip, catches }), s = summarize(trip, catches)
  assert.equal(s.total, 7); assert.equal(s.displayed, 7); assert.equal(s.pace.toFixed(2), '0.75')
  assert.deepEqual(s.bins.map(b => b.label), Array.from({ length: 10 }, (_, i) => `${i + 6}時台`))
  assert.deepEqual(s.bins.map(b => b.count), [1,0,0,0,1,1,0,1,2,1])
  assert.equal(s.bins.reduce((n, b) => n + b.count, 0), s.displayed)
  assert.deepEqual({ trip, catches }, input)
})
test('PR4 JST hour boundaries include 59:59.999 in the prior hour; exact end has no phantom empty hour', () => {
  const start = new Date('2026-10-16T21:00:00Z'), end = new Date('2026-10-16T22:00:00Z')
  const rows = [new Date(+end - 1), end].map((caughtAt, id) => ({ id, tripId: 1, caughtAt }))
  assert.deepEqual(summarize({ ...trip, startedAt: start, endedAt: end }, rows).bins.map(b => [b.label,b.count]), [['6時台',1],['7時台',1]])
  assert.deepEqual(summarize({ ...trip, startedAt: start, endedAt: end }, rows.slice(0,1)).bins.map(b => [b.label,b.count]), [['6時台',1]])
})
test('PR4 JST cross-midnight and repeated clock hours on different days never merge', () => {
  const span = { id: 1, startedAt: new Date('2026-10-17T23:00:00+09:00'), endedAt: new Date('2026-10-19T01:00:00+09:00') }
  const rows = ['2026-10-17T23:59:59+09:00','2026-10-18T00:00:00+09:00','2026-10-19T00:00:00+09:00'].map(caughtAt => ({ tripId: 1, caughtAt: new Date(caughtAt) }))
  const s = summarize(span, rows)
  assert.equal(s.bins.length, 26); assert.equal(s.bins[0].dayJst, '2026-10-17'); assert.equal(s.bins[1].dayJst, '2026-10-18'); assert.equal(s.bins.at(-1).dayJst, '2026-10-19')
  assert.deepEqual(s.bins.filter(b => b.count).map(b => b.count), [1,1,1]); assert.equal(new Set(s.bins.map(b => b.key)).size, 26)
})
test('PR4 zero catches and lost-only trips retain zero bars and zero pace without weather', () => {
  for (const rows of [[], catches.map(c => ({ ...c, resultType: 'lost' }))]) {
    const s = summarize(trip, rows)
    assert.equal(s.total, 0); assert.equal(s.pace, 0); assert.equal(s.bins.length, 10); assert(s.bins.every(b => b.count === 0))
  }
})
test('PR4 zone and unset filters change bars only; whole-trip count, pace and hour bounds stay fixed', () => {
  const rows = [...catches, { ...catches[0], id: 50, zoneId: undefined, locationSnapshot: undefined }, { ...catches[0], id: 51, zoneId: 'pond0' }, { ...catches[0], id: 52, resultType: 'lost' }, { ...catches[0], tripId: 2 }]
  const all = summarize(trip, rows), filtered = summarize(trip, rows, 'id:pond9'), noUnset = summarize(trip, rows, 'id:pond9', false), unset = summarize(trip, rows, 'unset')
  assert.equal(all.total, 9); assert.equal(filtered.displayed, 8); assert.equal(noUnset.displayed, 7); assert.equal(unset.displayed, 1)
  for (const s of [filtered, noUnset, unset]) {
    assert.equal(s.total, all.total); assert.equal(s.pace, all.pace); assert.deepEqual(s.bins.map(b => b.key), all.bins.map(b => b.key))
    assert.equal(s.bins.reduce((n, b) => n + b.count, 0), s.displayed)
  }
})
test('PR4 invalid/missing/reversed/zero period cannot use graph fallback or current time for pace', () => {
  for (const override of [{ startedAt: undefined }, { endedAt: undefined }, { startedAt: null }, { startedAt: new Date(NaN) }, { endedAt: 'not a time' }, { startedAt: trip.endedAt }, { startedAt: new Date(+trip.endedAt + 1) }]) {
    const s = summarize({ ...trip, ...override }, catches)
    assert.equal(s.pace, null); assert.equal(s.total, 7); assert.equal(s.bins.reduce((n, b) => n + b.count, 0), 7)
  }
  assert.equal(summarize({ ...trip, endedAt: undefined }, catches).paceReason, 'missing-end')
})
test('PR4 invalid catch timestamps remain in explicit unknown bar and outside-time catches retain real hour', () => {
  const rows = [...catches, { tripId: 1, caughtAt: undefined }, { tripId: 1, caughtAt: new Date(at('23:00')) }]
  const s = summarize(trip, rows)
  assert.equal(s.total, 9); assert.equal(s.unknownCount, 1); assert.equal(s.outsideCount, 1)
  assert.equal(s.bins.at(-1).key, 'unknown'); assert.equal(s.bins.at(-1).count, 1)
  assert.equal(s.bins.find(b => b.label === '23時台').count, 1); assert.equal(s.bins.reduce((n, b) => n + b.count, 0), 9)
  assert.equal(summarize({}, rows).total, 0)
})
test('PR4 excessively large corrupt period is bounded without dropping catches or assigning invented hours', () => {
  const s = summarize({ ...trip, startedAt: new Date('1900-01-01T00:00:00Z') }, catches)
  assert.equal(s.periodTooLong, true); assert.equal(s.bins.length, 1); assert.equal(s.bins[0].timestamp, null); assert.equal(s.bins[0].count, 7)
})

test('RC27 legacy/unresolved areas have distinct filter keys and never merge with current facility counts', () => {
  const linked = { ...trip,facilityId:'official:new' }, zones = new Map([['pond9','official:new']])
  const rows = [{ ...catches[0],facilityId:'official:old' },{ ...catches[1],facilityId:'official:new' },{ ...catches[2],facilityId:'official:new',zoneId:'missing' }]
  const model = build(linked,rows,[],[], 'all',true,zones)
  assert.equal(model.zones.length,3); assert.equal(model.zones.filter(z => z.label.startsWith('旧施設')).length,2)
  const current = summarize(linked,rows,'id:pond9',true,zones)
  assert.equal(current.total,3); assert.equal(current.displayed,1); assert.equal(current.bins.reduce((n,b) => n+b.count,0),1)
  const old = model.zones.find(z => z.key.startsWith('previous:'))
  assert.equal(build(linked,rows,[],[],old.key,true,zones).markers.length,1)
})
