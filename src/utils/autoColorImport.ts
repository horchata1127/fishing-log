import { db, visualIdentityForVariant, visualNaturalKey, validateVisualRecord, validateVisualReferences,
  type LureManufacturer, type LureSeries, type LureModel, type LureVariant, type LureVisualProfile, type VisualIdentity } from '../db/database'
import { colorEstimatorVersion, inferColorName, type NameInference } from './autoColorInference'
import { addInferredVisualProfiles } from './visualColorStorage'

export interface AutoColorSnapshot {
  lureManufacturers: LureManufacturer[]; lureSeries: LureSeries[]; lureModels: LureModel[]; lureVariants: LureVariant[]; lureVisualProfiles: LureVisualProfile[]
}
export interface AutoColorRow {
  variantId: number; manufacturer: string; series: string; model: string; colorName: string; colorCode: string
  identity?: VisualIdentity; naturalKey?: string; inference?: NameInference; sourceUrl?: string
  action: 'add' | 'keep' | 'protected' | 'hold' | 'unknown'; reason: string
}
export interface AutoColorPreview {
  total: number; uniqueNames: number; namePossible: number; photoMatched: number; unknown: number
  added: number; kept: number; protected: number; held: number; rows: AutoColorRow[]; comparisonToken: string
}
const tables = [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants, db.lureVisualProfiles]
async function readSnapshot(): Promise<AutoColorSnapshot> {
  const [lureManufacturers, lureSeries, lureModels, lureVariants, lureVisualProfiles] = await Promise.all([
    db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(), db.lureVariants.toArray(), db.lureVisualProfiles.toArray(),
  ])
  return { lureManufacturers, lureSeries, lureModels, lureVariants, lureVisualProfiles }
}

/** Analyze exported catalog arrays without opening, restoring or modifying a database. */
export function planAutoColors(snapshot: AutoColorSnapshot): AutoColorPreview {
  const manufacturers = new Map(snapshot.lureManufacturers.map(m => [m.id, m]))
  const series = new Map(snapshot.lureSeries.map(s => [s.id, s]))
  const models = new Map(snapshot.lureModels.map(m => [m.id, m]))
  const rows: AutoColorRow[] = snapshot.lureVariants.map(variant => {
    const model = models.get(variant.modelId), parent = model && series.get(model.seriesId), maker = parent && manufacturers.get(parent.manufacturerId)
    const parsed = inferColorName(variant.catalogEvidence?.originalName || variant.colorName)
    const row: AutoColorRow = { variantId: variant.id!, manufacturer: maker?.name ?? '', series: parent?.name ?? '', model: model?.name ?? '',
      colorName: variant.colorName, colorCode: variant.catalogEvidence?.colorCode ?? '', inference: parsed.inference,
      sourceUrl: variant.catalogEvidence?.manufacturerUrl || variant.catalogEvidence?.productUrl || undefined,
      action: parsed.inference ? 'add' : 'unknown', reason: parsed.reason }
    if (!Number.isSafeInteger(variant.id) || variant.id! <= 0 || !model || !parent || !maker) return { ...row, action: 'hold', reason: 'IDまたは親参照が不正です' }
    row.identity = visualIdentityForVariant(variant, model, parent, maker)
    if (row.identity.color.kind === 'code') row.colorCode = row.identity.color.value
    row.naturalKey = visualNaturalKey(row.identity)
    return row
  })
  const frequencies = new Map<string, number>(), ids = new Map<number, number>()
  for (const row of rows) {
    if (row.naturalKey) frequencies.set(row.naturalKey, (frequencies.get(row.naturalKey) ?? 0) + 1)
    ids.set(row.variantId, (ids.get(row.variantId) ?? 0) + 1)
  }
  for (const row of rows) {
    if (row.action === 'hold') continue
    if (frequencies.get(row.naturalKey!) !== 1 || ids.get(row.variantId) !== 1) { row.action = 'hold'; row.reason = '公式カラーの自然キーまたはIDが重複しています'; continue }
    const existing = snapshot.lureVisualProfiles.filter(p => p.variantId === row.variantId || p.naturalKey === row.naturalKey)
    if (existing.length > 1) { row.action = 'hold'; row.reason = '複数の既存プロフィールが一致しています'; continue }
    const profile = existing[0]
    if (profile) {
      try {
        validateVisualRecord('lureVisualProfiles', profile)
        if (profile.variantId !== row.variantId || profile.naturalKey !== row.naturalKey) throw new Error('参照解除済み、またはIDと自然キーが一致しません')
        validateVisualReferences([profile], [], snapshot)
        row.action = profile.userEdited || profile.confirmed || profile.origin === 'user' ? 'protected' : 'keep'
        row.reason = row.action === 'protected' ? 'ユーザー編集済み・確認済みを保護' : '既存の推定配色を保持'
      } catch (error) { row.action = 'hold'; row.reason = String(error) }
    }
  }
  return { total: rows.length, uniqueNames: new Set(rows.map(r => r.colorName)).size,
    namePossible: rows.filter(r => r.inference).length, photoMatched: 0,
    unknown: rows.filter(r => r.action === 'unknown').length, added: rows.filter(r => r.action === 'add').length,
    kept: rows.filter(r => r.action === 'keep').length, protected: rows.filter(r => r.action === 'protected').length,
    held: rows.filter(r => r.action === 'hold').length, rows,
    comparisonToken: JSON.stringify({ estimator: colorEstimatorVersion, snapshot }) }
}

export async function previewAutoColors(): Promise<AutoColorPreview> {
  return db.transaction('r', tables, async () => planAutoColors(await readSnapshot()))
}

/** Single atomic, explicitly invoked apply. No updates to existing visual or catalog rows. */
export async function applyAutoColors(comparisonToken: string): Promise<AutoColorPreview> {
  return db.transaction('rw', tables, async () => {
    const snapshot = await readSnapshot(), preview = planAutoColors(snapshot)
    if (preview.comparisonToken !== comparisonToken) throw new Error('カタログまたは配色が変更されました。取り込み前の確認をやり直してください。')
    const updatedAt = new Date().toISOString()
    const profiles = preview.rows.filter(r => r.action === 'add').map(row => {
      const inferred = row.inference!
      const profile: LureVisualProfile = { id: crypto.randomUUID(), variantId: row.variantId, identity: row.identity!, naturalKey: row.naturalKey!,
        appearance: inferred.appearance, origin: 'name', userEdited: false, confirmed: false, revision: 1, updatedAt,
        evidence: { estimatorVersion: inferred.estimatorVersion, inputName: inferred.inputName, basis: inferred.basis, confidence: inferred.confidence,
          ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}) } }
      return profile
    })
    await addInferredVisualProfiles(profiles)
    return preview
  })
}
