import { rc31Fixture } from './rc31Fixture'

/** Synthetic RC31-style v7 backup only. No real backup file or network response is read. */
export function rc32ReleaseFixture() {
  const source = rc31Fixture(), data = source.data as Record<string, any[]>
  for (let i = 0; i < 83; i++) data.lureVariants!.push({ id: 10000 + i, modelId: 144, colorName: `追加合成色 ${i}` })
  for (const [i, variant] of data.lureVariants!.entries()) if (i < 1400) variant.colorName = `レッド ${i}`
  data.rods = [{ id: 1, manufacturer: 'Synthetic', modelName: 'Rod', active: true }]
  data.lines = [{ id: 1, material: 'PE', active: true }]
  data.reels = [{ id: 1, manufacturer: 'Synthetic', modelName: 'Reel', mainLineId: 1, active: true }]
  data.tackleSets = [{ id: 1, name: 'Synthetic set', rodId: 1, reelId: 1, active: true }]
  data.fishSpecies = [{ fish_id: 'synthetic:fish', group: 'ニジマス', display_name: '合成テスト魚', aliases: '', region: '', lineage_or_type: '', source_status: '', notes: '', source_url: '', active: true, origin: 'user' }]
  const fetchedAt = '2026-10-25T00:00:00.000Z', location = data.tripWeatherLocations![0]!
  data.tripWeatherRequests = [{ id: 77, tripId: 13, status: 'complete', createdAt: fetchedAt, fetchedAt,
    apiName: 'Open-Meteo Historical Weather API', endpoint: 'https://archive-api.open-meteo.com/v1/archive', license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Weather data by Open-Meteo.com', sourceUrl: 'https://open-meteo.com/',
    units: { temperatureC: '°C', precipitationMm: 'mm', windSpeedMs: 'm/s', relativeHumidityPct: '%', surfacePressureHpa: 'hPa', weatherCode: 'wmo code' },
    model: 'best_match', startDayJst: '2026-10-24', endDayJst: '2026-10-24', tripStartedAt: new Date(data.trips![0]!.startedAt).toISOString(), tripEndedAt: new Date(data.trips![0]!.endedAt).toISOString(),
    location, response: { latitude: 36.7, longitude: 137.8, elevation: 100, timezone: 'Asia/Tokyo', timezoneAbbreviation: 'JST', utcOffsetSeconds: 32400 }, missingHours: 0, missingValues: 0 }]
  data.tripWeatherHours = Array.from({ length: 24 }, (_, i) => ({ tripId: 13, timestamp: Date.parse('2026-10-23T15:00:00Z') + i * 3600000,
    temperatureC: 10, precipitationMm: 0, windSpeedMs: 2, relativeHumidityPct: 60, surfacePressureHpa: 1013, weatherCode: 0, requestId: 77, fetchedAt }))
  return { ...source, data }
}
