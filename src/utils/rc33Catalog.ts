import { db, visualIdentityForVariant, visualNaturalKey, validateVisualRecord, validateVisualReferences,
  type LureVisualProfile } from '../db/database'
import { rc33Catalog, type Rc33Color } from '../data/rc33Catalog'
import { inferColorName } from './autoColorInference'

const tables = [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants, db.myLures, db.lureVisualProfiles]
const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s‐‑–—−-]/g, '')
const codeKey = (s: string) => {
  const normalized = key(s).replace(/^#/, '')
  return /^\d+$/.test(normalized) ? String(Number(normalized)) : normalized
}
const matches = (s: string, name: string, aliases: string[] = []) => [name, ...aliases].some(n => key(n) === key(s))
function one<T>(rows: T[]): T | undefined {
  if (rows.length > 1) throw new Error('一致候補が複数あります。手動確認が必要です。')
  return rows[0]
}
async function snapshot() {
  const [lureManufacturers, lureSeries, lureModels, lureVariants, myLures, lureVisualProfiles] = await Promise.all([
    db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(), db.lureVariants.toArray(), db.myLures.toArray(), db.lureVisualProfiles.toArray(),
  ])
  return { lureManufacturers, lureSeries, lureModels, lureVariants, myLures, lureVisualProfiles }
}
export interface Rc33Row {
  target: number; color: number; manufacturer: string; model: string; name: string; sourceUrl: string
  catalog: 'add' | 'keep' | 'hold'; ownership: 'add' | 'keep' | 'none'; visual: 'photo' | 'name' | 'unknown' | 'keep'
  reason: string; variantId?: number
}
function appearance(c: Rc33Color) { return c.appearance ?? inferColorName(c.name).inference?.appearance }
async function plan() {
  const s = await snapshot(), rows: Rc33Row[] = []
  for (const [ti, t] of rc33Catalog.entries()) {
    try {
      const maker = one(s.lureManufacturers.filter(m => matches(m.name, t.manufacturer, t.manufacturerAliases)))
      const parent = one(s.lureSeries.filter(p => maker && p.manufacturerId === maker.id && matches(p.name, t.series, t.seriesAliases)))
      const model = one(s.lureModels.filter(m => parent && m.seriesId === parent.id && matches(m.name, t.model, t.modelAliases)))
      // A model under an unexpected series must not be silently duplicated.
      if (!model && s.lureModels.some(m => matches(m.name, t.model, t.modelAliases) && s.lureSeries.some(p => p.id === m.seriesId && p.manufacturerId === maker?.id))) throw new Error('同名モデルが別シリーズにあります。')
      if (model && (model.weightG !== undefined && model.weightG !== t.weight || model.lengthMm !== undefined && model.lengthMm !== t.length)) throw new Error('既存モデルの重量または全長が一致しません。')
      const targetRows: Rc33Row[] = [], claimed = new Set<number>()
      for (const [ci, c] of t.colors.entries()) {
        const variants = s.lureVariants.filter(v => model && v.modelId === model.id)
        const sameName = (v: typeof variants[number]) => [v.colorName, v.catalogEvidence?.originalName ?? '', v.colorName.replace(/^#?[A-Za-z0-9-]+\s+/, '')].some(n => matches(n, c.name, c.aliases))
        const code = (v: typeof variants[number]) => v.catalogEvidence?.colorCode || v.colorName.normalize('NFKC').match(/^#?([A-Za-z]*-?\d+[A-Za-z0-9]*)\s+/)?.[1]
        const variant = one(variants.filter(v => c.code && code(v) ? codeKey(code(v)!) === codeKey(c.code) : sameName(v)))
        if (!variant && c.code && variants.some(v => code(v) && sameName(v))) throw new Error('カラー名と明示コードが競合しています。')
        if (variant && claimed.has(variant.id!)) throw new Error('複数の候補色が同じIDに一致しました。')
        if (variant) claimed.add(variant.id!)
        const identity = visualIdentityForVariant(variant ?? { modelId: model?.id ?? -1, colorName: c.name, catalogEvidence: evidence(c, t) }, model ?? { id: -1, seriesId: parent?.id ?? -1, name: t.model }, parent ?? { id: -1, manufacturerId: maker?.id ?? -1, name: t.series }, maker ?? { id: -1, name: t.manufacturer })
        const naturalKey = visualNaturalKey(identity)
        const existingProfiles = s.lureVisualProfiles.filter(p => p.naturalKey === naturalKey || variant && p.variantId === variant.id)
        const profile = one(existingProfiles)
        if (profile) {
          validateVisualRecord('lureVisualProfiles', profile)
          if (!variant || profile.variantId !== variant.id || profile.naturalKey !== naturalKey) throw new Error('既存配色の参照が一致しません。')
          validateVisualReferences([profile], [], s)
        }
        targetRows.push({ target: ti, color: ci, manufacturer: t.manufacturer, model: t.model, name: c.name, sourceUrl: c.sourceUrl,
          catalog: variant ? 'keep' : 'add', variantId: variant?.id,
          ownership: c.purchase ? variant && s.myLures.some(m => m.variantId === variant.id) ? 'keep' : 'add' : 'none',
          visual: profile ? 'keep' : c.appearance ? 'photo' : appearance(c) ? 'name' : 'unknown', reason: '' })
      }
      rows.push(...targetRows)
    } catch (error) {
      rows.push(...t.colors.map((c, ci): Rc33Row => ({ target: ti, color: ci, manufacturer: t.manufacturer, model: t.model, name: c.name, sourceUrl: c.sourceUrl, catalog: 'hold', ownership: 'none', visual: 'unknown', reason: String(error) })))
    }
  }
  return { rows, addedColors: rows.filter(r => r.catalog === 'add').length, retainedColors: rows.filter(r => r.catalog === 'keep').length,
    heldColors: rows.filter(r => r.catalog === 'hold').length, addedOwned: rows.filter(r => r.ownership === 'add').length,
    retainedOwned: rows.filter(r => r.ownership === 'keep').length,
    photoColors: rows.filter(r => r.catalog !== 'hold' && r.visual === 'photo').length,
    provisionalColors: rows.filter(r => r.catalog !== 'hold' && r.visual === 'name').length,
    unknownColors: rows.filter(r => r.catalog !== 'hold' && r.visual === 'unknown').length,
    comparisonToken: JSON.stringify(s) }
}
function evidence(c: Rc33Color, t: typeof rc33Catalog[number]) {
  return { revision: 'RC33' as const, colorClass: t.manufacturer === 'Lucky Craft' ? 'heroes' : '', sourceTier: c.sourceTier,
    manufacturerUrl: c.sourceTier === 'manufacturer' ? c.sourceUrl : '', retailerUrl: c.sourceTier === 'retailer' ? c.sourceUrl : '',
    jan: '', originalName: c.name, colorCode: c.code, weightG: t.weight, lengthMm: t.length, productUrl: c.sourceUrl }
}
export type Rc33Preview = Awaited<ReturnType<typeof plan>>
export async function previewRc33Catalog(): Promise<Rc33Preview> { return db.transaction('r', tables, plan) }
/** Explicit, atomic add-only import. Existing ownership (including inactive/unverified) is never incremented. */
export async function applyRc33Catalog(token: string): Promise<Rc33Preview> {
  return db.transaction('rw', tables, async () => {
    const report = await plan()
    if (report.comparisonToken !== token) throw new Error('カタログ・所有・配色が変更されました。事前確認をやり直してください。')
    for (const row of report.rows.filter(r => r.catalog !== 'hold')) {
      const t = rc33Catalog[row.target]!, c = t.colors[row.color]!
      let maker = one((await db.lureManufacturers.toArray()).filter(m => matches(m.name, t.manufacturer, t.manufacturerAliases)))
      if (!maker) { const value = { name: t.manufacturer }; maker = { ...value, id: await db.lureManufacturers.add(value) } }
      let parent = one((await db.lureSeries.toArray()).filter(p => p.manufacturerId === maker.id && matches(p.name, t.series, t.seriesAliases)))
      if (!parent) { const value = { name: t.series, manufacturerId: maker.id! }; parent = { ...value, id: await db.lureSeries.add(value) } }
      let model = one((await db.lureModels.toArray()).filter(m => m.seriesId === parent.id && matches(m.name, t.model, t.modelAliases)))
      if (!model) { const value = { name: t.model, seriesId: parent.id!, category: t.category, lengthMm: t.length, weightG: t.weight }; model = { ...value, id: await db.lureModels.add(value) } }
      const value = { modelId: model.id!, colorName: c.code ? `${c.code} ${c.name}` : c.name, catalogEvidence: evidence(c, t) }
      const variantId = row.variantId ?? (await db.lureVariants.add(value))!
      const variant = row.variantId ? (await db.lureVariants.get(variantId))! : { ...value, id: variantId }
      if (row.ownership === 'add') await db.myLures.add({ variantId, active: true, ownershipStatus: 'owned' })
      if (row.visual === 'photo' || row.visual === 'name') {
        const identity = visualIdentityForVariant(variant, model, parent, maker), inferred = inferColorName(c.name).inference
        const profile: LureVisualProfile = { id: crypto.randomUUID(), variantId, identity, naturalKey: visualNaturalKey(identity), appearance: appearance(c)!,
          origin: row.visual === 'photo' ? 'photo' : 'name', confirmed: row.visual === 'photo', userEdited: false, revision: 1, updatedAt: new Date().toISOString(),
          evidence: { sourceUrl: c.imageUrl ?? c.sourceUrl, inputName: c.name, basis: row.visual === 'photo' ? ['公式カラー画像の可視面を48色に近似。不可視面は未設定。属性は公式名称を併用。共通チャートの形状・目玉は登録しない。'] : inferred!.basis,
            ...(row.visual === 'name' ? { estimatorVersion: inferred!.estimatorVersion, confidence: inferred!.confidence } : {}) } }
        validateVisualRecord('lureVisualProfiles', profile)
        validateVisualReferences([profile], [], await snapshot())
        await db.lureVisualProfiles.add(profile)
      }
    }
    return report
  })
}
