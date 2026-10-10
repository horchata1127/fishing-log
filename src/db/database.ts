import Dexie, { type EntityTable } from 'dexie'

export type FishingStyle =
  | 'AREA_TROUT'
  | 'CHUBBING'
  | 'NATIVE_TROUT'
  | 'BASS'
  | 'OTHER'

export interface FishingTrip {
  id?: number
  fishingAreaName: string
  fishingDate: string
  fishingStyle: FishingStyle
  weather?: string
  temperatureC?: number
  waterTemperatureC?: number
  startedAt: Date
  endedAt?: Date
  memo?: string
  tackleSetIds?: number[]
}

export type TripEventType = 'stocking' | 'pellet'

export interface TripEvent {
  id?: number
  tripId: number
  type: TripEventType
  occurredAt: Date
  note?: string
}

export interface CatchRecord {
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

  fishSpecies?: string
  fishSpeciesId?: string
  fishSpeciesGroup?: FishGroup
  fishSizeCm?: number
  memo?: string
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

export const fishGroups = ['ニジマス', 'ブランドマス', 'イロモノ'] as const
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
