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

  lureName?: string
  lureColor?: string

  rangeLevel?: string
  retrieveSpeed?: string
  action?: string

  fishSpecies?: string
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

export const db = new Dexie('FishingLogDatabase') as Dexie & {
  trips: EntityTable<FishingTrip, 'id'>
  catches: EntityTable<CatchRecord, 'id'>
  tripEvents: EntityTable<TripEvent, 'id'>

  lureManufacturers: EntityTable<LureManufacturer, 'id'>
  lureSeries: EntityTable<LureSeries, 'id'>
  lureModels: EntityTable<LureModel, 'id'>
  lureVariants: EntityTable<LureVariant, 'id'>
  myLures: EntityTable<MyLure, 'id'>
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
