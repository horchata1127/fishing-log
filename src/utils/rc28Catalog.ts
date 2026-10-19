import { db, type LureManufacturer, type LureSeries, type LureModel, type LureVariant } from '../db/database'
import { rc28Catalog, rc28Pending } from '../data/rc28Catalog'

type Target = typeof rc28Catalog[number]
type Color = Target['colors'][number]
export type Rc28Row = {
  model: string; series: string; color: string; code: string; jan: string; sourceUrl: string
  action: 'add' | 'keep' | 'hold'; reason: string; existingId?: number
}
export type Rc28Preview = {
  addedColors: number; retainedColors: number; pendingColors: number
  addedModels: number; addedSeries: number; rows: Rc28Row[]; comparisonToken: string
}
const tables = [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants]
const key = (s: string) => s.normalize('NFKC').replace(/\s/g, '').toLowerCase().replace(/(\d+)\.0g/g, '$1g')
const matches = (name: string, official: string, aliases: readonly string[]) => [official, ...aliases].some(n => key(n) === key(name))
function unique<T>(rows: T[], label: string): T | undefined {
  if (rows.length > 1) throw new Error(`${label}: 候補が重複しています`)
  return rows[0]
}
const bare = (s: string) => key(s.replace(/^#?\d+\s+/, ''))
function colorMatches(name: string, color: Color) {
  return [color.label, color.name, ...color.aliases].some(n => key(n) === key(name) || bare(n) === bare(name))
}

export type Rc28Snapshot = [LureManufacturer[], LureSeries[], LureModel[], LureVariant[]]
async function plan(snapshot?: Rc28Snapshot) {
  const [manufacturers, series, models, variants] = snapshot ?? await Promise.all([
    db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(), db.lureVariants.toArray(),
  ])
  const report: Rc28Preview = { addedColors: 0, retainedColors: 0, pendingColors: rc28Pending.length,
    addedModels: 0, addedSeries: 0, rows: [], comparisonToken: JSON.stringify([manufacturers, series, models, variants]) }
  const operations: { target: Target; manufacturerId: number; seriesId?: number; modelId?: number; colors: Color[] }[] = []
  const seriesKeys = new Set<string>()
  for (const target of rc28Catalog) {
    const row = (color: Color, action: Rc28Row['action'], reason = '', existingId?: number): Rc28Row => ({
      model: target.model, series: target.series, color: color.label, code: color.code, jan: color.jan,
      sourceUrl: color.sourceUrl, action, reason, existingId,
    })
    try {
      const manufacturer = unique(manufacturers.filter(m => matches(m.name, target.manufacturer, target.manufacturerAliases)), target.manufacturer)
      if (!manufacturer?.id) throw new Error('対象メーカーが見つかりません')
      const parent = unique(series.filter(s => s.manufacturerId === manufacturer.id && matches(s.name, target.series, target.seriesAliases)), target.series)
      const parentIds = new Set(series.filter(s => s.manufacturerId === manufacturer.id).map(s => s.id))
      if (models.some(m => parentIds.has(m.seriesId) && m.seriesId !== parent?.id && matches(m.name, target.model, target.modelAliases))) throw new Error('同名モデルが別シリーズにあります。所属を確認してください')
      const model = unique(models.filter(m => parent && m.seriesId === parent.id && matches(m.name, target.model, target.modelAliases)), target.model)
      if (model && ((model.weightG !== undefined && model.weightG !== target.weight) ||
        (model.lengthMm !== undefined && model.lengthMm !== target.length) ||
        (model.actionType !== undefined && model.actionType !== target.actionType))) throw new Error('既存モデルの重量・全長・タイプが出典と一致しません')
      // Only the explicitly identified 37HF may be reused without stored weight.
      if (model && model.weightG === undefined && !target.reuseWithoutWeight) throw new Error('既存モデルの重量が未確認です')
      const existing = variants.filter(v => model && v.modelId === model.id)
      const colors: Color[] = [], rows: Rc28Row[] = [], claimed = new Set<number>()
      for (const color of target.colors) {
        const found = unique(existing.filter(v => colorMatches(v.colorName, color) || (!!color.jan && v.catalogEvidence?.jan === color.jan)), color.label)
        if (found && claimed.has(found.id!)) throw new Error('複数のカラーが同じ既存IDに一致しました')
        if (found) {
          // A JAN alone must never silently equate two different colors.
          if (!colorMatches(found.colorName, color) || (color.jan && found.catalogEvidence?.jan && found.catalogEvidence.jan !== color.jan)) throw new Error('既存カラーの名前とJANが一致しません')
          const existingCode = found.colorName.normalize('NFKC').match(/^#?(\d+)\s/)?.[1]
          if (color.code && existingCode && Number(existingCode) !== Number(color.code)) throw new Error('既存カラーの番号が一致しません')
          if (found.catalogEvidence && found.catalogEvidence.colorClass !== color.colorClass) throw new Error('既存カラーの限定区分が一致しません')
          claimed.add(found.id!)
        }
        if (!found && color.code && existing.some(v =>
          (!v.catalogEvidence || v.catalogEvidence.colorClass === color.colorClass) &&
          Number(v.colorName.normalize('NFKC').match(/^#?(\d+)\s/)?.[1]) === Number(color.code))) throw new Error('同一区分・番号の既存カラー名が一致しません')
        if (color.jan && variants.some(v => v.catalogEvidence?.jan === color.jan && v.id !== found?.id)) throw new Error('JANが別の既存カラーに割り当てられています')
        rows.push(row(color, found ? 'keep' : 'add', '', found?.id))
        if (!found) colors.push(color)
      }
      report.rows.push(...rows)
      if (colors.length) {
        if (!model) report.addedModels++
        if (!parent) seriesKeys.add(`${manufacturer.id}/${target.series}`)
        operations.push({ target, manufacturerId: manufacturer.id, seriesId: parent?.id, modelId: model?.id, colors })
      }
    } catch (error) {
      report.rows.push(...target.colors.map(c => row(c, 'hold', String(error))))
    }
  }
  report.addedColors = report.rows.filter(r => r.action === 'add').length
  report.retainedColors = report.rows.filter(r => r.action === 'keep').length
  report.pendingColors += report.rows.filter(r => r.action === 'hold').length
  report.addedSeries = seriesKeys.size
  return { report, operations }
}

export async function previewRc28Catalog(): Promise<Rc28Preview> {
  return db.transaction('r', tables, async () => (await plan()).report)
}
/** Read-only analysis of exported catalog arrays. Does not open or restore a DB. */
export async function previewRc28Snapshot(snapshot: Rc28Snapshot): Promise<Rc28Preview> {
  return (await plan(snapshot)).report
}
export async function applyRc28Catalog(comparisonToken: string): Promise<Rc28Preview> {
  return db.transaction('rw', tables, async () => {
    const { report, operations } = await plan()
    if (comparisonToken !== report.comparisonToken) throw new Error('カタログが変更されました。もう一度事前確認してください。')
    const createdSeries = new Map<string, number>()
    for (const op of operations) {
      const seriesKey = `${op.manufacturerId}/${op.target.series}`
      const seriesId = op.seriesId ?? createdSeries.get(seriesKey) ?? await db.lureSeries.add({ manufacturerId: op.manufacturerId, name: op.target.series })
      createdSeries.set(seriesKey, seriesId!)
      const modelId = op.modelId ?? await db.lureModels.add({ seriesId: seriesId!, name: op.target.model,
        weightG: op.target.weight, lengthMm: op.target.length, category: op.target.category,
        ...(op.target.actionType ? { actionType: op.target.actionType } : {}) })
      for (const color of op.colors) await db.lureVariants.add({ modelId: modelId!, colorName: color.label,
        catalogEvidence: { revision: 'RC28', colorClass: color.colorClass, sourceTier: color.sourceTier,
          manufacturerUrl: color.sourceTier === 'manufacturer' ? color.sourceUrl : op.target.sourceUrl.includes('jackall.co.jp') ? op.target.sourceUrl : '',
          retailerUrl: color.sourceTier === 'retailer' ? color.sourceUrl : '', jan: color.jan, originalName: color.name,
          colorCode: color.code, weightG: op.target.weight, lengthMm: op.target.length, buoyancy: op.target.buoyancy, rattle: op.target.rattle, productUrl: op.target.sourceUrl } })
    }
    return report
  })
}
export function rc28DiffCsv(preview: Rc28Preview) {
  const fields = ['series', 'model', 'color', 'code', 'jan', 'sourceUrl', 'action', 'reason', 'existingId'] as const
  const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
  return '\uFEFF' + [fields.join(','), ...preview.rows.map(row => fields.map(f => cell(row[f])).join(','))].join('\r\n')
}
