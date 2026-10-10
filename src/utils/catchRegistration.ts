import { db, isUsableOwnedLure, type CatchRecord } from '../db/database'
import { snapshotTackle, tackleTables } from './tackleManagement'

export type LureSelection =
  | { kind: 'owned'; myLureId: number }
  | { kind: 'catalog'; variantId: number }
  | { kind: 'manual'; lureName: string; lureColor: string }

export interface LureOption {
  id: number
  variantId: number
  modelId: number
  manufacturerName: string
  seriesName: string
  modelName: string
  colorName: string
  category: string
}

export interface RecentLure {
  key: string
  lureName: string
  lureColor: string
  selection: LureSelection
}

type CatchInput = Omit<CatchRecord, 'id' | 'lureId' | 'lureVariantId' | 'lureName' | 'lureColor' | 'tackleSnapshot'>
const tables = [db.trips, db.catches, db.myLures, db.lureVariants, db.lureModels, db.lureSeries, db.lureManufacturers, ...tackleTables]

function requireId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('ルアーIDを確認してください。')
}

async function catalogNames(variantId: number) {
  requireId(variantId)
  const variant = await db.lureVariants.get(variantId)
  const model = variant && await db.lureModels.get(variant.modelId)
  const series = model && await db.lureSeries.get(model.seriesId)
  const manufacturer = series && await db.lureManufacturers.get(series.manufacturerId)
  if (!variant || !model || !series || !manufacturer) throw new Error('カタログの参照先がありません。選び直してください。')
  return { lureVariantId: variantId, lureName: model.name, lureColor: variant.colorName }
}

async function writeCatch(input: CatchInput, selection: LureSelection): Promise<number> {
  const trip = await db.trips.get(input.tripId)
  if (!trip || trip.endedAt) throw new Error('釣行が存在しないか、終了しています。')
  if (!(input.caughtAt instanceof Date) || !Number.isFinite(input.caughtAt.getTime())) throw new Error('釣果日時が不正です。')
  if (input.tackleSetId !== undefined && !(trip.tackleSetIds ?? []).includes(input.tackleSetId)) {
    throw new Error('このセットは釣行の持参予定にありません。持参セットを変更するか、未指定で保存してください。')
  }
  const tackleSnapshot = input.tackleSetId === undefined ? undefined : await snapshotTackle(input.tackleSetId)
  let lure: Pick<CatchRecord, 'lureId' | 'lureVariantId' | 'lureName' | 'lureColor'>
  if (selection.kind === 'manual') {
    lure = { lureName: selection.lureName.trim() || undefined, lureColor: selection.lureColor.trim() || undefined }
  } else if (selection.kind === 'owned') {
    requireId(selection.myLureId)
    const owned = await db.myLures.get(selection.myLureId)
    if (!owned || !isUsableOwnedLure(owned)) throw new Error('前回または選択したルアーは実所有として確認できません。カタログなどから選び直してください。')
    lure = { ...await catalogNames(owned.variantId), lureId: selection.myLureId }
  } else {
    const names = await catalogNames(selection.variantId)
    const candidates = (await db.myLures.where('variantId').equals(selection.variantId).toArray())
      .filter(isUsableOwnedLure).sort((a, b) => a.id! - b.id!)
    const candidateIds = new Set(candidates.map(row => row.id))
    const previous = (await db.catches.orderBy('caughtAt').reverse().toArray())
      .find(row => row.lureId !== undefined && candidateIds.has(row.lureId))
    const lureId = previous?.lureId ?? candidates[0]?.id ?? await db.myLures.add({
      variantId: selection.variantId, active: true, ownershipStatus: 'owned',
    })
    if (lureId === undefined) throw new Error('所有ルアーの登録に失敗しました。')
    lure = { ...names, lureId }
  }
  // 呼び出し側から古いIDが混入しても、選択結果以外のIDを保存しない。
  const record = { ...input } as CatchRecord
  delete record.id
  delete record.lureId
  delete record.lureVariantId
  delete record.lureName
  delete record.lureColor
  delete record.tackleSnapshot
  const id = await db.catches.add({ ...record, ...lure, ...(tackleSnapshot ? { tackleSnapshot } : {}) })
  if (id === undefined) throw new Error('釣果の登録に失敗しました。')
  return id
}

/** 選択・キャンセル中には呼ばない。所有検索・追加と釣果追加を一括コミットする。 */
export async function registerCatch(input: CatchInput, selection: LureSelection): Promise<number> {
  return db.transaction('rw', tables, () => writeCatch(input, selection))
}

/** 同じ釣行の最新保存済み釣果だけを再利用し、未確認IDは拒否する。 */
export async function registerSameAsPrevious(tripId: number, caughtAt: Date): Promise<number> {
  return db.transaction('rw', tables, async () => {
    const previous = (await db.catches.where('tripId').equals(tripId).sortBy('caughtAt')).at(-1)
    if (!previous) throw new Error('前回の釣果がありません。')
    const selection: LureSelection = previous.lureId !== undefined
      ? { kind: 'owned', myLureId: previous.lureId }
      : { kind: 'manual', lureName: previous.lureName ?? '', lureColor: previous.lureColor ?? '' }
    // 第4弾以前の意味が確認できないIDだけの記録は自動コピーしない。
    return writeCatch({ tripId, caughtAt, tackleSetId: previous.tackleSnapshot ? previous.tackleSetId : undefined,
      rangeLevel: previous.rangeLevel, retrieveSpeed: previous.retrieveSpeed,
      action: previous.action, fishSpecies: previous.fishSpecies }, selection)
  })
}

/** 全カタログと実所有候補を一括取得。最近使用はコミット済み釣果だけから算出する。 */
export async function loadLureChoices() {
  return db.transaction('r', tables, async () => {
    const [manufacturers, series, models, variants, myLures, catches] = await Promise.all([
      db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(),
      db.lureVariants.toArray(), db.myLures.toArray(), db.catches.orderBy('caughtAt').reverse().toArray(),
    ])
    const manufacturerMap = new Map(manufacturers.map(row => [row.id, row]))
    const seriesMap = new Map(series.map(row => [row.id, row]))
    const modelMap = new Map(models.map(row => [row.id, row]))
    const catalog: LureOption[] = []
    for (const variant of variants) {
      const model = modelMap.get(variant.modelId)
      const parent = model && seriesMap.get(model.seriesId)
      const manufacturer = parent && manufacturerMap.get(parent.manufacturerId)
      if (!variant.id || !model?.id || !parent || !manufacturer) continue
      catalog.push({ id: variant.id, variantId: variant.id, modelId: model.id,
        manufacturerName: manufacturer.name, seriesName: parent.name, modelName: model.name,
        colorName: variant.colorName, category: model.category ?? 'その他' })
    }
    const catalogMap = new Map(catalog.map(row => [row.variantId, row]))
    const owned: LureOption[] = []
    for (const individual of myLures.filter(isUsableOwnedLure)) {
      const option = catalogMap.get(individual.variantId)
      if (option && individual.id) owned.push({ ...option, id: individual.id })
    }
    const ownedMap = new Map(owned.map(row => [row.id, row]))
    const seen = new Set<string>()
    const recent: RecentLure[] = []
    for (const record of catches) {
      if (recent.length >= 5) break
      const option = record.lureId !== undefined ? ownedMap.get(record.lureId) : undefined
      if (record.lureId !== undefined && !option) continue
      const key = option ? `variant:${option.variantId}` : `manual:${JSON.stringify([record.lureName, record.lureColor])}`
      if (seen.has(key) || (!option && !record.lureName && !record.lureColor)) continue
      seen.add(key)
      recent.push({ key, lureName: option?.modelName ?? record.lureName ?? '',
        lureColor: option?.colorName ?? record.lureColor ?? '',
        selection: option ? { kind: 'owned', myLureId: option.id }
          : { kind: 'manual', lureName: record.lureName ?? '', lureColor: record.lureColor ?? '' } })
    }
    return { catalog, owned, recent }
  })
}
