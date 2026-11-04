import {
  visualIdentityForVariant, visualNaturalKey, validateVisualRecord, validateVisualReferences,
  type LureManufacturer, type LureSeries, type LureModel, type LureVariant, type MyLure, type LureVisualProfile,
  type VisualAppearance,
} from '../db/database'
import { lureMasterManifest, validateLureMasterManifest, type MasterManifest, type MasterTarget, type MasterColor } from '../data/lureMasterManifest'
import { colorEstimatorVersion, inferColorName } from './autoColorInference'

export interface LureMasterSnapshot {
  lureManufacturers: LureManufacturer[]; lureSeries: LureSeries[]; lureModels: LureModel[]; lureVariants: LureVariant[]
  myLures: MyLure[]; lureVisualProfiles: LureVisualProfile[]
}
export interface LureMasterOptions { includePurchases?: boolean }
export interface MasterPlanRow {
  targetKey: string; manufacturer: string; series: string; model: string; color: MasterColor
  catalog: 'add' | 'keep' | 'hold'; reason: string; existingId?: number; plannedVariantId?: number
  ownership: 'add' | 'keep' | 'none'; visual: 'photo' | 'name' | 'unknown' | 'keep' | 'none'
  appearance?: VisualAppearance
  visualEvidence?: LureVisualProfile['evidence']
}
export type MasterAddition =
  | { table: 'lureManufacturers'; value: LureManufacturer }
  | { table: 'lureSeries'; value: LureSeries }
  | { table: 'lureModels'; value: LureModel }
  | { table: 'lureVariants'; value: LureVariant }

export interface LureMasterPlan {
  masterVersion: string; matchingVersion: number; options: { includePurchases: boolean }; comparisonToken: string
  rows: MasterPlanRow[]; additions: MasterAddition[]; pending: MasterManifest['pending']
  addedManufacturers: number; addedSeries: number; addedModels: number; addedColors: number; retainedColors: number; heldColors: number
  addedOwned: number; retainedOwned: number; photoColors: number; provisionalColors: number; unknownColors: number
}

/** Stable ordering makes array order and object property order irrelevant to the comparison token. */
export function stableMasterValue(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]))
    return v
  }
  return JSON.stringify(canonical(value))
}
function orderedSnapshot(s: LureMasterSnapshot): LureMasterSnapshot {
  return Object.fromEntries(Object.entries(s).map(([table, rows]) => [table,
    [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }))])) as unknown as LureMasterSnapshot
}
function one<T>(rows: T[], label: string): T | undefined {
  if (rows.length > 1) throw new Error(`${label}: 候補が複数あります`)
  return rows[0]
}
function key(s: string, t: MasterTarget, maker = false) {
  let value = s.normalize('NFKC').toLowerCase()
  if (t.rule === 'legacy' || t.rule === 'barbie' || t.rule === 'moca') value = value.replace(/[\s・（）()_-]/g, '')
  else if (t.rule === 'classified') value = value.replace(/\s/g, '').replace(/(\d+)\.0g/g, '$1g')
  else if (t.rule === 'rc33') value = value.replace(/[\s‐‑–—−-]/g, '')
  else { value = value.replace(/\s/g, ''); if (maker) value = value.replace(/[()]/g, '') }
  return value
}
const matches = (name: string, official: string, aliases: string[], t: MasterTarget, maker = false) =>
  [official, ...aliases].some(n => key(n, t, maker) === key(name, t, maker))
const codeKey = (s: string) => {
  const code = s.normalize('NFKC').toLowerCase().replace(/[\s‐‑‒–—−#-]/g, '')
  return /^\d+$/.test(code) ? String(Number(code)) : code.replace(/^t0+(\d+)$/, 't$1')
}
const explicitCode = (v: LureVariant) => v.catalogEvidence?.colorCode ||
  v.colorName.normalize('NFKC').match(/^#?([A-Za-z]*-?\d+[A-Za-z0-9-]*)\s+/)?.[1]

function nameMatches(v: LureVariant, c: MasterColor, t: MasterTarget) {
  const names = [v.colorName]
  if (t.rule === 'palms' || t.rule === 'rc33') names.push(v.catalogEvidence?.originalName ?? '')
  if (t.rule === 'barbie' || t.rule === 'classified' || t.rule === 'moca') names.push(v.colorName.normalize('NFKC').replace(/^#?\d+\s+/, ''))
  if (t.rule === 'rc33') names.push(v.colorName.replace(/^#?[A-Za-z0-9-]+\s+/, ''))
  return names.some(n => !!n && matches(n, c.name, [c.label, ...c.aliases], t))
}
function findColor(variants: LureVariant[], all: LureVariant[], c: MasterColor, t: MasterTarget) {
  const codeFirst = t.rule === 'palms' || t.rule === 'rc33' || t.rule === 'moca'
  const found = one(variants.filter(v => {
    const code = explicitCode(v)
    if (codeFirst && code && c.code) return codeKey(code) === codeKey(c.code)
    if (nameMatches(v, c, t)) return true
    if (t.rule === 'legacy' && c.code && code) return codeKey(code) === codeKey(c.code)
    return t.rule === 'classified' && !!c.jan && v.catalogEvidence?.jan === c.jan
  }), c.label)
  if (found) {
    const code = explicitCode(found)
    if (t.rule === 'moca' && !nameMatches(found, c, t)) throw new Error('カラーコードと名称が競合しています')
    if (t.rule === 'moca' && found.catalogEvidence?.colorClass && found.catalogEvidence.colorClass !== c.colorClass) throw new Error('標準色と限定色の区分が競合しています')
    if (c.code && code && codeKey(c.code) !== codeKey(code)) throw new Error('カラー名称と明示コードが競合しています')
    if (t.rule === 'classified') {
      if (!nameMatches(found, c, t)) throw new Error('JANとカラー名称が一致しません')
      if (found.catalogEvidence && found.catalogEvidence.colorClass !== c.colorClass) throw new Error('限定区分が一致しません')
    }
    if (c.jan && found.catalogEvidence?.jan && c.jan !== found.catalogEvidence.jan) throw new Error('既存JANが一致しません')
  } else {
    if (variants.some(v => {
      const code = explicitCode(v)
      if (codeFirst && code && nameMatches(v, c, t)) return true
      if ((t.rule === 'classified' || t.rule === 'barbie') && code && c.code && codeKey(code) === codeKey(c.code)) {
        if (v.catalogEvidence && v.catalogEvidence.colorClass !== c.colorClass) return false
        // USSA reuses numbers across explicitly documented limited classes.
        if (t.rule === 'classified' && t.colors.some(other => other !== c && other.colorClass !== c.colorClass &&
          codeKey(other.code) === codeKey(c.code) && nameMatches(v, other, t))) return false
        return true
      }
      return false
    })) throw new Error('カラーコードと名称・区分が競合しています')
  }
  if (c.jan && all.some(v => v.catalogEvidence?.jan === c.jan && v.id !== found?.id)) throw new Error('JANが別の既存カラーに割り当てられています')
  return found
}

function variantValue(t: MasterTarget, c: MasterColor, modelId: number): LureVariant {
  // The unified apply persists provenance for new legacy-pack colors too. Existing variants remain untouched.
  const revision = c.sources.some(s => s.revision === 'RC38') ? 'RC38' : c.sources.find(s => ['RC22', 'RC28', 'RC30', 'RC31', 'RC33', 'RC37'].includes(s.revision))?.revision ?? c.sources.at(-1)!.revision
  return { modelId, colorName: c.label,
    catalogEvidence: {
      revision, colorClass: c.colorClass, sourceTier: c.sourceTier,
      manufacturerUrl: c.manufacturerUrl, retailerUrl: c.retailerUrl, jan: c.jan, originalName: c.name,
      ...(revision === 'RC37' ? { verified: c.verified, checkedAt: '2026-11-03', verificationStatus: 'retailer-confirmed' } : {}),
      ...(revision === 'RC38' ? { verified: c.verified, checkedAt: '2026-11-04', verificationStatus: 'retailer-confirmed' } : {}),
      ...(revision === 'RC22' ? {} : { colorCode: c.code, weightG: t.weight, lengthMm: t.length,
        buoyancy: t.buoyancy, rattle: t.rattle, productUrl: revision === 'RC33' ? c.sourceUrl : t.sourceUrl }),
    },
  }
}

/** Pure add-only plan. Negative IDs are temporary plan references, never DB/source IDs. */
export function planLureMaster(snapshot: LureMasterSnapshot, options: LureMasterOptions = {}, manifest: MasterManifest = lureMasterManifest): LureMasterPlan {
  validateLureMasterManifest(manifest)
  for (const name of ['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures'] as const) {
    const ids = new Set<number>()
    for (const row of snapshot[name]) {
      if (!Number.isSafeInteger(row.id) || row.id! <= 0 || ids.has(row.id!)) throw new Error(`${name}: IDが不正または重複しています`)
      ids.add(row.id!)
    }
  }
  const selected = { includePurchases: options.includePurchases === true }
  // A legacy model must not be claimed by two distinct manifest products through aliases.
  const bindings = new Map<number, Set<string>>()
  for (const t of manifest.targets) for (const model of snapshot.lureModels) {
    const parent = snapshot.lureSeries.find(p => p.id === model.seriesId)
    const maker = snapshot.lureManufacturers.find(m => m.id === parent?.manufacturerId)
    if (parent && maker && matches(maker.name, t.manufacturer, t.manufacturerAliases, t, true) &&
      matches(parent.name, t.series, t.seriesAliases, t) && matches(model.name, t.model, t.modelAliases, t)) {
      const claims = bindings.get(model.id!) ?? new Set<string>()
      claims.add(t.key); bindings.set(model.id!, claims)
    }
  }
  const ambiguousTargets = new Set([...bindings.values()].filter(claims => claims.size > 1).flatMap(claims => [...claims]))
  let working = structuredClone(orderedSnapshot(snapshot)), nextId = -1
  const additions: MasterAddition[] = [], reports = new Map<string, MasterPlanRow[]>()
  let remaining = [...manifest.targets]
  // Revisit missing dependencies when another permitted target creates their parent in the virtual state.
  // Nothing is written to IndexedDB, even on these retries.
  while (remaining.length) {
    const retry: MasterTarget[] = []; let progress = false
    for (const t of remaining) {
      const s = structuredClone(working), staged: MasterAddition[] = [], savedId = nextId
      const rows: MasterPlanRow[] = []
      const base = (c: MasterColor): MasterPlanRow => ({ targetKey: t.key, manufacturer: t.manufacturer, series: t.series, model: t.model,
        color: structuredClone(c), catalog: 'hold', reason: '', ownership: 'none', visual: 'none' })
      try {
        if (ambiguousTargets.has(t.key)) throw new Error('異なる商品が同じ既存モデルIDに一致しています')
        let maker = one(s.lureManufacturers.filter(m => matches(m.name, t.manufacturer, t.manufacturerAliases, t, true)), t.manufacturer)
        if (!maker && !t.allowNewManufacturer) throw new Error('対象メーカーが見つかりません')
        let parent = one(s.lureSeries.filter(p => maker && p.manufacturerId === maker.id && matches(p.name, t.series, t.seriesAliases, t)), t.series)
        const parentIds = new Set(s.lureSeries.filter(p => maker && p.manufacturerId === maker.id).map(p => p.id))
        if (!t.preserveAmbiguousModel && t.blockedModelAliases?.length && s.lureModels.some(m => parentIds.has(m.seriesId) &&
          t.blockedModelAliases!.some(alias => key(m.name, t) === key(alias, t)))) throw new Error('既存のMOCA DR RattleはF/SS未確認です。モデルの同一性を確認してください')
        if (s.lureModels.some(m => parentIds.has(m.seriesId) && m.seriesId !== parent?.id && matches(m.name, t.model, t.modelAliases, t))) throw new Error('同名モデルが別シリーズにあります')
        let model = one(s.lureModels.filter(m => parent && m.seriesId === parent.id && matches(m.name, t.model, t.modelAliases, t)), t.model)
        if (t.rule === 'barbie' && !model && s.lureModels.some(m => parentIds.has(m.seriesId) && matches(m.name, t.series, t.seriesAliases, t) &&
          !manifest.targets.some(other => other.rule === 'barbie' && other.productVerified && m.weightG === other.weight && matches(m.name, other.model, other.modelAliases, other)))) throw new Error('タイプ未指定モデルがあります。F/SS/SSSを確認してください')
        if (model && (model.weightG !== undefined && model.weightG !== t.weight || t.requireWeight && model.weightG === undefined ||
          model.lengthMm !== undefined && (t.length !== undefined || t.rule === 'classified') && model.lengthMm !== t.length ||
          model.actionType !== undefined && (t.actionType !== undefined || t.rule === 'classified') && model.actionType !== t.actionType)) throw new Error('既存モデルの重量・全長・タイプが一致しません')
        if (!t.productVerified) throw new Error(t.holdReason || '商品が未確認です')
        if (!model && !t.allowNewModel) throw new Error('未登録モデルの作成は許可されていません')
        const existing = s.lureVariants.filter(v => model && v.modelId === model.id), claimed = new Set<number>()
        for (const c of t.colors) {
          const row = base(c)
          if (!c.verified) { row.reason = c.holdReason || 'カラーが未確認です'; rows.push(row); continue }
          const found = findColor(existing, s.lureVariants, c, t)
          if (found && claimed.has(found.id!)) throw new Error('複数カラーが同じ既存IDに一致しました')
          if (found) claimed.add(found.id!)
          row.catalog = found ? 'keep' : 'add'; row.existingId = found?.id
          // New hierarchy exists only in this target's tentative copy until every color is checked.
          if (!maker) {
            maker = { id: nextId--, name: t.manufacturer }; s.lureManufacturers.push(maker)
            staged.push({ table: 'lureManufacturers', value: maker })
          }
          if (!parent) {
            parent = { id: nextId--, manufacturerId: maker.id!, name: t.series }; s.lureSeries.push(parent)
            staged.push({ table: 'lureSeries', value: parent })
          }
          if (!model) {
            model = { id: nextId--, seriesId: parent.id!, name: t.model, weightG: t.weight, category: t.category,
              ...(t.length === undefined ? {} : { lengthMm: t.length }), ...(t.actionType ? { actionType: t.actionType } : {}) }
            s.lureModels.push(model); staged.push({ table: 'lureModels', value: model })
          }
          const variant = found ?? { ...variantValue(t, c, model.id!), id: nextId-- }
          row.plannedVariantId = variant.id
          if (row.catalog === 'add') { s.lureVariants.push(variant); staged.push({ table: 'lureVariants', value: variant }) }
          if (c.purchase) row.ownership = s.myLures.some(m => m.variantId === variant.id) ? 'keep' : selected.includePurchases ? 'add' : 'none'
          if (c.sources.some(source => source.revision === 'RC33')) {
            const identity = visualIdentityForVariant(variant, model, parent, maker), naturalKey = visualNaturalKey(identity)
            const profile = one(s.lureVisualProfiles.filter(p => p.naturalKey === naturalKey || p.variantId === variant.id), '配色')
            if (profile) {
              validateVisualRecord('lureVisualProfiles', profile)
              if (variant.id! < 0 || profile.variantId !== variant.id || profile.naturalKey !== naturalKey) throw new Error('既存配色は参照解除済み、または参照が一致しません')
              validateVisualReferences([profile], [], s)
              row.visual = 'keep'
            } else {
              const inferred = inferColorName(c.name).inference
              row.appearance = structuredClone(c.appearance ?? inferred?.appearance)
              row.visual = c.appearance ? 'photo' : row.appearance ? 'name' : 'unknown'
              if (row.appearance) row.visualEvidence = {
                sourceUrl: c.imageUrl ?? c.sourceUrl, inputName: c.name,
                basis: c.appearance ? ['公式カラー画像の可視面を48色に近似。不可視面は未設定。属性は公式名称を併用。共通チャートの形状・目玉は登録しない。'] : [...inferred!.basis],
                ...(c.appearance ? {} : { estimatorVersion: inferred!.estimatorVersion, confidence: inferred!.confidence }),
              }
            }
          }
          rows.push(row)
        }
        working = s; additions.push(...staged); reports.set(t.key, rows); progress = true
      } catch (error) {
        nextId = savedId
        reports.set(t.key, t.colors.map(c => ({ ...base(c), reason: String(error) })))
        retry.push(t)
      }
    }
    if (!progress) break
    remaining = retry
  }
  const rows = manifest.targets.flatMap(t => reports.get(t.key) ?? [])
  return {
    masterVersion: manifest.masterVersion, matchingVersion: manifest.matchingVersion, options: selected,
    comparisonToken: stableMasterValue({ manifest, estimatorVersion: colorEstimatorVersion, snapshot: orderedSnapshot(snapshot), options: selected }),
    rows, additions: structuredClone(additions), pending: structuredClone(manifest.pending),
    addedManufacturers: additions.filter(a => a.table === 'lureManufacturers').length,
    addedSeries: additions.filter(a => a.table === 'lureSeries').length, addedModels: additions.filter(a => a.table === 'lureModels').length,
    addedColors: rows.filter(r => r.catalog === 'add').length, retainedColors: rows.filter(r => r.catalog === 'keep').length,
    heldColors: rows.filter(r => r.catalog === 'hold').length,
    addedOwned: rows.filter(r => r.ownership === 'add').length, retainedOwned: rows.filter(r => r.ownership === 'keep').length,
    photoColors: rows.filter(r => r.visual === 'photo').length, provisionalColors: rows.filter(r => r.visual === 'name').length,
    unknownColors: rows.filter(r => r.visual === 'unknown').length,
  }
}
