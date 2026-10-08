import { db } from './db/database'

type Seed = {
  format: 'fishing-log-catalog-seed'
  version: 1
  data: {
    lureManufacturers: { id: number; name: string }[]
    lureSeries: { id: number; manufacturerId: number; name: string }[]
    lureModels: { id: number; seriesId: number; name: string; lengthMm?: number; weightG?: number }[]
    lureVariants: { id: number; modelId: number; colorName: string }[]
  }
}

/**
 * Non-destructive catalog merge for the existing FishingLogDatabase.
 * Never clears tables or modifies trips/catches/myLures.
 * Reconciles imported IDs to local IDs by parent + exact name.
 * IMPORTANT: Back up IndexedDB before first import.
 */
export async function importLureCatalog(seed: Seed) {
  if (seed.format !== 'fishing-log-catalog-seed' || seed.version !== 1) {
    throw new Error('対応していないマスタJSONです')
  }
  const src = seed.data
  if (!src || !Array.isArray(src.lureManufacturers) ||
      !Array.isArray(src.lureSeries) || !Array.isArray(src.lureModels) ||
      !Array.isArray(src.lureVariants)) throw new Error('マスタJSONが不正です')

  return db.transaction('rw',
    db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants,
    async () => {
      const manufacturerMap = new Map<number, number>()
      const seriesMap = new Map<number, number>()
      const modelMap = new Map<number, number>()
      const counts = { manufacturers: 0, series: 0, models: 0, variants: 0 }
      const manufacturers = await db.lureManufacturers.toArray()
      const series = await db.lureSeries.toArray()
      const models = await db.lureModels.toArray()
      const variants = await db.lureVariants.toArray()
      const key = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase()

      for (const row of src.lureManufacturers) {
        if (!row.name || !Number.isInteger(row.id)) throw new Error('メーカー行が不正です')
        let local = manufacturers.find(x => key(x.name) === key(row.name))
        if (!local) {
          const id = await db.lureManufacturers.add({ name: row.name })
          local = { id, name: row.name }
          manufacturers.push(local)
          counts.manufacturers++
        }
        manufacturerMap.set(row.id, local.id!)
      }
      for (const row of src.lureSeries) {
        const parent = manufacturerMap.get(row.manufacturerId)
        if (parent === undefined) throw new Error('シリーズのメーカー参照が不正です')
        let local = series.find(x => x.manufacturerId === parent && key(x.name) === key(row.name))
        if (!local) {
          const id = await db.lureSeries.add({ manufacturerId: parent, name: row.name })
          local = { id, manufacturerId: parent, name: row.name }
          series.push(local)
          counts.series++
        }
        seriesMap.set(row.id, local.id!)
      }
      for (const row of src.lureModels) {
        const parent = seriesMap.get(row.seriesId)
        if (parent === undefined) throw new Error('モデルのシリーズ参照が不正です')
        let local = models.find(x => x.seriesId === parent && key(x.name) === key(row.name))
        if (!local) {
          const newRow = { seriesId: parent, name: row.name,
            ...(row.lengthMm !== undefined ? { lengthMm: row.lengthMm } : {}),
            ...(row.weightG !== undefined ? { weightG: row.weightG } : {}) }
          const id = await db.lureModels.add(newRow)
          local = { id, ...newRow }
          models.push(local)
          counts.models++
        }
        modelMap.set(row.id, local.id!)
      }
      for (const row of src.lureVariants) {
        const parent = modelMap.get(row.modelId)
        if (parent === undefined) throw new Error('カラーのモデル参照が不正です')
        const exists = variants.some(x => x.modelId === parent && key(x.colorName) === key(row.colorName))
        if (!exists) {
          const id = await db.lureVariants.add({ modelId: parent, colorName: row.colorName })
          variants.push({ id, modelId: parent, colorName: row.colorName })
          counts.variants++
        }
      }
      return counts
    })
}
