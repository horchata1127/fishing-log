import Dexie, { type EntityTable, type Table } from 'dexie'
import type { FlatOfficialFacility, FlatOfficialZone, UserFacility, UserZone, AppliedMaster } from '../utils/facilityMaster'

export type FishingStyle =
  | 'AREA_TROUT'
  | 'CHUBBING'
  | 'NATIVE_TROUT'
  | 'BASS'
  | 'OTHER'

export interface FishingTrip {
  id?: number
  fishingAreaName: string
  /** Device-local calendar day (YYYY-MM-DD), not a UTC timestamp. */
  fishingDate: string
  fishingStyle: FishingStyle
  weather?: string
  temperatureC?: number
  waterTemperatureC?: number
  startedAt: Date
  endedAt?: Date
  memo?: string
  tackleSetIds?: number[]
  facilityId?: string
  currentZoneId?: string
}

export type TripEventType = 'stocking' | 'pellet'

export interface TripEvent {
  id?: number
  tripId: number
  type: TripEventType
  occurredAt: Date
  note?: string
}

// RC25: UTC milliseconds for joins with catches.caughtAt / tripEvents.occurredAt.
export interface TripWeatherLocation {
  tripId: number
  latitude: number
  longitude: number
  locationSource: 'manual'
  coordinateSystem: 'WGS84'
  facilityId?: string
  facilityName: string
  updatedAt: string
}
export const weatherFields = ['temperatureC', 'precipitationMm', 'windSpeedMs', 'relativeHumidityPct', 'surfacePressureHpa', 'weatherCode'] as const
export const weatherUnits = { temperatureC: '°C', precipitationMm: 'mm', windSpeedMs: 'm/s', relativeHumidityPct: '%', surfacePressureHpa: 'hPa', weatherCode: 'wmo code' } as const
export interface TripWeatherHour {
  tripId: number
  timestamp: number
  temperatureC: number | null
  precipitationMm: number | null
  windSpeedMs: number | null
  relativeHumidityPct: number | null
  surfacePressureHpa: number | null
  weatherCode: number | null
  requestId: number
  fetchedAt: string
}
export interface TripWeatherRequest {
  id?: number
  tripId: number
  status: 'pending' | 'complete' | 'partial' | 'unavailable' | 'error' | 'superseded'
  createdAt: string
  fetchedAt?: string
  apiName: 'Open-Meteo Historical Weather API'
  endpoint: 'https://archive-api.open-meteo.com/v1/archive'
  license: 'CC BY 4.0'
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
  attribution: 'Weather data by Open-Meteo.com'
  sourceUrl: 'https://open-meteo.com/'
  units: typeof weatherUnits
  model: 'best_match'
  startDayJst: string
  endDayJst: string
  tripStartedAt: string
  tripEndedAt?: string
  location: TripWeatherLocation
  response?: { latitude: number; longitude: number; elevation: number | null; timezone: string; timezoneAbbreviation: string; utcOffsetSeconds: number }
  missingHours?: number
  missingValues?: number
  message?: string
}
export const weatherTableNames = ['tripWeatherLocations', 'tripWeatherHours', 'tripWeatherRequests'] as const
export function jstDay(value: Date | number): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('釣行日時が不正です。')
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
export function weatherTripRange(trip: FishingTrip) {
  const start = new Date(trip.startedAt), end = new Date(trip.endedAt ?? trip.startedAt)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) throw new Error('釣行の開始・終了日時を確認してください。')
  return { startDayJst: jstDay(start), endDayJst: jstDay(end) }
}
function weatherObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('気象データの形式が不正です。')
  return value as Record<string, unknown>
}
function weatherId(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('気象データのIDが不正です。')
}
function utcString(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('気象データのUTC日時が不正です。')
}
export function validateWeatherCoordinates(latitude: unknown, longitude: unknown) {
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('緯度は-90〜90、経度は-180〜180の数値を入力してください。')
}
export function validateWeatherLocation(value: unknown): asserts value is TripWeatherLocation {
  const row = weatherObject(value); weatherId(row.tripId); validateWeatherCoordinates(row.latitude, row.longitude); utcString(row.updatedAt)
  if (row.locationSource !== 'manual' || row.coordinateSystem !== 'WGS84' || typeof row.facilityName !== 'string' ||
      (row.facilityId !== undefined && typeof row.facilityId !== 'string')) throw new Error('気象地点の設定方法・施設情報が不正です。')
}
export function validateWeatherHour(value: unknown): asserts value is TripWeatherHour {
  const row = weatherObject(value); weatherId(row.tripId); weatherId(row.requestId); utcString(row.fetchedAt)
  if (!Number.isSafeInteger(row.timestamp) || (row.timestamp as number) % 3600000 !== 0 || !Number.isFinite(new Date(row.timestamp as number).getTime())) throw new Error('気象時刻が不正です。')
  for (const field of weatherFields) {
    const n = row[field]
    if (n !== null && (typeof n !== 'number' || !Number.isFinite(n))) throw new Error(`気象値 ${field} が不正です。`)
    if (n === null) continue
    if ((field === 'precipitationMm' || field === 'windSpeedMs' || field === 'surfacePressureHpa') && (n as number) < 0) throw new Error('気象値の範囲が不正です。')
    if (field === 'relativeHumidityPct' && ((n as number) < 0 || (n as number) > 100)) throw new Error('湿度の範囲が不正です。')
    if (field === 'weatherCode' && (!Number.isInteger(n) || ![0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(n as number))) throw new Error('天気コードが不正です。')
  }
}
export function validateWeatherRequest(value: unknown): asserts value is TripWeatherRequest {
  const row = weatherObject(value); weatherId(row.id); weatherId(row.tripId); utcString(row.createdAt); validateWeatherLocation(row.location)
  if (row.location.tripId !== row.tripId || row.apiName !== 'Open-Meteo Historical Weather API' || row.endpoint !== 'https://archive-api.open-meteo.com/v1/archive' ||
      row.license !== 'CC BY 4.0' || row.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/' || row.sourceUrl !== 'https://open-meteo.com/' ||
      row.attribution !== 'Weather data by Open-Meteo.com' || row.model !== 'best_match' || !['pending','complete','partial','unavailable','error','superseded'].includes(row.status as string)) throw new Error('気象取得の出典・状態が不正です。')
  const units = weatherObject(row.units)
  if (weatherFields.some(f => units[f] !== weatherUnits[f])) throw new Error('保存気象データの単位が不正です。')
  utcString(row.tripStartedAt); if (row.tripEndedAt !== undefined) utcString(row.tripEndedAt)
  for (const field of ['startDayJst','endDayJst']) {
    const s = row[field]
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10) !== s) throw new Error('気象対象日が不正です。')
  }
  if ((row.startDayJst as string) > (row.endDayJst as string)) throw new Error('気象対象期間が不正です。')
  const range = weatherTripRange({ startedAt: new Date(row.tripStartedAt as string), endedAt: row.tripEndedAt ? new Date(row.tripEndedAt as string) : undefined } as FishingTrip)
  if (range.startDayJst !== row.startDayJst || range.endDayJst !== row.endDayJst) throw new Error('気象取得の対象日と開始・終了日時が一致しません。')
  if (row.fetchedAt !== undefined) utcString(row.fetchedAt)
  if (row.message !== undefined && (typeof row.message !== 'string' || row.message.length > 1000)) throw new Error('気象取得メッセージが不正です。')
  if (row.response !== undefined) {
    const response = weatherObject(row.response); validateWeatherCoordinates(response.latitude, response.longitude)
    if ((response.elevation !== null && (typeof response.elevation !== 'number' || !Number.isFinite(response.elevation))) || response.timezone !== 'Asia/Tokyo' || response.utcOffsetSeconds !== 32400 || typeof response.timezoneAbbreviation !== 'string') throw new Error('気象応答の地点・タイムゾーンが不正です。')
  }
  for (const field of ['missingHours','missingValues']) if (row[field] !== undefined && (!Number.isSafeInteger(row[field]) || (row[field] as number) < 0)) throw new Error('気象欠損情報が不正です。')
  const hours = (Date.parse(row.endDayJst as string) - Date.parse(row.startDayJst as string)) / 3600000 + 24
  if (hours > 366 * 24 || (row.missingHours !== undefined && (row.missingHours as number) > hours) ||
      (row.missingValues !== undefined && (row.missingValues as number) > hours * weatherFields.length)) throw new Error('気象期間・欠損情報の範囲が不正です。')
  if (row.status === 'complete' || row.status === 'partial') {
    if (!row.response || !row.fetchedAt || row.missingHours === undefined || row.missingValues === undefined) throw new Error('気象取得の成功情報が不足しています。')
    if (row.status === 'complete' && (row.missingHours !== 0 || row.missingValues !== 0)) throw new Error('欠損のある気象データを完全とは扱えません。')
    if (row.status === 'partial' && (!(row.missingValues as number) || row.missingValues === hours * weatherFields.length)) throw new Error('一部欠損の状態が不正です。')
  }
}

export type LostDistance = "offshore" | "near" | "landing"
export const catchActions = ['ただ巻き', 'ストップ＆ゴー', 'トゥイッチ', 'ジャーク', 'シェイク',
  'シミーフォール', 'シミーアップ', 'リフト＆フォール', 'ステイ', 'マジックジャーク', 'デジ巻き',
  'ボトムノック', 'ボトムバンプ', 'ボトムトレース', 'ドリフト', 'ダート', 'ボトムステイ', 'その他'] as const
export const actionLengthLabels = { short: '短い', normal: '普通', long: '長い' } as const
export type ActionLength = keyof typeof actionLengthLabels
/** Display fallback only: never persist a default into a legacy record. */
export function actionLengthLabel(value?: ActionLength) { return actionLengthLabels[value ?? 'normal'] }
export function validateCatchAction(row: Record<string, unknown>) {
  if (row.action !== undefined && typeof row.action !== 'string') throw new Error('アクションは文字列で指定してください。')
  if (row.actionLength !== undefined && (typeof row.actionLength !== 'string' || !Object.hasOwn(actionLengthLabels, row.actionLength))) {
    throw new Error('アクションの長さは短い・普通・長いから選択してください。')
  }
}
export const lostDistanceLabels = { offshore: "沖", near: "手前", landing: "キャッチ直前" } as const
export function isCatch(row: { resultType?: string }) { return row.resultType !== "lost" }
export function countResults(rows: CatchRecord[]) {
  return { catches: rows.filter(isCatch).length, lost: rows.filter(row => !isCatch(row)).length,
    distances: Object.fromEntries(Object.keys(lostDistanceLabels).map(key => [key, rows.filter(row => row.resultType === "lost" && row.lostDistance === key).length])) }
}
export function validateCatchResult(row: Record<string, unknown>) {
  if (row.resultType !== undefined && row.resultType !== "catch" && row.resultType !== "lost") throw new Error("結果区分が不正です。")
  if (row.resultType === "lost") {
    if (!["offshore", "near", "landing"].includes(row.lostDistance as string)) throw new Error("バラシの距離を選択してください。")
  } else if (row.lostDistance !== undefined) throw new Error("キャッチにはバラシ距離を保存できません。")
}

export interface CatchRecord {
  resultType?: "catch" | "lost"
  lostDistance?: LostDistance
  id?: number
  tripId: number
  caughtAt: Date

  lureId?: number
  lureVariantId?: number
  tackleSetId?: number
  tackleSnapshot?: TackleSnapshot

  lureName?: string
  lureColor?: string

  rangeLevel?: string
  retrieveSpeed?: string
  action?: string
  actionLength?: ActionLength

  fishSpecies?: string
  fishSpeciesId?: string
  fishSpeciesGroup?: FishGroup
  fishSizeCm?: number
  memo?: string
  facilityId?: string
  zoneId?: string
  locationSnapshot?: { facilityName: string; zoneName?: string }
}

/*
 * ルアーメーカー
 *
 * 例：
 * Lucky Craft
 * TIMON
 * RODIO CRAFT
 */
export interface LureManufacturer {
  id?: number
  name: string
}

/*
 * ルアーシリーズ
 *
 * 例：
 * WAH
 * パニクラ
 * MOCA
 */
export interface LureSeries {
  id?: number
  manufacturerId: number
  name: string
}

/*
 * 具体的なルアーモデル
 *
 * 例：
 * WAH 40F
 * パニクラ MR
 */
export type LureCategory = 'スプーン' | 'クランク' | 'ミノー' | 'トップ' | 'バイブレーション' | 'その他'

export interface LureModel {
  id?: number
  seriesId: number
  name: string

  lengthMm?: number
  weightG?: number
  category?: LureCategory
  actionType?: 'F' | 'SS' | 'SSS'
}

/*
 * モデル × カラー
 *
 * 例：
 * WAH 40F × クロまんじゅう
 */
export interface LureVariant {
  id?: number
  modelId: number
  colorName: string
  catalogEvidence?: {
    revision: 'RC22' | 'RC28'; colorClass: string; sourceTier: string
    manufacturerUrl: string; retailerUrl: string; jan: string; originalName: string
    colorCode?: string; weightG?: number; lengthMm?: number; buoyancy?: string; rattle?: string; productUrl?: string
  }
}

/*
 * 自分が所有しているルアー
 *
 * 同じカラーを2個持っていても
 * それぞれ登録できるようにする。
 */
export type OwnershipStatus = 'owned' | 'unverified' | 'placeholder'

export interface MyLure {
  id?: number
  variantId: number

  nickname?: string
  memo?: string
  active: boolean
  ownershipStatus?: OwnershipStatus
}

export function ownershipStatus(lure: MyLure): OwnershipStatus {
  return lure.ownershipStatus ?? 'unverified'
}

export function isUsableOwnedLure(lure: MyLure): boolean {
  return lure.active === true && ownershipStatus(lure) === 'owned'
}

export const fishGroups = ['ニジマス', 'ブランドマス', 'イロモノ', '川魚', 'バス'] as const
export type FishGroup = typeof fishGroups[number]
export interface FishSpecies {
  fish_id: string
  group: FishGroup
  display_name: string
  aliases: string
  region: string
  lineage_or_type: string
  source_status: string
  notes: string
  source_url: string
  active: boolean
  origin: 'reviewed' | 'user'
  userEdited?: boolean
}
export function validateFishSpecies(value: unknown): asserts value is FishSpecies {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('魚種マスターの形式が不正です。')
  const row = value as Record<string, unknown>
  for (const field of ['fish_id', 'display_name', 'group', 'aliases', 'region', 'lineage_or_type', 'source_status', 'notes', 'source_url']) {
    if (typeof row[field] !== 'string' || (['fish_id', 'display_name'].includes(field) && !(row[field] as string).trim())) throw new Error(`魚種.${field}: 文字列が必要です。`)
  }
  if (!fishGroups.includes(row.group as FishGroup)) throw new Error('魚種の分類が不正です。')
  if (typeof row.active !== 'boolean' || !['reviewed', 'user'].includes(row.origin as string) ||
      (row.userEdited !== undefined && typeof row.userEdited !== 'boolean')) throw new Error('魚種の登録状態が不正です。')
  if (row.source_url !== '' && !(row.source_url as string).split(/\s+/).every(url => /^https?:\/\//.test(url))) throw new Error('出典URLはhttp/httpsで入力してください。')
}

export function validateFishCatch(row: Record<string, unknown>, ids?: Set<string>) {
  if (row.fishSizeCm !== undefined && (typeof row.fishSizeCm !== 'number' || !Number.isFinite(row.fishSizeCm) || row.fishSizeCm <= 0)) throw new Error('全長は0より大きい数値（cm）を入力してください。')
  if (row.fishSpeciesId !== undefined) {
    if (typeof row.fishSpeciesId !== 'string' || !row.fishSpeciesId.trim() || (ids && !ids.has(row.fishSpeciesId))) throw new Error('魚種の参照IDが不正です。')
    if (typeof row.fishSpecies !== 'string' || !row.fishSpecies.trim() || !fishGroups.includes(row.fishSpeciesGroup as FishGroup)) throw new Error('魚種の表示名・分類スナップショットが不正です。')
  } else if (row.fishSpeciesGroup !== undefined) throw new Error('魚種分類にはマスター参照が必要です。')
}

export interface Rod {
  id?: number
  manufacturer: string
  modelName: string
  modelCode?: string
  length?: string
  power?: string
  memo?: string
  active: boolean
  initialKey?: string
}

export interface Reel {
  id?: number
  manufacturer: string
  modelName: string
  size?: string
  year?: number
  gearRatio?: string
  mainLineId?: number
  memo?: string
  active: boolean
  initialKey?: string
}

export const lineMaterials = ['ナイロン', 'フロロ', 'PE', 'エステル', 'その他'] as const
export interface TackleLine {
  id?: number
  manufacturer?: string
  productName?: string
  material: typeof lineMaterials[number]
  strengthLb?: number
  sizeGo?: number
  memo?: string
  active: boolean
  initialKey?: string
}

export interface TackleSet {
  id?: number
  name: string
  rodId: number
  reelId: number
  leaderLineId?: number
  memo?: string
  active: boolean
}

// 保存時の構成を値としてコピー。後日のマスター編集・巻き替えでは更新しない。
export interface TackleSnapshot {
  version: 1
  setId: number
  setName: string
  rod: Rod & { id: number }
  reel: Reel & { id: number }
  mainLine?: TackleLine & { id: number }
  leader?: TackleLine & { id: number }
}

export const tackleTableNames = ['rods', 'reels', 'lines', 'tackleSets'] as const
export type TackleTable = typeof tackleTableNames[number]

/** フォーム保存・バックアップ・スナップショットで共用する構造検証。 */
export function validateTackleRecord(table: TackleTable, value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${table}: オブジェクトが必要です。`)
  const row = value as Record<string, unknown>
  const required = table === 'rods' || table === 'reels' ? ['manufacturer', 'modelName']
    : table === 'lines' ? ['material'] : ['name']
  for (const field of required) {
    if (typeof row[field] !== 'string' || !(row[field] as string).trim()) throw new Error(`${table}.${field}: 入力が必要です。`)
  }
  for (const field of ['manufacturer', 'modelName', 'modelCode', 'length', 'power', 'memo', 'size', 'gearRatio', 'productName', 'initialKey']) {
    if (row[field] !== undefined && typeof row[field] !== 'string') throw new Error(`${table}.${field}: 文字列が必要です。`)
  }
  if (typeof row.active !== 'boolean') throw new Error(`${table}.active: 使用状態が不正です。`)
  for (const field of ['rodId', 'reelId', 'mainLineId', 'leaderLineId']) {
    if (row[field] !== undefined && (typeof row[field] !== 'number' || !Number.isSafeInteger(row[field]) || (row[field] as number) <= 0)) {
      throw new Error(`${table}.${field}: 正の整数IDが必要です。`)
    }
  }
  if (table === 'tackleSets' && (row.rodId === undefined || row.reelId === undefined)) throw new Error('ロッドとリールを選択してください。')
  if (table === 'lines' && !lineMaterials.includes(row.material as TackleLine['material'])) throw new Error('ライン素材が不正です。')
  for (const field of ['strengthLb', 'sizeGo']) {
    if (row[field] !== undefined && (typeof row[field] !== 'number' || !Number.isFinite(row[field]) || (row[field] as number) <= 0)) throw new Error(`${field}: 正の数を入力してください。`)
  }
  if (row.year !== undefined && (typeof row.year !== 'number' || !Number.isSafeInteger(row.year) || row.year <= 0)) throw new Error('年式が不正です。')
}

export const db = new Dexie('FishingLogDatabase') as Dexie & {
  trips: EntityTable<FishingTrip, 'id'>
  catches: EntityTable<CatchRecord, 'id'>
  tripEvents: EntityTable<TripEvent, 'id'>
  tripWeatherLocations: Table<TripWeatherLocation, number>
  tripWeatherHours: Table<TripWeatherHour, [number, number]>
  tripWeatherRequests: EntityTable<TripWeatherRequest, 'id'>

  lureManufacturers: EntityTable<LureManufacturer, 'id'>
  lureSeries: EntityTable<LureSeries, 'id'>
  lureModels: EntityTable<LureModel, 'id'>
  lureVariants: EntityTable<LureVariant, 'id'>
  myLures: EntityTable<MyLure, 'id'>
  rods: EntityTable<Rod, 'id'>
  reels: EntityTable<Reel, 'id'>
  lines: EntityTable<TackleLine, 'id'>
  tackleSets: EntityTable<TackleSet, 'id'>
  fishSpecies: EntityTable<FishSpecies, 'fish_id'>
  facilities: Table<FlatOfficialFacility | UserFacility, string>
  zones: Table<FlatOfficialZone | UserZone, string>
  appMetadata: EntityTable<AppliedMaster & { key: 'facilityMaster' }, 'key'>
}

/*
 * 最初のDB
 */
db.version(1).stores({
  trips: '++id, fishingDate, fishingAreaName',
  catches: '++id, tripId, caughtAt',
})

/*
 * fishingStyle / startedAt を追加
 */
db.version(2).stores({
  trips: '++id, fishingDate, fishingAreaName, fishingStyle, startedAt',
  catches: '++id, tripId, caughtAt',
})

/*
 * ルアーマスターを追加
 */
db.version(3).stores({
  trips: '++id, fishingDate, fishingAreaName, fishingStyle, startedAt',
  catches: '++id, tripId, caughtAt',

  lureManufacturers: '++id, &name',
  lureSeries: '++id, manufacturerId, name',
  lureModels: '++id, seriesId, name',
  lureVariants: '++id, modelId, colorName',
  myLures: '++id, variantId, active',
})
/* 放流・ペレット時刻。既存データを保持したまま追加 */
db.version(4).stores({
  tripEvents: '++id, tripId, occurredAt, type',
})

// 既存8テーブル・ID・レコードを変更せず、独立したマスターだけを追加する。
db.version(5).stores({
  rods: '++id, initialKey',
  reels: '++id, mainLineId, initialKey',
  lines: '++id, initialKey',
  tackleSets: '++id, rodId, reelId, leaderLineId',
})

// 旧12テーブルを変更しない。既存釣果への魚種補完・起動時シードは行わない。
db.version(6).stores({ fishSpecies: 'fish_id, group, display_name, origin' })

// Additive only: existing stores, keys and records remain untouched. No seed or migration writes.
db.version(7).stores({ facilities: 'id, origin, prefecture', zones: 'id, facilityId, origin', appMetadata: 'key' })

// Only add stores; no upgrade callback, backfill, or modification of the 16 existing stores.
db.version(8).stores({ tripWeatherLocations: 'tripId', tripWeatherHours: '[tripId+timestamp], tripId, timestamp, requestId', tripWeatherRequests: '++id, tripId, createdAt' })

export const databaseConnection = { state: 'ready' as 'ready' | 'changed' | 'blocked' }
const connectionListeners = new Set<(state: typeof databaseConnection.state) => void>()
export function subscribeDatabaseConnection(listener: (state: typeof databaseConnection.state) => void) {
  connectionListeners.add(listener)
  return () => { connectionListeners.delete(listener) }
}
function notifyConnection(state: typeof databaseConnection.state) {
  databaseConnection.state = state
  for (const listener of connectionListeners) listener(state)
}
db.on('versionchange', () => {
  notifyConnection('changed')
  // Keep the page and unsaved inputs. A stale connection must not silently reopen.
  db.close({ disableAutoOpen: true })
  return false // Stop Dexie's default handler from re-enabling automatic opening.
})
db.on('blocked', () => { notifyConnection('blocked') })
db.on('ready', () => { notifyConnection('ready') }, true)
