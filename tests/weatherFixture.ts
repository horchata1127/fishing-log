import { readFileSync } from 'node:fs'
import { stage6Backup } from './stage6Fixture'

// Test runner only. Raw captured API response, never served or imported by production code.
export const weatherResponse = JSON.parse(readFileSync(new URL('./fixtures/rc25-iwana-2026-10-17.open-meteo.json', import.meta.url), 'utf8'))
export const weatherTripId = 95000
export const weatherTripName = '日本イワナセンター（RC25気象検証）'
export const weatherStoreNames = ['tripWeatherLocations', 'tripWeatherHours', 'tripWeatherRequests'] as const
export function weatherScenario() {
  const backup = stage6Backup()
  const data = backup.data as Record<string, any[]>
  data.trips!.push({ id: weatherTripId, fishingAreaName: weatherTripName, fishingDate: '2026-10-16', fishingStyle: 'AREA_TROUT',
    facilityId: 'official:nihon-iwana-center', currentZoneId: 'official:nihon-iwana-center:pond-9',
    startedAt: '2026-10-16T21:03:12.160Z', endedAt: '2026-10-17T06:25:00.000Z' })
  for (const [index, time] of ['06:21','10:13','11:22','13:57','14:21','14:53','15:16'].entries()) {
    data.catches!.push({ id: weatherTripId + index, tripId: weatherTripId, caughtAt: new Date(`2026-10-17T${time}:00+09:00`).toISOString(),
      facilityId: 'official:nihon-iwana-center', zoneId: 'official:nihon-iwana-center:pond-9',
      locationSnapshot: { facilityName: '日本イワナセンター', zoneName: '9号池' } })
  }
  // Actual pellet time is unknown. Do not create an event for this trip.
  return backup
}
