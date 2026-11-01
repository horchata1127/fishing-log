import type { LureCategory, LureModel, VisualAppearance } from '../db/database'
import { rc20Catalog } from './rc20Catalog'
import { rc21Catalog } from './rc21Catalog'
import { rc22Catalog } from './rc22Catalog'
import { rc28Catalog, rc28Pending } from './rc28Catalog'
import { rc30Catalog, rc30Pending } from './rc30Catalog'
import { rc31Catalog } from './rc31Catalog'
import { rc33Catalog } from './rc33Catalog'

export type CatalogRevision = 'RC19' | 'RC20' | 'RC21' | 'RC22' | 'RC28' | 'RC30' | 'RC31' | 'RC33'
export type MatchingRule = 'legacy' | 'barbie' | 'classified' | 'palms' | 'rc33'
interface InputColor {
  name: string; code: string; label?: string; aliases?: readonly string[]; sourceUrl?: string
  sourceTier?: string; colorClass?: string; jan?: string; manufacturerUrl?: string; retailerUrl?: string
  verified?: boolean; notes?: string; evidence?: string; purchase?: number
  appearance?: VisualAppearance; imageUrl?: string
}
interface InputTarget {
  manufacturer: string; series: string; model: string; weight: number; length?: number
  manufacturerAliases: readonly string[]; seriesAliases: readonly string[]; modelAliases: readonly string[]
  colors: readonly InputColor[]; category?: string; actionType?: LureModel['actionType']; sourceUrl?: string
  allowNewModel?: boolean; productVerified?: boolean; holdReason?: string; reuseWithoutWeight?: boolean
  buoyancy?: string; rattle?: string
}
export interface MasterColor {
  name: string; code: string; label: string; aliases: string[]; colorClass: string; jan: string
  sourceUrl: string; sourceTier: string; manufacturerUrl: string; retailerUrl: string
  verified: boolean; holdReason: string; purchase: number; appearance?: VisualAppearance; imageUrl?: string
  /** Keep every source's original spelling and evidence, including superseded RC19 labels. */
  sources: { revision: CatalogRevision; color: InputColor }[]
}
export interface MasterTarget {
  key: string; manufacturer: string; series: string; model: string; weight: number; length?: number
  manufacturerAliases: string[]; seriesAliases: string[]; modelAliases: string[]
  category: LureCategory; actionType?: LureModel['actionType']; buoyancy?: string; rattle?: string
  sourceUrl: string; rule: MatchingRule; revisions: CatalogRevision[]
  allowNewManufacturer: boolean; allowNewModel: boolean; requireWeight: boolean
  productVerified: boolean; holdReason: string; colors: MasterColor[]
}
export interface MasterManifest {
  masterVersion: string; matchingVersion: number; targets: MasterTarget[]
  pending: { revision: CatalogRevision; detail: { series: string; name: string; reason: string } }[]
}
const identity = (s: string) => s.normalize('NFKC').replace(/\s/g, '').toLowerCase()
const targetKey = (t: InputTarget) => JSON.stringify([t.manufacturer, t.series, t.model].map(identity))
const colorKey = (c: Pick<MasterColor, 'code' | 'name' | 'colorClass'>) => {
  let value = identity(c.code || c.name)
  if (c.code) {
    value = value.replace(/[‐‑‒–—−#-]/g, '')
    if (/^\d+$/.test(value)) value = String(Number(value))
  }
  return JSON.stringify([c.colorClass, c.code ? 'code' : 'name', value])
}
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])]
// Preserve RC22's reviewed model/type/weight combinations, independently of manufacturer IDs.
const barbieProducts = [
  ['バービー F', 'F', 1.4], ['バービー SS', 'SS', 1.6],
  ['バービー・ロング F', 'F', 1.6], ['バービー・ロング SS', 'SS', 1.8],
  ['バービー・ママ F', 'F', 2.6], ['バービー・ママ SS', 'SS', 2.8],
  ['バービー・ガール F', 'F', 0.7], ['バービー・ガール SS', 'SS', 0.9],
] as const

function adapt(t: InputTarget, revision: CatalogRevision): MasterTarget {
  const rule: MatchingRule = revision === 'RC22' ? 'barbie' : revision === 'RC28' || revision === 'RC30' ? 'classified'
    : revision === 'RC31' ? 'palms' : revision === 'RC33' ? 'rc33' : 'legacy'
  return {
    key: targetKey(t), manufacturer: t.manufacturer, series: t.series, model: t.model, weight: t.weight,
    length: t.length, manufacturerAliases: [...t.manufacturerAliases], seriesAliases: [...t.seriesAliases], modelAliases: [...t.modelAliases],
    category: (t.category ?? 'スプーン') as LureCategory, actionType: t.actionType, buoyancy: t.buoyancy, rattle: t.rattle,
    sourceUrl: t.sourceUrl ?? t.colors[0]?.sourceUrl ?? '', rule, revisions: [revision],
    allowNewManufacturer: ['RC19', 'RC31', 'RC33'].includes(revision),
    allowNewModel: t.allowNewModel ?? true,
    requireWeight: revision === 'RC21' || revision === 'RC22' || (rule === 'classified' && !t.reuseWithoutWeight),
    productVerified: (t.productVerified ?? true) && (revision !== 'RC22' || barbieProducts.some(([name, type, weight]) =>
      name === t.model && type === t.actionType && weight === t.weight)), holdReason: t.holdReason ?? '',
    colors: t.colors.map(c => {
      const sourceUrl = c.sourceUrl ?? t.sourceUrl ?? '', sourceTier = c.sourceTier ?? 'manufacturer'
      return { ...c, label: c.label ?? (c.code ? `${c.code} ${c.name}` : c.name), aliases: [...c.aliases ?? []],
        colorClass: c.colorClass ?? (revision === 'RC33' && t.manufacturer === 'Lucky Craft' ? 'heroes' : ''),
        jan: c.jan ?? '', sourceUrl, sourceTier,
        manufacturerUrl: c.manufacturerUrl ?? (sourceTier === 'manufacturer' ? sourceUrl : t.sourceUrl?.includes('jackall.co.jp') ? t.sourceUrl : ''),
        retailerUrl: c.retailerUrl ?? (sourceTier === 'retailer' ? sourceUrl : ''),
        verified: c.verified ?? true, holdReason: c.notes ?? '', purchase: c.purchase ?? 0,
        sources: [{ revision, color: structuredClone(c) }] }
    }),
  }
}

/** Only reviewed overlaps can be merged. A new overlap requires an explicit mapping. */
function merge(existing: MasterTarget, incoming: MasterTarget) {
  const rc21Extension = existing.revisions.includes('RC20') && incoming.revisions[0] === 'RC21'
  const rc19Extension = existing.revisions.includes('RC19') && incoming.revisions[0] === 'RC20'
  const rc33Enrichment = existing.revisions.includes('RC31') && incoming.revisions[0] === 'RC33' && existing.model === 'GA-24S'
  if (!(rc21Extension || rc19Extension || rc33Enrichment)) throw new Error(`未確認のRC間重複: ${incoming.key}`)
  for (const field of ['weight', 'length', 'actionType'] as const) {
    if (existing[field] !== undefined && incoming[field] !== undefined && existing[field] !== incoming[field]) throw new Error(`マニフェスト属性矛盾: ${field}`)
  }
  if (rc21Extension) {
    existing.allowNewModel = incoming.allowNewModel
    existing.requireWeight = incoming.requireWeight
    existing.category = incoming.category
    existing.productVerified = incoming.productVerified
  }
  existing.revisions.push(...incoming.revisions)
  for (const field of ['manufacturerAliases', 'seriesAliases', 'modelAliases'] as const) existing[field] = union(existing[field], incoming[field])
  for (const color of incoming.colors) {
    const found = existing.colors.find(c => colorKey(c) === colorKey(color))
    if (!found) { existing.colors.push(color); continue }
    if (identity(found.name) !== identity(color.name) || found.jan && color.jan && found.jan !== color.jan) throw new Error(`マニフェストカラー矛盾: ${incoming.model}/${color.code}`)
    const sources = [...found.sources, ...color.sources], aliases = union([...found.aliases, found.label], color.aliases)
    // RC20 supplies the official RC19 label; RC33 enriches the PALMS entry without changing its spelling/rule.
    if (rc19Extension) Object.assign(found, color)
    if (rc33Enrichment) Object.assign(found, { purchase: color.purchase, appearance: color.appearance, imageUrl: color.imageUrl })
    found.sources = sources; found.aliases = aliases
  }
}

export function validateLureMasterManifest(manifest: MasterManifest): void {
  const targets = new Set<string>()
  for (const t of manifest.targets) {
    if (t.key !== targetKey(t)) throw new Error(`モデルキーが親階層と一致しません: ${t.key}`)
    if (targets.has(t.key)) throw new Error(`モデル重複: ${t.key}`)
    targets.add(t.key)
    const colors = new Set<string>()
    for (const c of t.colors) {
      const key = colorKey(c)
      if (colors.has(key)) throw new Error(`カラー重複: ${t.model}/${c.label}`)
      colors.add(key)
    }
  }
}

function buildManifest(): MasterManifest {
  const hunt = rc20Catalog[0]!
  const rc19: InputTarget = { ...hunt, colors: [
    { code: 'T-15', name: 'シルバー', label: 'T-15 シルバー（SILVER）', aliases: ['シルバー', 'silver'] },
    { code: 'T-18', name: '黄茶次郎', label: 'T-18 黄茶次郎（KICYAJIRO）', aliases: ['黄茶次郎', 'kicyajiro'] },
  ] }
  const packs: [CatalogRevision, readonly InputTarget[]][] = [
    ['RC19', [rc19]], ['RC20', rc20Catalog], ['RC21', rc21Catalog], ['RC22', rc22Catalog],
    ['RC28', rc28Catalog], ['RC30', rc30Catalog], ['RC31', rc31Catalog], ['RC33', rc33Catalog],
  ]
  const targets = new Map<string, MasterTarget>()
  for (const [revision, pack] of packs) for (const input of pack) {
    const target = adapt(input, revision), existing = targets.get(target.key)
    if (existing) merge(existing, target)
    else targets.set(target.key, target)
  }
  const manifest: MasterManifest = { masterVersion: 'RC34-phase1', matchingVersion: 1, targets: [...targets.values()],
    pending: [...rc28Pending.map(detail => ({ revision: 'RC28' as const, detail: structuredClone(detail) })),
      ...rc30Pending.map(detail => ({ revision: 'RC30' as const, detail: structuredClone(detail) }))] }
  validateLureMasterManifest(manifest)
  return manifest
}

// No initialization writes or network requests. RC23–27/29/32 add no catalog pack; their history/docs remain intact.
export const lureMasterManifest = buildManifest()
