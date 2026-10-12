import { db } from '../db/database'
import { rc20Catalog } from '../data/rc20Catalog'

type Color = { code: string; name: string; label: string; aliases: readonly string[]; sourceUrl: string }
type Target = {
  manufacturer: string; series: string; model: string; weight: number
  manufacturerAliases: readonly string[]; seriesAliases: readonly string[]; modelAliases: readonly string[]
  colors: readonly Color[]; sourceUrl: string; allowNewModel: boolean
}
export type Rc20DiffRow = {
  manufacturer: string; series: string; model: string; weight: number
  color_code: string; color_name: string; source_url: string; verification_status: 'official_confirmed'
  existing_id: number | ''; action: 'keep' | 'add_color' | 'hold_missing_manufacturer' | 'hold_missing_model'
}
export type Rc20Preview = {
  addedColors: number; retainedColors: number; pendingColors: number
  addedModels: number; addedSeries: number; rows: Rc20DiffRow[]; comparisonToken: string
}
const tables = [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants]
const key = (text: string) => text.normalize('NFKC').replace(/[\s・（）()_-]/g, '').toLowerCase()
const matches = (name: string, official: string, aliases: readonly string[]) => [official, ...aliases].some(n => key(n) === key(name))
function unique<T>(rows: T[], label: string): T | undefined {
  if (rows.length > 1) throw new Error(`${label}: 候補が複数あります。無断統合せず、カタログを確認してください。`)
  return rows[0]
}
function colorMatches(name: string, color: Color) {
  if (matches(name, color.label, [color.name, ...color.aliases])) return true
  if (!color.code) return false
  const prefix = name.normalize('NFKC').trim().match(/^(T-?\d+|#?\d+)(?=$|[^0-9])/i)?.[1]
  const codeKey = (value: string) => value.replace(/^#/, '').replace(/^(T-?)(\d+)$/i, (_, _t, n: string) => `t${Number(n)}`)
    .replace(/^\d+$/, digits => String(Number(digits)))
  return prefix !== undefined && codeKey(prefix) === codeKey(color.code)
}

/** Run under a single catalog transaction. Missing non-HUNT models are review items. */
async function plan() {
  const [manufacturers, series, models, variants] = await Promise.all([
    db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(), db.lureVariants.toArray(),
  ])
  const report: Rc20Preview = { addedColors: 0, retainedColors: 0, pendingColors: 0,
    addedModels: 0, addedSeries: 0, rows: [], comparisonToken: JSON.stringify([manufacturers, series, models, variants]) }
  const operations: { target: Target; manufacturerId: number; seriesId?: number; modelId?: number; colors: Color[] }[] = []
  for (const target of rc20Catalog as readonly Target[]) {
    const manufacturer = unique(manufacturers.filter(m => matches(m.name, target.manufacturer, target.manufacturerAliases)), target.manufacturer)
    const parentSeries = manufacturer ? series.filter(s => s.manufacturerId === manufacturer.id) : []
    const selectedSeries = unique(parentSeries.filter(s => matches(s.name, target.series, target.seriesAliases)), `${target.manufacturer}/${target.series}`)
    // Check the whole manufacturer's model namespace to catch wrong-series aliases.
    const seriesIds = new Set(parentSeries.map(s => s.id))
    const model = unique(models.filter(m => seriesIds.has(m.seriesId) && matches(m.name, target.model, target.modelAliases)), `${target.manufacturer}/${target.model}`)
    if (model && (!selectedSeries || model.seriesId !== selectedSeries.id)) throw new Error(`${target.model}: シリーズの所属が異なります。確認してください。`)
    if (model?.weightG !== undefined && model.weightG !== target.weight) throw new Error(`${target.model}: 重量が公式資料と一致しません。確認してください。`)
    const pending = !manufacturer ? 'hold_missing_manufacturer' : !model && !target.allowNewModel ? 'hold_missing_model' : undefined
    const colors: Color[] = []
    const claimedIds = new Set<number>()
    for (const color of target.colors) {
      const existing = unique(variants.filter(v => model && v.modelId === model.id && colorMatches(v.colorName, color)), `${target.model}/${color.label}`)
      if (existing && claimedIds.has(existing.id!)) throw new Error(`${target.model}: 1つのカラーIDが複数色に一致します。確認してください。`)
      if (existing) claimedIds.add(existing.id!)
      const action = pending ?? (existing ? 'keep' : 'add_color')
      report.rows.push({ manufacturer: target.manufacturer, series: target.series, model: target.model, weight: target.weight,
        color_code: color.code, color_name: color.label, source_url: color.sourceUrl,
        verification_status: 'official_confirmed', existing_id: existing?.id ?? '', action })
      if (pending) report.pendingColors++
      else if (existing) report.retainedColors++
      else { report.addedColors++; colors.push(color) }
    }
    if (!pending && manufacturer && colors.length) {
      if (!model) report.addedModels++
      if (!selectedSeries) report.addedSeries++
      operations.push({ target, manufacturerId: manufacturer.id!, seriesId: selectedSeries?.id, modelId: model?.id, colors })
    }
  }
  return { report, operations }
}

export async function previewRc20Catalog(): Promise<Rc20Preview> {
  return db.transaction('r', tables, async () => (await plan()).report)
}

/** Comparison + additions commit together; no writes to existing rows or ownership. */
export async function applyRc20Catalog(comparisonToken: string): Promise<Rc20Preview> {
  return db.transaction('rw', tables, async () => {
    const { report, operations } = await plan()
    if (report.comparisonToken !== comparisonToken) throw new Error('カタログが変更されました。もう一度事前確認してください。')
    for (const operation of operations) {
      const seriesId = operation.seriesId ?? await db.lureSeries.add({ manufacturerId: operation.manufacturerId, name: operation.target.series })
      const modelId = operation.modelId ?? await db.lureModels.add({ seriesId: seriesId!, name: operation.target.model,
        weightG: operation.target.weight, category: 'スプーン' })
      for (const color of operation.colors) await db.lureVariants.add({ modelId: modelId!, colorName: color.label })
    }
    return report
  })
}

export function rc20DiffCsv(preview: Rc20Preview) {
  const fields = ['manufacturer', 'series', 'model', 'weight', 'color_code', 'color_name', 'source_url', 'verification_status', 'existing_id', 'action'] as const
  // Prefix spreadsheet formula starters even though this pack contains trusted labels.
  const cell = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
  return '\uFEFF' + [fields.join(','), ...preview.rows.map(row => fields.map(field => cell(row[field])).join(','))].join('\r\n')
}
