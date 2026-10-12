import { db } from '../db/database'
import { rc22Catalog } from '../data/rc22Catalog'

type Target = typeof rc22Catalog[number]
type Color = Target['colors'][number]
type Action = 'add_series' | 'add_model' | 'add_color' | 'keep_existing' | 'hold_conflict' | 'hold_product' | 'hold_color' | 'hold_manufacturer'
export type Rc22Row = {
  kind: 'series' | 'model' | 'color'; manufacturer: string; series: string; model: string
  action_type: string; weight_g: number; manufacturer_id: number | ''; series_id: number | ''; model_id: number | ''; existing_id: number | ''
  color_code: string; color_name_original: string; color_class: string; jan: string
  manufacturer_url: string; retailer_url: string; source_tier: string; verification_status: string
  action: Action; hold_reason: string
}
export type Rc22Preview = {
  addedColors: number; retainedColors: number; pendingColors: number; addedModels: number; addedSeries: number
  rows: Rc22Row[]; comparisonToken: string
}
// Reviewed model/type/weight combinations, not a blanket allowNewModel switch.
export const rc22ModelAllowlist = [
  ['バービー F', 'F', 1.4], ['バービー SS', 'SS', 1.6],
  ['バービー・ロング F', 'F', 1.6], ['バービー・ロング SS', 'SS', 1.8],
  ['バービー・ママ F', 'F', 2.6], ['バービー・ママ SS', 'SS', 2.8],
  ['バービー・ガール F', 'F', 0.7], ['バービー・ガール SS', 'SS', 0.9],
] as const
const tables = [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants]
// Same normalization and parent-scope matching as RC21. A type suffix is never removed.
const key = (text: string) => text.normalize('NFKC').replace(/[\s・（）()_-]/g, '').toLowerCase()
const matches = (name: string, official: string, aliases: readonly string[]) => [official, ...aliases].some(n => key(n) === key(name))
function unique<T extends { id?: number }>(rows: T[], label: string): T | undefined {
  if (rows.length > 1) throw new Error(`${label}: 候補ID ${rows.map(r => r.id).join(', ')} が重複しています。`)
  return rows[0]
}
function colorMatches(name: string, color: Color) {
  // RC22 never equates two different names solely because their color numbers agree.
  if (matches(name, color.label, [color.name, ...color.aliases])) return true
  const stripped = name.normalize('NFKC').replace(/^#?\d+\s+/, '')
  return key(stripped) === key(color.name)
}

async function plan() {
  const [manufacturers, series, models, variants] = await Promise.all([
    db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(), db.lureVariants.toArray(),
  ])
  const report: Rc22Preview = { addedColors: 0, retainedColors: 0, pendingColors: 0, addedModels: 0, addedSeries: 0,
    rows: [], comparisonToken: JSON.stringify([manufacturers, series, models, variants]) }
  const operations: { target: Target; manufacturerId: number; seriesId?: number; modelId?: number; colors: Color[] }[] = []
  const newSeries = new Set<string>()
  for (const target of rc22Catalog) {
    const ids: Pick<Rc22Row, 'manufacturer_id' | 'series_id' | 'model_id'> = { manufacturer_id: '', series_id: '', model_id: '' }
    const baseRow = (kind: Rc22Row['kind'], action: Action, reason = '', color?: Color): Rc22Row => ({
      kind, manufacturer: target.manufacturer, series: target.series, model: target.model, action_type: target.actionType,
      weight_g: target.weight, ...ids, existing_id: '', color_code: color?.code ?? '', color_name_original: color?.name ?? '',
      color_class: color?.colorClass ?? '', jan: color?.jan ?? '', manufacturer_url: color?.manufacturerUrl ?? (target.sourceUrl.includes('rob-lure.com') ? target.sourceUrl : ''),
      retailer_url: color?.retailerUrl ?? target.colors.find(c => c.retailerUrl)?.retailerUrl ?? '', source_tier: color?.sourceTier ?? target.productSourceTier,
      verification_status: target.productVerified && (!color || color.verified) ? 'confirmed' : 'pending', action, hold_reason: reason,
    })
    try {
      const manufacturer = unique(manufacturers.filter(m => matches(m.name, target.manufacturer, target.manufacturerAliases)), target.manufacturer)
      ids.manufacturer_id = manufacturer?.id ?? ''
      if (manufacturer && manufacturer.id !== 71) throw new Error('ロブルアーのメーカーIDが71と一致しません。')
      const parents = series.filter(s => s.manufacturerId === manufacturer?.id)
      const parent = unique(parents.filter(s => matches(s.name, target.series, target.seriesAliases)), target.series)
      ids.series_id = parent?.id ?? ''
      const parentIds = new Set(parents.map(s => s.id))
      const namespace = models.filter(m => parentIds.has(m.seriesId))
      const model = unique(namespace.filter(m => matches(m.name, target.model, target.modelAliases)), target.model)
      ids.model_id = model?.id ?? ''
      if (!model && namespace.some(m => matches(m.name, target.series, target.seriesAliases) &&
        !rc22Catalog.some(other => other.productVerified && m.weightG === other.weight && matches(m.name, other.model, other.modelAliases)))) throw new Error('類似するタイプ未指定モデルがあります。F/SS/SSSを確認してください。')
      if (model && (!parent || model.seriesId !== parent.id)) throw new Error('モデルのシリーズ所属が一致しません。')
      if (model && model.weightG !== target.weight) throw new Error(`重量が一致しません（既存 ${model.weightG ?? '未設定'}g / 確認値 ${target.weight}g）。`)
      if (model?.actionType && model.actionType !== target.actionType) throw new Error('既存モデルのタイプが一致しません。')
      const allowed = target.productVerified && rc22ModelAllowlist.some(([name, type, weight]) => name === target.model && type === target.actionType && weight === target.weight)
      const hold: Action | undefined = !manufacturer ? 'hold_manufacturer' : !allowed ? 'hold_product' : undefined
      const reason = !manufacturer ? '既存メーカーがありません。自動作成しません。' : !allowed ? target.holdReason || '商品許可リスト／商品検証が未確定です。' : ''
      const colors: Color[] = [], rows: Rc22Row[] = [], claimed = new Set<number>()
      for (const color of target.colors) {
        const found = unique(variants.filter(v => model && v.modelId === model.id && colorMatches(v.colorName, color)), `${target.model}/${color.name}`)
        if (found && claimed.has(found.id!)) throw new Error('1つのカラーIDが複数の原本色に一致します。')
        if (found) claimed.add(found.id!)
        const action: Action = hold ?? (!color.verified ? 'hold_color' : found ? 'keep_existing' : 'add_color')
        // A conflicting code must not be used to silently keep or create another named color.
        if (!hold && color.verified && color.code && !found && variants.some(v => model && v.modelId === model.id && v.colorName.normalize('NFKC').match(/^#?(\d+)\s+/)?.[1] === color.code)) throw new Error(`カラー番号 ${color.code} の既存名が原本と一致しません。`)
        rows.push({ ...baseRow('color', action, hold ? reason : !color.verified ? color.notes : '', color), existing_id: found?.id ?? '' })
        if (action === 'add_color') colors.push(color)
      }
      const addsModel = !hold && !model && colors.length > 0
      const addsSeries = addsModel && !parent
      const seriesKey = `${manufacturer?.id}/${target.series}`
      report.rows.push({ ...baseRow('series', hold ?? (addsSeries ? 'add_series' : 'keep_existing'), reason), existing_id: parent?.id ?? '' },
        { ...baseRow('model', hold ?? (addsModel ? 'add_model' : 'keep_existing'), reason), existing_id: model?.id ?? '' }, ...rows)
      if (!hold && manufacturer && colors.length) {
        if (addsModel) report.addedModels++
        if (addsSeries) newSeries.add(seriesKey)
        operations.push({ target, manufacturerId: manufacturer.id!, seriesId: parent?.id, modelId: model?.id, colors })
      }
    } catch (error) {
      report.rows.push(baseRow('series', 'hold_conflict', String(error)), baseRow('model', 'hold_conflict', String(error)),
        ...target.colors.map(c => baseRow('color', 'hold_conflict', String(error), c)))
    }
  }
  const colorRows = report.rows.filter(r => r.kind === 'color')
  report.addedColors = colorRows.filter(r => r.action === 'add_color').length
  report.retainedColors = colorRows.filter(r => r.action === 'keep_existing').length
  report.pendingColors = colorRows.filter(r => r.action.startsWith('hold_')).length
  report.addedSeries = newSeries.size
  return { report, operations }
}

export async function previewRc22Catalog(): Promise<Rc22Preview> {
  return db.transaction('r', tables, async () => (await plan()).report)
}
export async function applyRc22Catalog(comparisonToken: string): Promise<Rc22Preview> {
  return db.transaction('rw', tables, async () => {
    const { report, operations } = await plan()
    if (report.comparisonToken !== comparisonToken) throw new Error('カタログが変更されました。もう一度事前確認してください。')
    const createdSeries = new Map<string, number>()
    for (const op of operations) {
      const seriesKey = `${op.manufacturerId}/${op.target.series}`
      const seriesId = op.seriesId ?? createdSeries.get(seriesKey) ?? await db.lureSeries.add({ manufacturerId: op.manufacturerId, name: op.target.series })
      createdSeries.set(seriesKey, seriesId!)
      const modelId = op.modelId ?? await db.lureModels.add({ seriesId: seriesId!, name: op.target.model,
        weightG: op.target.weight, category: 'クランク', actionType: op.target.actionType })
      for (const color of op.colors) await db.lureVariants.add({ modelId: modelId!, colorName: color.label,
        catalogEvidence: { revision: 'RC22', colorClass: color.colorClass, sourceTier: color.sourceTier,
          manufacturerUrl: color.manufacturerUrl, retailerUrl: color.retailerUrl, jan: color.jan, originalName: color.name } })
    }
    return report
  })
}
export function rc22DiffCsv(preview: Rc22Preview) {
  const fields = ['kind','manufacturer','series','model','action_type','weight_g','manufacturer_id','series_id','model_id','existing_id',
    'color_code','color_name_original','color_class','jan','manufacturer_url','retailer_url','source_tier','verification_status','action','hold_reason'] as const
  const cell = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
  return '\uFEFF' + [fields.join(','), ...preview.rows.map(row => fields.map(field => cell(row[field])).join(','))].join('\r\n')
}
