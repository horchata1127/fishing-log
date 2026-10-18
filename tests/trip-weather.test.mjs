import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-weather-'))
const names = { database: 'db/database', facilityMaster: 'utils/facilityMaster', facilityStorage: 'utils/facilityStorage', backup: 'utils/backup', weather: 'utils/tripWeather', deletion: 'utils/tripDeletion', reuse: 'utils/weatherLocationReuse' }
const paths = Object.fromEntries(Object.keys(names).map(n => [n, join(directory, `${n}.mjs`)]))
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const databaseSource = await readFile(new URL('../src/db/database.ts', import.meta.url), 'utf8')
for (const [name, source] of Object.entries(names)) {
  let code = compile(await readFile(new URL(`../src/${source}.ts`, import.meta.url), 'utf8')).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
  for (const [dependency, target] of Object.entries(names)) for (const prefix of ['./', '../db/', '../utils/']) code = code.replaceAll(`'${prefix}${target.split('/').at(-1)}'`, JSON.stringify(pathToFileURL(paths[dependency]).href))
  await writeFile(paths[name], code)
}
const { db, jstDay, weatherTripRange, weatherTableNames, weatherFields } = await import(pathToFileURL(paths.database).href)
const { fetchTripWeather, saveWeatherLocation, readTripWeather, parseWeatherResponse } = await import(pathToFileURL(paths.weather).href)
const { applyFacilityMaster } = await import(pathToFileURL(paths.facilityStorage).href)
const { createBackup, importBackup, validateBackup } = await import(pathToFileURL(paths.backup).href)
const { getTripDeletionSummary, deleteFishingTrip } = await import(pathToFileURL(paths.deletion).href)
const { findReusableWeatherLocations, reuseWeatherLocation } = await import(pathToFileURL(paths.reuse).href)
const rawBytes = await readFile(new URL('./fixtures/rc25-iwana-2026-10-17.open-meteo.json', import.meta.url))
const actual = JSON.parse(rawBytes), copy = value => JSON.parse(JSON.stringify(value))
const provenance = JSON.parse(await readFile(new URL('./fixtures/rc25-iwana-2026-10-17.provenance.json', import.meta.url), 'utf8'))
const master = JSON.parse(await readFile(new URL('../src/data/facility-master.v1.json', import.meta.url), 'utf8'))
const now = new Date('2026-10-23T00:00:00Z')
const mock = (body = actual, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const snapshot = async () => copy(Object.fromEntries(await Promise.all(db.tables.filter(t => !weatherTableNames.includes(t.name)).map(async t => [t.name, await t.toArray()]))))
async function seed() {
  await applyFacilityMaster(master)
  await db.facilities.put({ id: 'user:weather', name: 'ユーザー施設', origin: 'user' })
  await db.zones.put({ id: 'user:weather:zone', facilityId: 'user:weather', name: 'ユーザー池', origin: 'user' })
  await db.trips.put({ id: 1, fishingAreaName: '日本イワナセンター', fishingDate: '2026-10-16', fishingStyle: 'AREA_TROUT',
    facilityId: 'official:nihon-iwana-center', startedAt: new Date('2026-10-16T21:03:12.160Z'), endedAt: new Date('2026-10-17T06:25:00Z') })
  for (const [id, local] of ['06:21','10:13','11:22','13:57','14:21','14:53','15:16'].entries()) await db.catches.put({ id: id + 1, tripId: 1, caughtAt: new Date(`2026-10-17T${local}:00+09:00`), lureId: 5, lureVariantId: 4, facilityId: 'official:nihon-iwana-center', zoneId: 'official:nihon-iwana-center:pond-9', action: 'ただ巻き', locationSnapshot: { facilityName: '日本イワナセンター', zoneName: '9号池' } })
  await db.catches.put({ id: 8, tripId: 1, caughtAt: new Date('2026-10-17T07:00:00Z'), resultType: 'lost', lostDistance: 'near' })
  // Synthetic event for storage protection only; not the real Iwana pellet event.
  await db.tripEvents.put({ id: 1, tripId: 1, type: 'stocking', occurredAt: new Date('2026-10-17T01:00:00Z'), note: '合成の保持試験用' })
  await db.lureManufacturers.put({ id: 1, name: 'Maker' }); await db.lureSeries.put({ id: 2, manufacturerId: 1, name: 'Series' })
  await db.lureModels.put({ id: 3, seriesId: 2, name: 'Model' }); await db.lureVariants.put({ id: 4, modelId: 3, colorName: '赤' }); await db.myLures.put({ id: 5, variantId: 4, active: true, ownershipStatus: 'owned' })
  await db.rods.put({ id: 6, manufacturer: 'Maker', modelName: 'Rod', active: true }); await db.lines.put({ id: 8, material: 'PE', active: true })
  await db.reels.put({ id: 7, manufacturer: 'Maker', modelName: 'Reel', mainLineId: 8, active: true }); await db.tackleSets.put({ id: 9, name: 'Set', rodId: 6, reelId: 7, active: true })
  await db.fishSpecies.put({ fish_id: 'user:fish', group: 'ニジマス', display_name: 'テスト魚', aliases: '', region: '', lineage_or_type: '', source_status: '', notes: '', source_url: '', active: true, origin: 'user' })
}
beforeEach(async () => { await db.open(); for (const table of db.tables) await table.clear(); await seed() })
after(async () => { db.close(); assert(resolve(directory).startsWith(resolve(tmpdir()) + sep)); await rm(directory, { recursive: true, force: true }) })
async function acquire(body = actual) { await saveWeatherLocation(1, 36.611, 139.194); await fetchTripWeather(1, { now, fetcher: mock(body) }); return readTripWeather(1) }

test('real archive fixture is unmodified, credited, and includes surface pressure', () => {
  assert.equal(createHash('sha256').update(rawBytes).digest('hex'), provenance.sha256)
  assert.equal(provenance.license, 'CC BY 4.0'); assert(provenance.sourceUrl.startsWith('https://archive-api.open-meteo.com/v1/archive?'))
  assert(actual.hourly.surface_pressure.some(n => typeof n === 'number')); assert.equal(actual.hourly.time.length, 24)
})
test('JST start date, UTC boundary, leap day, end day and invalid chronology', () => {
  assert.equal(jstDay(new Date('2026-10-16T14:59:59Z')), '2026-10-16')
  assert.equal(jstDay(new Date('2026-10-16T15:00:00Z')), '2026-10-17')
  assert.equal(jstDay(new Date('2024-02-28T15:00:00Z')), '2024-02-29')
  assert.deepEqual(weatherTripRange({ startedAt: new Date('2026-10-16T21:03:12.160Z'), endedAt: new Date('2026-10-17T16:00:00Z') }), { startDayJst: '2026-10-17', endDayJst: '2026-10-18' })
  assert.throws(() => weatherTripRange({ startedAt: new Date(), endedAt: new Date(0) }))
})
test('manual request only, archive parameters, distinct requested/grid locations, and all 16 stores unchanged', async () => {
  const before = await snapshot(); await saveWeatherLocation(1, 36.611, 139.194)
  let calls = 0
  await fetchTripWeather(1, { now, fetcher: async (url, options) => {
    calls++; const query = new URL(url); assert.equal(query.origin + query.pathname, 'https://archive-api.open-meteo.com/v1/archive')
    assert.equal(query.searchParams.get('start_date'), '2026-10-17'); assert.equal(query.searchParams.get('end_date'), '2026-10-17')
    assert.equal(query.searchParams.get('timezone'), 'Asia/Tokyo'); assert.equal(query.searchParams.get('timeformat'), 'unixtime'); assert.equal(query.searchParams.get('wind_speed_unit'), 'ms'); assert(query.searchParams.get('hourly').includes('surface_pressure'))
    assert.equal(options.credentials, 'omit'); return mock()(url)
  } })
  assert.equal(calls, 1); const state = await readTripWeather(1)
  assert.equal(state.hours.length, 24); assert.equal(state.hours[0].timestamp, Date.parse('2026-10-16T15:00:00Z'))
  assert.equal(state.hours[0].surfacePressureHpa, actual.hourly.surface_pressure[0]); assert.notEqual(state.location.longitude, state.requests[0].response.longitude)
  assert.deepEqual(await snapshot(), before); assert.equal((await db.trips.get(1)).fishingDate, '2026-10-16')
})
test('cross-midnight trip requests both JST days and stores 48 distinct UTC hours', async () => {
  await db.trips.update(1, { endedAt: new Date('2026-10-17T16:00:00Z') })
  const body = copy(actual); body.hourly.time.push(...actual.hourly.time.map(n => n + 86400))
  // Synthetic second-day protocol test only; never represented as real observations.
  for (const key of Object.keys(body.hourly)) if (key !== 'time') body.hourly[key].push(...Array(24).fill(null))
  const state = await acquire(body); assert.equal(state.hours.length, 48); assert.equal(state.requests[0].status, 'partial')
  assert.equal(state.requests[0].endDayJst, '2026-10-18'); assert.equal(new Set(state.hours.map(h => h.timestamp)).size, 48)
})
test('re-fetch is atomic and idempotent; nulls stay null and reduced coverage preserves prior success', async () => {
  const first = await acquire(); await fetchTripWeather(1, { now, fetcher: mock() })
  assert.equal(await db.tripWeatherHours.count(), 24)
  const success = (await readTripWeather(1)).hours, missing = copy(actual); missing.hourly.temperature_2m[0] = null
  await assert.rejects(fetchTripWeather(1, { now, fetcher: mock(missing) }), /欠損/)
  assert.deepEqual((await readTripWeather(1)).hours, success)
  await db.tripWeatherHours.clear(); await fetchTripWeather(1, { now, fetcher: mock(missing) })
  const partial = await readTripWeather(1); assert.equal(partial.hours[0].temperatureC, null); assert.equal(partial.requests.at(-1).missingValues, 1)
  assert.equal(first.hours[0].precipitationMm, actual.hourly.precipitation[0])
})
for (const status of [400, 429, 500]) test(`API ${status} preserves cached hours and all existing records`, async () => {
  const { hours } = await acquire(), before = await snapshot()
  await assert.rejects(fetchTripWeather(1, { now, fetcher: mock({}, status) }))
  assert.deepEqual((await readTripWeather(1)).hours, hours); assert.deepEqual(await snapshot(), before)
})
test('current-day delay never calls forecast or archive, and all-null past data remains unavailable', async () => {
  await saveWeatherLocation(1, 36.611, 139.194); let calls = 0
  await assert.rejects(fetchTripWeather(1, { now: new Date('2026-10-17T10:00:00Z'), fetcher: async () => { calls++; throw Error('unexpected') } }), /提供/)
  assert.equal(calls, 0)
  const missing = copy(actual); for (const key of Object.keys(missing.hourly)) if (key !== 'time') missing.hourly[key] = Array(24).fill(null)
  await assert.rejects(fetchTripWeather(1, { now, fetcher: mock(missing) }), /提供/)
  assert.equal(await db.tripWeatherHours.count(), 0); assert.equal((await readTripWeather(1)).requests.at(-1).status, 'unavailable')
  assert.equal((await readTripWeather(1)).requests.at(-1).response.longitude, actual.longitude)
  assert.equal((await readTripWeather(1)).requests.at(-1).missingValues, 144)
})
test('malformed responses, duplicate hours, wrong units and invalid coordinates never replace saved hours', async () => {
  const { hours, requests } = await acquire(), request = requests[0]
  const variants = [v => { v.hourly.time[1] = v.hourly.time[0] }, v => { v.hourly_units.wind_speed_10m = 'km/h' }, v => { v.hourly.temperature_2m[0] = '13' }, v => { v.utc_offset_seconds = 0 }, v => { v.hourly.time[0] += 1 }]
  for (const mutate of variants) { const body = copy(actual); mutate(body); assert.throws(() => parseWeatherResponse(body, request, new Date().toISOString())) }
  for (const [lat, lon] of [[NaN, 139], [91, 139], [36, -181], [Infinity, 139]]) await assert.rejects(saveWeatherLocation(1, lat, lon))
  assert.deepEqual((await readTripWeather(1)).hours, hours)
})
test('offline/network abort preserves cache and allows a later manual retry', async () => {
  const { hours } = await acquire(), abort = new AbortController(); abort.abort()
  await assert.rejects(fetchTripWeather(1, { now, signal: abort.signal, fetcher: async (_, { signal }) => { assert(signal.aborted); throw Error('offline') } }))
  assert.deepEqual((await readTripWeather(1)).hours, hours)
  await fetchTripWeather(1, { now, fetcher: mock() }); assert.equal((await readTripWeather(1)).requests.at(-1).status, 'complete')
})
test('concurrent requests: newer completion wins; changed coordinates and deleted trips block stale writes', async () => {
  await saveWeatherLocation(1, 36.611, 139.194)
  let release, started; const ready = new Promise(r => { started = r })
  const pending = fetchTripWeather(1, { now, fetcher: async () => { started(); await new Promise(r => { release = r }); return mock()() } })
  const rejected = assert.rejects(pending, /変わった/); await ready
  await fetchTripWeather(1, { now, fetcher: mock() }); const saved = (await readTripWeather(1)).hours
  release(); await rejected; assert.deepEqual((await readTripWeather(1)).hours, saved)
  let deleted = false
  await assert.rejects(fetchTripWeather(1, { now, fetcher: async () => { await deleteFishingTrip(1, await getTripDeletionSummary(1)); deleted = true; return mock()() } }), /変わった/)
  assert(deleted); for (const name of weatherTableNames) assert.equal(await db.table(name).count(), 0)
})
test('changing the manual point or trip end during fetch prevents overwriting old data', async () => {
  const { hours } = await acquire()
  await assert.rejects(fetchTripWeather(1, { now, fetcher: async () => { await saveWeatherLocation(1, 36.612, 139.195); return mock()() } }), /変わった/)
  assert.deepEqual((await readTripWeather(1)).hours, hours)
  await assert.rejects(fetchTripWeather(1, { now, fetcher: async () => { await db.trips.update(1, { endedAt: new Date('2026-10-18T06:00:00Z') }); return mock()() } }), /変わった/)
  assert.deepEqual((await readTripWeather(1)).hours, hours)
})
test('missing hourly slot and missing variable are explicit nulls, not fabricated zeroes', async () => {
  const body = copy(actual)
  for (const array of Object.values(body.hourly)) array.splice(5, 1)
  delete body.hourly.relative_humidity_2m
  const state = await acquire(body)
  assert.equal(state.hours.length, 24); assert.equal(state.requests[0].missingHours, 1)
  assert.equal(state.requests[0].missingValues, 29)
  assert(state.hours.every(h => h.relativeHumidityPct === null))
  assert(weatherFields.every(f => state.hours[5][f] === null))
})
test('v7 backup round trip includes all 19 tables; malformed weather rejected atomically; v6 remains readable', async () => {
  await acquire(); const before = await snapshot(), backup = copy(await createBackup())
  assert.equal(backup.version, 7); assert.equal(Object.keys(backup.data).length, 19); validateBackup(backup)
  assert.equal(backup.data.tripWeatherRequests[0].licenseUrl, 'https://creativecommons.org/licenses/by/4.0/')
  assert.equal(backup.data.tripWeatherRequests[0].sourceUrl, 'https://open-meteo.com/')
  await importBackup({ text: async () => JSON.stringify(backup) }); assert.deepEqual(copy((await createBackup()).data), backup.data); assert.deepEqual(await snapshot(), before)
  for (const mutate of [v => { v.data.tripWeatherHours.push(v.data.tripWeatherHours[0]) }, v => { v.data.tripWeatherHours[0].requestId = 999 }, v => { v.data.tripWeatherHours[0].timestamp += 1 }, v => { v.data.tripWeatherRequests[0].endpoint = 'https://invalid.test/' }]) {
    const broken = copy(backup); mutate(broken); await assert.rejects(importBackup({ text: async () => JSON.stringify(broken) })); assert.deepEqual(copy((await createBackup()).data), backup.data)
  }
  const old = copy(backup); old.version = 6; for (const name of weatherTableNames) delete old.data[name]
  await importBackup({ text: async () => JSON.stringify(old) }); assert.deepEqual(await snapshot(), before)
  for (const name of weatherTableNames) assert.equal(await db.table(name).count(), 0)
  assert.equal((await createBackup()).version, 6)
})
test('v7 to v8 migration is additive and preserves all 16 populated legacy tables', async () => {
  const before = await snapshot(), marker = "new Dexie('FishingLogDatabase')", name = "new Dexie('FishingLogWeatherMigrationTest')"
  const legacyFile = join(directory, 'legacy7.mjs'), upgradedFile = join(directory, 'upgraded8.mjs')
  await writeFile(legacyFile, compile(databaseSource.slice(0, databaseSource.indexOf('db.version(8)')).replace(marker, name)).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie'))))
  await writeFile(upgradedFile, compile(databaseSource.replace(marker, name)).replace("'dexie'", JSON.stringify(import.meta.resolve('dexie'))))
  const { db: legacy } = await import(pathToFileURL(legacyFile).href)
  for (const [name, rows] of Object.entries(before)) await legacy.table(name).bulkAdd(rows.map(row => ({ ...row,
    ...(name === 'trips' ? { startedAt: new Date(row.startedAt), endedAt: new Date(row.endedAt) } : {}),
    ...(name === 'catches' ? { caughtAt: new Date(row.caughtAt) } : {}), ...(name === 'tripEvents' ? { occurredAt: new Date(row.occurredAt) } : {}),
  })))
  assert.equal(legacy.verno, 7); legacy.close()
  const { db: upgraded } = await import(pathToFileURL(upgradedFile).href); await upgraded.open()
  try { assert.equal(upgraded.verno, 8); assert.equal(upgraded.tables.length, 19)
    for (const [name, rows] of Object.entries(before)) assert.deepEqual(copy(await upgraded.table(name).toArray()), rows)
    for (const name of weatherTableNames) assert.equal(await upgraded.table(name).count(), 0)
  } finally { upgraded.close() }
})

// PR3: run against the same isolated v8 DB and full v7 backup coverage as PR2.
async function reuseTarget(id = 2, facilityId = 'official:nihon-iwana-center') {
  await db.trips.put({ ...(await db.trips.get(1)), id, facilityId, startedAt: new Date('2026-10-18T00:00:00Z'), endedAt: new Date('2026-10-18T06:00:00Z') })
}
test('PR3 manual candidates require earlier identical facility IDs, never name matching, and discovery changes no table', async () => {
  await acquire(); await reuseTarget(); await reuseTarget(3, 'user:weather'); await reuseTarget(4, undefined)
  await db.trips.update(4, { facilityId: undefined })
  const full = () => Promise.all(db.tables.map(t => t.toArray())).then(copy)
  const before = await full(), candidates = await findReusableWeatherLocations(2)
  assert.equal(candidates.length, 1); assert.equal(candidates[0].sourceTripId, 1)
  assert.deepEqual(await findReusableWeatherLocations(3), []); assert.deepEqual(await findReusableWeatherLocations(4), [])
  await db.trips.update(2, { startedAt: new Date('2026-10-15T00:00:00Z') })
  assert.deepEqual(await findReusableWeatherLocations(2), [])
  await db.trips.update(2, { startedAt: new Date('2026-10-18T00:00:00Z') })
  assert.deepEqual(await full(), before)
})
test('PR3 explicit reuse writes only target location; keeps all original records and full v7 backup round trip', async () => {
  await acquire(); await reuseTarget()
  const before = await snapshot(), weather = await readTripWeather(1)
  const [candidate] = await findReusableWeatherLocations(2)
  await reuseWeatherLocation(2, candidate)
  assert.equal((await db.tripWeatherLocations.get(2)).latitude, candidate.latitude)
  assert.deepEqual(await readTripWeather(1), weather); assert.deepEqual(await snapshot(), before)
  assert.deepEqual(await findReusableWeatherLocations(2), [])
  await assert.rejects(reuseWeatherLocation(2, candidate))
  const exported = await createBackup(); assert.equal(exported.version, 7); assert.equal(Object.keys(exported.data).length, 19)
  const tables = copy(await Promise.all(db.tables.map(t => t.toArray())))
  await importBackup({ text: async () => JSON.stringify(exported) }); assert.deepEqual(copy(await Promise.all(db.tables.map(t => t.toArray()))), tables)
  assert.equal(db.verno, 8)
})
test('PR3 multiple points remain distinct; identical points grouped; stale source cannot overwrite target', async () => {
  await saveWeatherLocation(1, 36.611, 139.194); await reuseTarget(2); await reuseTarget(3)
  await db.trips.update(3, { startedAt: new Date('2026-10-17T12:00:00Z') }); await saveWeatherLocation(3, 36.612, 139.195)
  await reuseTarget(4); await db.trips.update(4, { startedAt: new Date('2026-10-17T13:00:00Z') }); await saveWeatherLocation(4, 36.611, 139.194)
  const candidates = await findReusableWeatherLocations(2)
  assert.equal(candidates.length, 2); assert.equal(candidates.find(c => c.latitude === 36.611).uses, 2)
  const candidate = candidates.find(c => c.sourceTripId === 3)
  await saveWeatherLocation(3, 37, 140)
  await assert.rejects(reuseWeatherLocation(2, candidate)); assert.equal(await db.tripWeatherLocations.get(2), undefined)
  const [fresh] = await findReusableWeatherLocations(2)
  await db.trips.update(2, { facilityId: 'user:weather' })
  await assert.rejects(reuseWeatherLocation(2, fresh)); assert.equal(await db.tripWeatherLocations.get(2), undefined)
})
