import { rc20Fixture } from './rc20Fixture'
import { rc20Catalog } from '../src/data/rc20Catalog'
import { rc21Catalog } from '../src/data/rc21Catalog'

/** Synthetic RC21 acceptance state, never reads or writes an actual iPhone backup. */
export function rc22Fixture() {
  const backup = rc20Fixture(), data = backup.data
  let seriesId = 136, modelId = 306, variantId = 1889
  for (const target of rc20Catalog) {
    const manufacturer = data.lureManufacturers!.find(m => m.name === target.manufacturer)!
    let series = data.lureSeries!.find(s => s.manufacturerId === manufacturer.id && s.name === target.series)
    if (!series) { series = { id: seriesId++, manufacturerId: manufacturer.id, name: target.series }; data.lureSeries!.push(series) }
    let model = data.lureModels!.find(m => m.seriesId === series.id && m.name === target.model)
    if (!model) { model = { id: modelId++, seriesId: series.id, name: target.model, weightG: target.weight, category: 'その他' }; data.lureModels!.push(model) }
    for (const color of target.colors) {
      if (!data.lureVariants!.some(v => v.modelId === model.id && v.colorName === color.label)) data.lureVariants!.push({ id: variantId++, modelId: model.id, colorName: color.label })
    }
  }
  // Both frozen packs are included above; RC21 adds no further targets outside RC20.
  if (rc21Catalog.length !== 18) throw new Error('Synthetic fixture needs a reviewed RC21 baseline')
  const pad = (table: string, count: number, make: (id: number) => Record<string, unknown>) => {
    const rows = data[table]!, ids = new Set(rows.map(r => r.id))
    for (let id = 1; rows.length < count; id++) if (!ids.has(id)) rows.push({ ...make(id), id })
  }
  pad('lureManufacturers', 80, id => ({ name: `synthetic maker ${id}` }))
  pad('lureSeries', 143, id => ({ manufacturerId: 1, name: `synthetic series ${id}` }))
  pad('lureModels', 323, id => ({ seriesId: 1, name: `synthetic model ${id}` }))
  pad('lureVariants', 2218, id => ({ modelId: 1, colorName: `synthetic color ${id}` }))
  pad('trips', 5, () => ({ ...data.trips![0] }))
  pad('catches', 7, () => ({ ...data.catches![0] }))
  pad('myLures', 4, () => ({ variantId: 1887, active: true, ownershipStatus: 'owned' }))
  data.fishSpecies = [{ fish_id: 'F001', group: 'ニジマス', display_name: 'ニジマス', active: true, origin: 'reviewed', aliases: '', region: '', lineage_or_type: '', source_status: '', notes: '', source_url: '' }]
  data.rods = [{ id: 1, manufacturer: '試験', modelName: '保持ロッド', active: true }]
  data.reels = [{ id: 1, manufacturer: '試験', modelName: '保持リール', active: true }]
  data.lines = [{ id: 1, material: 'ナイロン', strengthLb: 3, active: true }]
  data.tackleSets = [{ id: 1, name: '保持タックル', rodId: 1, reelId: 1, active: true }]
  return { ...backup, version: 5 }
}
