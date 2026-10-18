import { db, jstDay, weatherTripRange, weatherFields, weatherUnits, validateWeatherCoordinates, validateWeatherLocation, validateWeatherHour,
  validateWeatherRequest, type TripWeatherLocation, type TripWeatherHour, type TripWeatherRequest } from '../db/database'

export const weatherEndpoint = 'https://archive-api.open-meteo.com/v1/archive' as const
export const hourlyVariables = ['temperature_2m', 'precipitation', 'wind_speed_10m', 'relative_humidity_2m', 'surface_pressure', 'weather_code'] as const
const expectedUnits = ['°C', 'mm', 'm/s', '%', 'hPa', 'wmo code']
export class WeatherUnavailable extends Error {
  readonly details?: Pick<TripWeatherRequest, 'response' | 'missingHours' | 'missingValues'>
  constructor(message: string, details?: Pick<TripWeatherRequest, 'response' | 'missingHours' | 'missingValues'>) { super(message); this.details = details }
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('気象APIの応答形式が不正です。')
  return value as Record<string, unknown>
}
export function weatherApiUrl(request: Pick<TripWeatherRequest, 'location' | 'startDayJst' | 'endDayJst'>) {
  const query = new URLSearchParams({ latitude: String(request.location.latitude), longitude: String(request.location.longitude),
    start_date: request.startDayJst, end_date: request.endDayJst, hourly: hourlyVariables.join(','), timezone: 'Asia/Tokyo',
    timeformat: 'unixtime', wind_speed_unit: 'ms', temperature_unit: 'celsius', precipitation_unit: 'mm' })
  return `${weatherEndpoint}?${query}`
}
export function parseWeatherResponse(value: unknown, request: TripWeatherRequest & { id: number }, fetchedAt: string) {
  const data = object(value), hourly = object(data.hourly), units = object(data.hourly_units)
  validateWeatherCoordinates(data.latitude, data.longitude)
  const response: NonNullable<TripWeatherRequest['response']> = {
    latitude: data.latitude as number, longitude: data.longitude as number,
    elevation: data.elevation === null || data.elevation === undefined ? null : data.elevation as number,
    timezone: data.timezone as string, timezoneAbbreviation: typeof data.timezone_abbreviation === 'string' ? data.timezone_abbreviation : '', utcOffsetSeconds: data.utc_offset_seconds as number,
  }
  if (units.time !== 'unixtime' || !Array.isArray(hourly.time)) throw new Error('気象APIの時刻形式が不正です。')
  const start = Date.parse(`${request.startDayJst}T00:00:00+09:00`), end = Date.parse(`${request.endDayJst}T00:00:00+09:00`) + 86400000
  if (!Number.isFinite(start) || end <= start || end - start > 366 * 86400000) throw new Error('気象取得は開始・終了日の366日以内に対応しています。')
  const timestamps = hourly.time.map(t => {
    if (typeof t !== 'number' || !Number.isSafeInteger(t * 1000) || (t * 1000) % 3600000 !== 0 || t * 1000 < start || t * 1000 >= end) throw new Error('気象APIの対象時刻が不正です。')
    return t * 1000
  })
  if (new Set(timestamps).size !== timestamps.length) throw new Error('気象APIの時刻が重複しています。')
  for (const [index, variable] of hourlyVariables.entries()) {
    const values = hourly[variable]
    if (values === undefined) continue // A missing variable is missing data, never zero.
    if (!Array.isArray(values) || values.length !== timestamps.length || units[variable] !== expectedUnits[index]) throw new Error('気象APIの配列・単位が不正です。')
  }
  const byTime = new Map(timestamps.map((time, index) => [time, index]))
  const hours: TripWeatherHour[] = []
  let missingHours = 0, missingValues = 0
  for (let timestamp = start; timestamp < end; timestamp += 3600000) {
    const index = byTime.get(timestamp)
    if (index === undefined) missingHours++
    const values = Object.fromEntries(weatherFields.map((field, i) => {
      const array = hourly[hourlyVariables[i]!]
      const value = index === undefined || array === undefined ? null : (array as unknown[])[index]
      if (value === null) missingValues++
      return [field, value]
    }))
    const row = { tripId: request.tripId, timestamp, ...values, requestId: request.id, fetchedAt } as TripWeatherHour
    validateWeatherHour(row); hours.push(row)
  }
  validateWeatherRequest({ ...request, response, missingHours, missingValues })
  if (!hours.length || missingValues === hours.length * weatherFields.length) throw new WeatherUnavailable('アーカイブデータはまだ提供されていないか、全項目が欠損しています。保存済みデータは保持しています。日をおいて再試行してください。', { response, missingHours, missingValues })
  const completed = { ...request, response, fetchedAt, missingHours, missingValues, status: missingValues ? 'partial' : 'complete' } as TripWeatherRequest
  validateWeatherRequest(completed)
  return { hours, completed }
}

export async function saveWeatherLocation(tripId: number, latitude: number, longitude: number) {
  validateWeatherCoordinates(latitude, longitude)
  return db.transaction('rw', [db.trips, db.tripWeatherLocations], async () => {
    const trip = await db.trips.get(tripId)
    if (!trip) throw new Error('釣行が見つかりません。')
    const location: TripWeatherLocation = { tripId, latitude, longitude, locationSource: 'manual', coordinateSystem: 'WGS84',
      facilityName: trip.fishingAreaName, ...(trip.facilityId ? { facilityId: trip.facilityId } : {}), updatedAt: new Date().toISOString() }
    validateWeatherLocation(location); await db.tripWeatherLocations.put(location)
    return location
  })
}
export async function readTripWeather(tripId: number) {
  return db.transaction('r', [db.tripWeatherLocations, db.tripWeatherHours, db.tripWeatherRequests], async () => ({
    location: await db.tripWeatherLocations.get(tripId),
    hours: await db.tripWeatherHours.where('tripId').equals(tripId).sortBy('timestamp'),
    requests: await db.tripWeatherRequests.where('tripId').equals(tripId).sortBy('id'),
  }))
}

// Only called by the explicit user action; no timers, retries, forecast fallback or background requests.
export async function fetchTripWeather(tripId: number, options: { fetcher?: typeof fetch; signal?: AbortSignal; now?: Date } = {}) {
  const now = options.now ?? new Date()
  const request = await db.transaction('rw', [db.trips, db.tripWeatherLocations, db.tripWeatherRequests], async () => {
    const trip = await db.trips.get(tripId), location = await db.tripWeatherLocations.get(tripId)
    if (!trip || !location) throw new Error('釣行の緯度・経度を先に保存してください。')
    const range = weatherTripRange(trip)
    const start = Date.parse(`${range.startDayJst}T00:00:00+09:00`), end = Date.parse(`${range.endDayJst}T00:00:00+09:00`)
    if (range.startDayJst < '1940-01-01' || end - start >= 366 * 86400000) throw new Error('気象取得は1940年以降、366日以内の釣行に対応しています。')
    const row: TripWeatherRequest = { tripId, ...range, location: { ...location }, status: 'pending', createdAt: now.toISOString(),
      tripStartedAt: new Date(trip.startedAt).toISOString(), ...(trip.endedAt ? { tripEndedAt: new Date(trip.endedAt).toISOString() } : {}),
      apiName: 'Open-Meteo Historical Weather API', endpoint: weatherEndpoint, license: 'CC BY 4.0', model: 'best_match',
      sourceUrl: 'https://open-meteo.com/', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Weather data by Open-Meteo.com', units: { ...weatherUnits } }
    const id = await db.tripWeatherRequests.add(row)
    if (id === undefined) throw new Error('気象取得IDを保存できませんでした。')
    return { ...row, id }
  })
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 20000)
  try {
    if (request.endDayJst >= jstDay(now)) throw new WeatherUnavailable('当日・未来日のアーカイブは取得待ちです。対象日が終わり、データが提供されてから再試行してください。予報値での代用は行いません。')
    const response = await (options.fetcher ?? fetch)(weatherApiUrl(request), { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!response.ok) {
      if (response.status === 400) throw new WeatherUnavailable('対象期間のアーカイブを取得できませんでした。提供遅延や対象日を確認し、日をおいて再試行してください。')
      throw new Error(response.status === 429 ? '気象APIの利用上限です。時間をおいて再試行してください。' : `気象APIエラー（${response.status}）。保存済みデータは保持しています。`)
    }
    const parsed = parseWeatherResponse(await response.json(), request, new Date().toISOString())
    await db.transaction('rw', [db.trips, db.tripWeatherLocations, db.tripWeatherHours, db.tripWeatherRequests], async () => {
      const trip = await db.trips.get(tripId), location = await db.tripWeatherLocations.get(tripId)
      const latest = (await db.tripWeatherRequests.where('tripId').equals(tripId).sortBy('id')).at(-1)
      if (!trip || !location || new Date(trip.startedAt).toISOString() !== request.tripStartedAt ||
          (trip.endedAt ? new Date(trip.endedAt).toISOString() : undefined) !== request.tripEndedAt || JSON.stringify(location) !== JSON.stringify(request.location) || latest?.id !== request.id || latest.createdAt !== request.createdAt || latest.status !== 'pending' || controller.signal.aborted) {
        throw new Error('取得中に釣行・地点・取得操作が変わったため保存しませんでした。再試行してください。')
      }
      const old = await db.tripWeatherHours.where('tripId').equals(tripId).toArray()
      const previousRequests = new Map((await db.tripWeatherRequests.where('tripId').equals(tripId).toArray()).map(r => [r.id, r]))
      const oldByTime = new Map(old.map(h => [h.timestamp, h]))
      for (const h of parsed.hours) {
        const previous = oldByTime.get(h.timestamp), p = previous && previousRequests.get(previous.requestId)
        if (previous && p?.location.latitude === location.latitude && p?.location.longitude === location.longitude && weatherFields.some(f => h[f] === null && previous[f] !== null)) {
          throw new WeatherUnavailable('再取得データの欠損が増えていたため、保存済みデータを保持しました。日をおいて再試行してください。', { response: parsed.completed.response, missingHours: parsed.completed.missingHours, missingValues: parsed.completed.missingValues })
        }
      }
      await db.tripWeatherHours.where('tripId').equals(tripId).delete()
      await db.tripWeatherHours.bulkPut(parsed.hours)
      await db.tripWeatherRequests.put(parsed.completed)
    })
  } catch (error) {
    const message = controller.signal.aborted ? '気象取得を中止しました（通信タイムアウトを含みます）。保存済みデータは保持しています。'
      : error instanceof TypeError ? '通信できませんでした。接続状態を確認して再試行してください。保存済みデータは保持しています。'
      : error instanceof SyntaxError ? '気象APIの応答を読み込めませんでした。保存済みデータは保持しています。'
      : error instanceof Error ? error.message : '気象データを取得できませんでした。'
    await db.transaction('rw', [db.trips, db.tripWeatherRequests], async () => {
      // Deletion/restore during the network request must never resurrect a child row.
      const stored = await db.tripWeatherRequests.get(request.id)
      if (await db.trips.get(tripId) && stored?.tripId === tripId && stored.createdAt === request.createdAt && stored.status === 'pending') await db.tripWeatherRequests.update(request.id, {
        status: error instanceof WeatherUnavailable ? 'unavailable' : 'error', fetchedAt: new Date().toISOString(), message,
        ...(error instanceof WeatherUnavailable ? error.details : {}),
      })
    })
    throw new Error(message)
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener('abort', abort)
  }
}
