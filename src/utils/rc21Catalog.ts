import { db, type LureCategory } from '../db/database'
import { rc21Catalog } from '../data/rc21Catalog'

type Color = { code: string; name: string; label: string; aliases: readonly string[]; sourceUrl: string }
type Target = {
  manufacturer: string; series: string; model: string; weight: number
  manufacturerAliases: readonly string[]; seriesAliases: readonly string[]; modelAliases: readonly string[]
  colors: readonly Color[]; sourceUrl: string; allowNewModel: boolean; productVerified: boolean; expectedManufacturerId: number; category: LureCategory
}
export type Rc21DiffRow = {
  manufacturer: string; series: string; model: string; weight: number
  color_code: string; color_name: string; source_url: string; verification_status: 'official_confirmed'
  manufacturer_id: number | ''; series_id: number | ''; model_id: number | ''; hold_reason: string; existing_id: number | ''; action: 'keep' | 'add_color' | 'hold_missing_manufacturer' | 'hold_missing_model' | 'hold_conflict' | 'hold_unverified'
}
export type Rc21Preview = {
  addedColors: number; retainedColors: number; pendingColors: number
  addedModels: number; addedSeries: number; rows: Rc21DiffRow[]; comparisonToken: string
}
const tables = [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants]
const key = (text: string) => text.normalize('NFKC').replace(/[\s・（）()_-]/g, '').toLowerCase()
const matches = (name: string, official: string, aliases: readonly string[]) => [official, ...aliases].some(n => key(n) === key(name))
function unique<T extends { id?: number }>(rows: T[], label: string): T | undefined {
  if (rows.length > 1) throw new Error(`${label}: 候補が複数あります（ID ${rows.map(row => row.id).join(', ')}）。無断統合せず、カタログを確認してください。`)
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

/** Match each reviewed product independently under a single catalog transaction. */
async function plan() {
  const [manufacturers, series, models, variants] = await Promise.all([
    db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(), db.lureVariants.toArray(),
  ])
  const report: Rc21Preview = { addedColors: 0, retainedColors: 0, pendingColors: 0,
    addedModels: 0, addedSeries: 0, rows: [], comparisonToken: JSON.stringify([manufacturers, series, models, variants]) }
  const operations: { target: Target; manufacturerId: number; seriesId?: number; modelId?: number; colors: Color[] }[] = []
  const newSeries = new Set<string>()
  for (const target of rc21Catalog as readonly Target[]) {
    const resolvedIds: Pick<Rc21DiffRow, 'manufacturer_id' | 'series_id' | 'model_id'> = { manufacturer_id: '', series_id: '', model_id: '' }
    try {
      const manufacturer = unique(manufacturers.filter(m => matches(m.name, target.manufacturer, target.manufacturerAliases)), target.manufacturer)
      resolvedIds.manufacturer_id = manufacturer?.id ?? ''
      if (manufacturer && manufacturer.id !== target.expectedManufacturerId) throw new Error('メーカーIDが確認済みIDと一致しません。端末照合が必要です。')
      const parentSeries = manufacturer ? series.filter(s => s.manufacturerId === manufacturer.id) : []
      const selectedSeries = unique(parentSeries.filter(s => matches(s.name, target.series, target.seriesAliases)), `${target.manufacturer}/${target.series}`)
      resolvedIds.series_id = selectedSeries?.id ?? ''
      // Check the whole manufacturer's model namespace to catch wrong-series aliases.
      const seriesIds = new Set(parentSeries.map(s => s.id))
      const model = unique(models.filter(m => seriesIds.has(m.seriesId) && matches(m.name, target.model, target.modelAliases)), `${target.manufacturer}/${target.model}`)
      resolvedIds.model_id = model?.id ?? ''
      if (model && (!selectedSeries || model.seriesId !== selectedSeries.id)) throw new Error(`${target.model}: シリーズの所属が異なります。確認してください。`)
      if (model && model.weightG !== target.weight) throw new Error(`${target.model}: 重量が公式資料と一致しません。確認してください。`)
      const pending = !target.productVerified ? 'hold_unverified' : !manufacturer ? 'hold_missing_manufacturer' : !model && !target.allowNewModel ? 'hold_missing_model' : undefined
      const colors: Color[] = []
      const claimedIds = new Set<number>()
      for (const color of target.colors) {
        const existing = unique(variants.filter(v => model && v.modelId === model.id && colorMatches(v.colorName, color)), `${target.model}/${color.label}`)
        if (existing && claimedIds.has(existing.id!)) throw new Error(`${target.model}: 1つのカラーIDが複数色に一致します。確認してください。`)
        if (existing) claimedIds.add(existing.id!)
        const action = pending ?? (existing ? 'keep' : 'add_color')
        report.rows.push({ manufacturer: target.manufacturer, series: target.series, model: target.model, weight: target.weight,
          color_code: color.code, color_name: color.label, source_url: color.sourceUrl,
          verification_status: 'official_confirmed', manufacturer_id: manufacturer?.id ?? '', series_id: selectedSeries?.id ?? '', model_id: model?.id ?? '', hold_reason: pending ?? '', existing_id: existing?.id ?? '', action })
        if (pending) report.pendingColors++
        else if (existing) report.retainedColors++
        else { report.addedColors++; colors.push(color) }
      }
      if (!pending && manufacturer && colors.length) {
        if (!model) report.addedModels++
        if (!selectedSeries) newSeries.add(`${manufacturer.id}/${target.series}`)
        operations.push({ target, manufacturerId: manufacturer.id!, seriesId: selectedSeries?.id, modelId: model?.id, colors })
      }
    } catch (error) {
      // Discard this target's partial plan and expose a reviewable hold.
      const previous = report.rows.filter(r => r.manufacturer === target.manufacturer && r.model === target.model)
      for (const row of previous) {
        if (row.action === 'keep') report.retainedColors--
        else if (row.action === 'add_color') report.addedColors--
        else report.pendingColors--
      }
      report.rows = report.rows.filter(r => !previous.includes(r))
      for (const color of target.colors) report.rows.push({ manufacturer: target.manufacturer, series: target.series, model: target.model, weight: target.weight, color_code: color.code, color_name: color.label, source_url: color.sourceUrl, verification_status: 'official_confirmed', ...resolvedIds, existing_id: '', action: 'hold_conflict', hold_reason: String(error) })
      report.pendingColors += target.colors.length
    }
  }
  report.addedSeries = newSeries.size
  return { report, operations }
}

export async function previewRc21Catalog(): Promise<Rc21Preview> {
  return db.transaction('r', tables, async () => (await plan()).report)
}

/** Comparison + additions commit together; no writes to existing rows or ownership. */
export async function applyRc21Catalog(comparisonToken: string): Promise<Rc21Preview> {
  return db.transaction('rw', tables, async () => {
    const { report, operations } = await plan()
    if (report.comparisonToken !== comparisonToken) throw new Error('カタログが変更されました。もう一度事前確認してください。')
    const createdSeries = new Map<string, number>()
    for (const operation of operations) {
      const seriesKey = `${operation.manufacturerId}/${operation.target.series}`
      const seriesId = operation.seriesId ?? createdSeries.get(seriesKey) ?? await db.lureSeries.add({ manufacturerId: operation.manufacturerId, name: operation.target.series })
      createdSeries.set(seriesKey, seriesId!)
      const modelId = operation.modelId ?? await db.lureModels.add({ seriesId: seriesId!, name: operation.target.model,
        weightG: operation.target.weight, category: operation.target.category })
      for (const color of operation.colors) await db.lureVariants.add({ modelId: modelId!, colorName: color.label })
    }
    return report
  })
}

export function rc21DiffCsv(preview: Rc21Preview) {
  const fields = ['manufacturer', 'series', 'model', 'weight', 'color_code', 'color_name', 'source_url', 'verification_status', 'manufacturer_id', 'series_id', 'model_id', 'hold_reason', 'existing_id', 'action'] as const
  // Prefix spreadsheet formula starters even though this pack contains trusted labels.
  const cell = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
  return '\uFEFF' + [fields.join(','), ...preview.rows.map(row => fields.map(field => cell(row[field])).join(','))].join('\r\n')
}
