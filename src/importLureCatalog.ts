import { db, type LureCategory } from './db/database'

type Seed = {
  format: 'fishing-log-catalog-seed'
  version: 1
  catalogVersion: string
  data: {
    lureManufacturers: { id: number; name: string }[]
    lureSeries: { id: number; manufacturerId: number; name: string }[]
    lureModels: { id: number; seriesId: number; name: string; lengthMm?: number; weightG?: number; category?: LureCategory }[]
    lureVariants: { id: number; modelId: number; colorName: string }[]
    ownedLures?: { variantId: number; quantity: number; active?: boolean }[]
  }
}

/** Atomic, repeatable catalog and owned-lure import. Existing catches/trips remain untouched. */
export async function importLureCatalog(seed: Seed) {
  if (seed?.format !== 'fishing-log-catalog-seed' || seed.version !== 1 ||
      !['1.0-rc7', '1.0-rc18'].includes(seed.catalogVersion)) throw new Error('対応していないカタログJSONです')
  const src = seed.data
  const allowedCategories = new Set<LureCategory>(['スプーン', 'クランク', 'ミノー', 'トップ', 'バイブレーション', 'その他'])
  if (!src || ![src.lureManufacturers, src.lureSeries, src.lureModels, src.lureVariants].every(Array.isArray) ||
      (src.ownedLures !== undefined && !Array.isArray(src.ownedLures))) throw new Error('カタログJSONが不正です')
  const key = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase()
  const assertId = (n: number) => { if (!Number.isSafeInteger(n) || n <= 0) throw new Error('IDが不正です') }
  for (const [table, parentField] of [[src.lureManufacturers, null], [src.lureSeries, 'manufacturerId'], [src.lureModels, 'seriesId'], [src.lureVariants, 'modelId']] as const) {
    const ids = new Set<number>()
    for (const row of table) {
      assertId(row.id)
      if (ids.has(row.id)) throw new Error(`重複ID: ${row.id}`)
      ids.add(row.id)
      if (!('name' in row ? row.name : row.colorName)?.trim()) throw new Error('名前が空です')
      if (parentField) assertId((row as unknown as Record<string, number>)[parentField])
    }
  }
  for (const model of src.lureModels) {
    if (model.category !== undefined && !allowedCategories.has(model.category)) throw new Error('未対応のカテゴリです')
  }
  const owned = src.ownedLures ?? []
  const validVariantIds = new Set(src.lureVariants.map(v => v.id))
  for (const item of owned) {
    assertId(item.variantId)
    if (!validVariantIds.has(item.variantId) || !Number.isSafeInteger(item.quantity) || item.quantity < 0 || item.quantity > 100) {
      throw new Error('所有ルアーの数量またはカラー参照が不正です')
    }
  }
  return db.transaction('rw', db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants, db.myLures, async () => {
    const manufacturers = await db.lureManufacturers.toArray()
    const series = await db.lureSeries.toArray()
    const models = await db.lureModels.toArray()
    const variants = await db.lureVariants.toArray()
    const existingOwned = await db.myLures.toArray()
    const manufacturerMap = new Map<number, number>()
    const seriesMap = new Map<number, number>()
    const modelMap = new Map<number, number>()
    const variantMap = new Map<number, number>()
    const counts = { manufacturers: 0, series: 0, models: 0, variants: 0, owned: 0 }
    for (const row of src.lureManufacturers) {
      let local = manufacturers.find(x => key(x.name) === key(row.name))
      if (!local) {
        const id = await db.lureManufacturers.add({ name: row.name })
        local = { id, name: row.name }; manufacturers.push(local); counts.manufacturers++
      }
      manufacturerMap.set(row.id, local.id!)
    }
    for (const row of src.lureSeries) {
      const parent = manufacturerMap.get(row.manufacturerId)
      if (parent === undefined) throw new Error('シリーズのメーカー参照が不正です')
      let local = series.find(x => x.manufacturerId === parent && key(x.name) === key(row.name))
      if (!local) {
        const id = await db.lureSeries.add({ manufacturerId: parent, name: row.name })
        local = { id, manufacturerId: parent, name: row.name }; series.push(local); counts.series++
      }
      seriesMap.set(row.id, local.id!)
    }
    for (const row of src.lureModels) {
      const parent = seriesMap.get(row.seriesId)
      if (parent === undefined) throw new Error('モデルのシリーズ参照が不正です')
      let local = models.find(x => x.seriesId === parent && key(x.name) === key(row.name))
      if (!local) {
        const data = { seriesId: parent, name: row.name, ...(row.category ? { category: row.category } : {}), ...(row.lengthMm != null ? { lengthMm: row.lengthMm } : {}), ...(row.weightG != null ? { weightG: row.weightG } : {}) }
        const id = await db.lureModels.add(data)
        local = { id, ...data }; models.push(local); counts.models++
      }
      if (row.category && local.category !== row.category) {
        await db.lureModels.update(local.id!, { category: row.category })
        local.category = row.category
      }
      modelMap.set(row.id, local.id!)
    }
    for (const row of src.lureVariants) {
      const parent = modelMap.get(row.modelId)
      if (parent === undefined) throw new Error('カラーのモデル参照が不正です')
      let local = variants.find(x => x.modelId === parent && key(x.colorName) === key(row.colorName))
      if (!local) {
        const id = await db.lureVariants.add({ modelId: parent, colorName: row.colorName })
        local = { id, modelId: parent, colorName: row.colorName }; variants.push(local); counts.variants++
      }
      variantMap.set(row.id, local.id!)
    }
    // Add missing quantities only. Never delete ownership on later imports.
    for (const item of owned) {
      const variantId = variantMap.get(item.variantId)
      if (variantId === undefined) throw new Error('所有カラーの参照が不正です')
      const current = existingOwned.filter(x => x.variantId === variantId).length
      for (let i = current; i < item.quantity; i++) {
        const id = await db.myLures.add({ variantId, active: item.active !== false })
        existingOwned.push({ id, variantId, active: item.active !== false })
        counts.owned++
      }
    }
    return counts
  })
}
