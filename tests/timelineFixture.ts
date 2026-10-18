import type { Page } from '@playwright/test'
import { weatherResponse, weatherScenario, weatherTripId } from './weatherFixture'

/** Only synthetic trips and the existing captured archive; never reads user backups. */
export function timelineScenario(missing = false) {
  const base = weatherScenario(), data = base.data as Record<string, any[]>
  const trip = data.trips!.find(t => t.id === weatherTripId)
  const fetchedAt = '2026-10-23T00:00:00.000Z'
  const location = { tripId: weatherTripId, latitude: 36.611, longitude: 139.194, locationSource: 'manual', coordinateSystem: 'WGS84', facilityId: trip.facilityId, facilityName: trip.fishingAreaName, updatedAt: fetchedAt }
  data.tripWeatherLocations = [location]
  data.tripWeatherRequests = [{ id: 1, tripId: weatherTripId, status: missing ? 'partial' : 'complete', createdAt: fetchedAt, fetchedAt,
    startDayJst: '2026-10-17', endDayJst: '2026-10-17', tripStartedAt: trip.startedAt, tripEndedAt: trip.endedAt, location,
    apiName: 'Open-Meteo Historical Weather API', endpoint: 'https://archive-api.open-meteo.com/v1/archive', license: 'CC BY 4.0', model: 'best_match',
    sourceUrl: 'https://open-meteo.com/', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Weather data by Open-Meteo.com',
    units: { temperatureC: '°C', precipitationMm: 'mm', windSpeedMs: 'm/s', relativeHumidityPct: '%', surfacePressureHpa: 'hPa', weatherCode: 'wmo code' },
    response: { latitude: weatherResponse.latitude, longitude: weatherResponse.longitude, elevation: weatherResponse.elevation, timezone: weatherResponse.timezone, timezoneAbbreviation: weatherResponse.timezone_abbreviation, utcOffsetSeconds: weatherResponse.utc_offset_seconds },
    missingHours: 0, missingValues: missing ? 1 : 0 }]
  data.tripWeatherHours = weatherResponse.hourly.time.map((t: number, i: number) => ({ tripId: weatherTripId, timestamp: t * 1000, requestId: 1, fetchedAt,
    temperatureC: missing && i === 10 ? null : weatherResponse.hourly.temperature_2m[i], precipitationMm: weatherResponse.hourly.precipitation[i], windSpeedMs: weatherResponse.hourly.wind_speed_10m[i],
    relativeHumidityPct: weatherResponse.hourly.relative_humidity_2m[i], surfacePressureHpa: weatherResponse.hourly.surface_pressure[i], weatherCode: weatherResponse.hourly.weather_code[i] }))
  // Reuse target: a new synthetic trip at the same registered facility.
  data.trips!.push({ ...trip, id: 96000, fishingAreaName: '同一施設の地点再利用テスト', startedAt: '2026-10-18T00:00:00.000Z', endedAt: '2026-10-18T06:00:00.000Z', fishingDate: '2026-10-18' })
  return { ...base, version: 7, data }
}

/** Read all 19 tables only on isolated test origins; never creates/deletes a database. */
export async function timelineState(page: Page) {
  if (!['http://127.0.0.1:4177', 'http://127.0.0.1:4188'].includes(new URL(page.url()).origin)) throw Error('Isolated test origin required')
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('FishingLogDatabase'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.onupgradeneeded = () => { r.transaction?.abort(); reject(Error('DB not ready')) } })
    try { return await new Promise<Record<string, any[]>>((resolve, reject) => {
      const names = Array.from(database.objectStoreNames), tx = database.transaction(names, 'readonly'), rows: Record<string, any[]> = {}
      for (const name of names) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { rows[name] = r.result } }
      tx.oncomplete = () => resolve(JSON.parse(JSON.stringify(rows))); tx.onabort = () => reject(tx.error)
    }) } finally { database.close() }
  })
}
