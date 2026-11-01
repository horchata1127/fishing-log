import type { LureMasterHistoryCounts, LureMasterHistoryRecord } from '../db/database'
import type { LureMasterPlan, MasterPlanRow } from './lureMasterPlanner'

export const masterCountLabels = { lureManufacturers: 'メーカー', lureSeries: 'シリーズ', lureModels: 'モデル', lureVariants: 'カラー', lureVisualProfiles: '代表配色', myLures: '所有ルアー' } as const
export const importStatusLabels = { running: '確認不能（実行中または中断未確認）', succeeded: '成功', succeeded_with_holds: '保留あり成功', no_changes: '変更なし', failed: '失敗', interrupted: '中断' } as const
export function localImportTime(value?: string) {
  return value ? new Date(value).toLocaleString('ja-JP', { hour12: false }) : '未完了'
}
export function historyAddedTotal(row: LureMasterHistoryRecord) {
  return row.kind === 'import' ? Object.values(row.counts).reduce((n, c) => n + c.added, 0) : 0
}
export function plannedAdditions(plan: LureMasterPlan): Record<keyof LureMasterHistoryCounts, number> {
  return { lureManufacturers: plan.addedManufacturers, lureSeries: plan.addedSeries, lureModels: plan.addedModels,
    lureVariants: plan.addedColors, lureVisualProfiles: plan.photoColors + plan.provisionalColors, myLures: plan.addedOwned }
}
export function groupMasterPlan(plan: LureMasterPlan) {
  const models = new Map<string, { key: string; manufacturer: string; series: string; model: string; rows: MasterPlanRow[] }>()
  for (const row of plan.rows) {
    const group = models.get(row.targetKey) ?? { key: row.targetKey, manufacturer: row.manufacturer, series: row.series, model: row.model, rows: [] }
    group.rows.push(row); models.set(row.targetKey, group)
  }
  return [...models.values()]
}
/** Export the displayed plan, never call the planner again or label these numbers as actual imports. */
export function lureMasterPlanCsv(plan: LureMasterPlan) {
  const cell = (value: unknown) => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""')}"`
  const fields = ['kind', 'masterVersion', 'manufacturer', 'series', 'model', 'colorCode', 'color', 'action', 'reason', 'sourceRC', 'sourceUrl', 'existingId', 'ownership', 'visual']
  const rows = plan.rows.map(r => ['plan', plan.masterVersion, r.manufacturer, r.series, r.model, r.color.code, r.color.label,
    r.catalog, r.reason, r.color.sources.map(s => s.revision).join('|'), r.color.sourceUrl, r.existingId ?? '', r.ownership, r.visual])
  return '\uFEFF' + [fields.join(','), ...rows.map(row => row.map(cell).join(','))].join('\r\n')
}
