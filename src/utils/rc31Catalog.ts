import { db, type LureManufacturer, type LureSeries, type LureModel, type LureVariant } from '../db/database'
import { rc31Catalog } from '../data/rc31Catalog'

type Target = typeof rc31Catalog[number]
type Color = Target['colors'][number]
export type Rc31Row = {
  series: string; model: string; color: string; code: string; sourceUrl: string
  action: 'add' | 'keep' | 'hold'; reason: string; existingId?: number
}
export type Rc31Preview = {
  addedManufacturers: number; addedSeries: number; addedModels: number
  addedColors: number; retainedColors: number; pendingColors: number
  rows: Rc31Row[]; comparisonToken: string
}
export type Rc31Snapshot = [LureManufacturer[], LureSeries[], LureModel[], LureVariant[]]
const tables = [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants]
const key = (s: string) => s.normalize('NFKC').replace(/\s/g, '').toLowerCase()
const codeKey = (s: string) => key(s).replace(/[‐‑‒–—−-]/g, '')
const manufacturerKey = (s: string) => key(s).replace(/[()]/g, '')
const matches = (name: string, official: string, aliases: string[]) => [official, ...aliases].some(n => key(n) === key(name))
function unique<T>(rows: T[], label: string): T | undefined {
  if (rows.length > 1) throw new Error(`${label}: 候補が重複しています`)
  return rows[0]
}
function existingCode(v: LureVariant) {
  return v.catalogEvidence?.colorCode || v.colorName.normalize('NFKC').match(/^([A-Za-z]+-?[A-Za-z0-9]+)\s+/)?.[1]
}
function colorMatches(v: LureVariant, c: Color) {
  const code = existingCode(v)
  // A known code takes precedence over a name. Codes are scoped to this model.
  if (code) return codeKey(code) === codeKey(c.code)
  return [v.colorName, v.catalogEvidence?.originalName].some(n => n && [c.name, c.label].some(a => key(n) === key(a)))
}

async function plan(snapshot?: Rc31Snapshot) {
  const [manufacturers, series, models, variants] = snapshot ?? await Promise.all([
    db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(), db.lureVariants.toArray(),
  ])
  const report: Rc31Preview = { addedManufacturers: 0, addedSeries: 0, addedModels: 0,
    addedColors: 0, retainedColors: 0, pendingColors: 0, rows: [],
    comparisonToken: JSON.stringify([manufacturers, series, models, variants]) }
  const operations: { target: Target; manufacturerId?: number; seriesId?: number; modelId?: number; colors: Color[] }[] = []
  const newManufacturers = new Set<string>(), newSeries = new Set<string>()
  for (const target of rc31Catalog) {
    const row = (c: Color, action: Rc31Row['action'], reason = '', existingId?: number): Rc31Row => ({
      series: target.series, model: target.model, color: c.label, code: c.code, sourceUrl: target.sourceUrl, action, reason, existingId,
    })
    try {
      const manufacturer = unique(manufacturers.filter(m => [target.manufacturer, ...target.manufacturerAliases]
        .some(n => manufacturerKey(n) === manufacturerKey(m.name))), target.manufacturer)
      const parent = unique(series.filter(s => manufacturer && s.manufacturerId === manufacturer.id &&
        matches(s.name, target.series, target.seriesAliases)), target.series)
      const model = unique(models.filter(m => parent && m.seriesId === parent.id &&
        matches(m.name, target.model, target.modelAliases)), target.model)
      if (model && ((model.weightG !== undefined && model.weightG !== target.weight) ||
        (model.lengthMm !== undefined && model.lengthMm !== target.length) ||
        (model.actionType !== undefined && model.actionType !== target.actionType))) throw new Error('既存モデルの重量・全長・浮力が一致しません')
      const existing = variants.filter(v => model && v.modelId === model.id)
      const colors: Color[] = [], rows: Rc31Row[] = [], claimed = new Set<number>()
      for (const color of target.colors) {
        const found = unique(existing.filter(v => colorMatches(v, color)), color.label)
        // A conflicting explicit code must not be bypassed through a name match.
        if (!found && existing.some(v => existingCode(v) && key(v.catalogEvidence?.originalName ?? v.colorName) === key(color.name))) {
          throw new Error('既存カラーの名称とコードが競合しています')
        }
        if (found && claimed.has(found.id!)) throw new Error('複数カラーが同じ既存IDに一致しました')
        if (found) claimed.add(found.id!)
        else colors.push(color)
        rows.push(row(color, found ? 'keep' : 'add', '', found?.id))
      }
      report.rows.push(...rows)
      if (colors.length) {
        if (!manufacturer) newManufacturers.add(target.manufacturer)
        if (!parent) newSeries.add(`${target.manufacturer}/${target.series}`)
        if (!model) report.addedModels++
        operations.push({ target, manufacturerId: manufacturer?.id, seriesId: parent?.id, modelId: model?.id, colors })
      }
    } catch (error) {
      report.rows.push(...target.colors.map(c => row(c, 'hold', String(error))))
    }
  }
  report.addedManufacturers = newManufacturers.size
  report.addedSeries = newSeries.size
  report.addedColors = report.rows.filter(r => r.action === 'add').length
  report.retainedColors = report.rows.filter(r => r.action === 'keep').length
  report.pendingColors = report.rows.filter(r => r.action === 'hold').length
  return { report, operations }
}
export async function previewRc31Catalog(): Promise<Rc31Preview> {
  return db.transaction('r', tables, async () => (await plan()).report)
}
/** Read-only analysis; never opens or restores the device DB. */
export async function previewRc31Snapshot(snapshot: Rc31Snapshot): Promise<Rc31Preview> {
  return (await plan(snapshot)).report
}
export async function applyRc31Catalog(comparisonToken: string): Promise<Rc31Preview> {
  return db.transaction('rw', tables, async () => {
    const { report, operations } = await plan()
    if (report.comparisonToken !== comparisonToken) throw new Error('カタログが変更されました。もう一度事前確認してください。')
    const createdManufacturers = new Map<string, number>(), createdSeries = new Map<string, number>()
    for (const op of operations) {
      const manufacturerId = op.manufacturerId ?? createdManufacturers.get(op.target.manufacturer) ??
        await db.lureManufacturers.add({ name: op.target.manufacturer })
      createdManufacturers.set(op.target.manufacturer, manufacturerId!)
      const seriesKey = `${manufacturerId}/${op.target.series}`
      const seriesId = op.seriesId ?? createdSeries.get(seriesKey) ??
        await db.lureSeries.add({ manufacturerId: manufacturerId!, name: op.target.series })
      createdSeries.set(seriesKey, seriesId!)
      const modelId = op.modelId ?? await db.lureModels.add({ seriesId: seriesId!, name: op.target.model,
        weightG: op.target.weight, lengthMm: op.target.length, category: op.target.category, actionType: op.target.actionType })
      for (const color of op.colors) await db.lureVariants.add({ modelId: modelId!, colorName: color.label,
        catalogEvidence: { revision: 'RC31', colorClass: '', sourceTier: 'manufacturer',
          manufacturerUrl: op.target.sourceUrl, retailerUrl: '', jan: '', originalName: color.name,
          colorCode: color.code, weightG: op.target.weight, lengthMm: op.target.length, buoyancy: op.target.buoyancy,
          productUrl: op.target.sourceUrl } })
    }
    return report
  })
}
export function rc31DiffCsv(preview: Rc31Preview) {
  const fields = ['series', 'model', 'color', 'code', 'sourceUrl', 'action', 'reason', 'existingId'] as const
  const cell = (v: unknown) => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
  return '\uFEFF' + [fields.join(','), ...preview.rows.map(row => fields.map(f => cell(row[f])).join(','))].join('\r\n')
}
