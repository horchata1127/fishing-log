import { rc22Fixture } from './rc22Fixture'
import { rc22Catalog } from '../src/data/rc22Catalog'

/** Isolated synthetic RC22 state. Never reads an actual device backup. */
export function rc23Fixture() {
  const backup = rc22Fixture(), data = backup.data
  let seriesId = 144, modelId = 324, variantId = 2219
  const series = new Map<string, number>()
  for (const target of rc22Catalog.filter(t => t.productVerified)) {
    if (!series.has(target.series)) {
      series.set(target.series, seriesId)
      data.lureSeries!.push({ id: seriesId++, manufacturerId: 71, name: target.series })
    }
    const id = modelId++
    data.lureModels!.push({ id, seriesId: series.get(target.series)!, name: target.model, weightG: target.weight, actionType: target.actionType, category: target.category })
    for (const color of target.colors.filter(c => c.verified)) data.lureVariants!.push({ id: variantId++, modelId: id, colorName: color.label,
      catalogEvidence: { revision: 'RC22', colorClass: color.colorClass, sourceTier: color.sourceTier, manufacturerUrl: color.manufacturerUrl, retailerUrl: color.retailerUrl, jan: color.jan, originalName: color.name } })
  }
  if (data.lureVariants!.length !== 2307 || data.lureModels!.length !== 331 || data.lureSeries!.length !== 147) throw new Error('Invalid synthetic RC22 baseline')
  return backup
}
