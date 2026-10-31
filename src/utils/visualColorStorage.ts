import { db, visualPalette, validateVisualAppearance, validateVisualRecord, validateVisualReferences,
  validateVisualSnapshot, type VisualAppearance, type VisualColorSnapshot, type VisualState,
  visualNaturalKey, visualIdentityForVariant, type VisualIdentity, type CatchRecord,
  type LureVisualProfile, type TemporaryLureColor } from '../db/database'

const catalogTables = [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants]

/** Read-only catalog snapshot; used inside the caller's transaction. */
async function catalog() {
  const [lureManufacturers, lureSeries, lureModels, lureVariants] = await Promise.all(catalogTables.map(t => t.toArray()))
  return { lureManufacturers, lureSeries, lureModels, lureVariants } as Parameters<typeof validateVisualReferences>[2]
}

/** Only visual stores are written. Automatic candidates cannot overwrite protected values. */
export async function saveVisualProfile(value: LureVisualProfile, expectedRevision?: number): Promise<'saved' | 'protected'> {
  const row = structuredClone(value)
  validateVisualRecord('lureVisualProfiles', row)
  return db.transaction('rw', [db.lureVisualProfiles, ...catalogTables], async () => {
    const previous = await db.lureVisualProfiles.get(row.id)
    if (previous && row.origin !== 'user' && (previous.userEdited || previous.confirmed)) return 'protected'
    if (previous && (previous.naturalKey !== row.naturalKey || expectedRevision !== previous.revision || row.revision !== previous.revision + 1) || !previous && (expectedRevision !== undefined || row.revision !== 1)) throw new Error('配色が変更されています。読み直してください。')
    validateVisualReferences([row], [], await catalog())
    await db.lureVisualProfiles.put(row)
    return 'saved'
  })
}

export async function saveTemporaryColor(value: TemporaryLureColor, expectedRevision?: number): Promise<void> {
  const row = structuredClone(value)
  validateVisualRecord('temporaryLureColors', row)
  return db.transaction('rw', [db.temporaryLureColors, ...catalogTables], async () => {
    const previous = await db.temporaryLureColors.get(row.id)
    if (previous && row.origin !== 'user' && (previous.userEdited || previous.confirmed)) throw new Error('ユーザー配色は自動更新できません。')
    if (previous && (expectedRevision !== previous.revision || row.revision !== previous.revision + 1) || !previous && (expectedRevision !== undefined || row.revision !== 1)) throw new Error('仮カラーが変更されています。読み直してください。')
    validateVisualReferences([], [row], await catalog())
    await db.temporaryLureColors.put(row)
  })
}

export function createVisualSnapshot(appearance: VisualAppearance, state: Pick<VisualState, 'origin' | 'confirmed'>): VisualColorSnapshot {
  validateVisualAppearance(appearance)
  const used = new Set(Object.values(appearance.regions).flatMap(r => r!.colors))
  const result: VisualColorSnapshot = { version: 1, appearance: structuredClone(appearance),
    colorValues: Object.fromEntries(visualPalette.filter(c => used.has(c[0])).map(c => [c[0], c[2]])),
    origin: state.origin, confirmed: state.confirmed }
  validateVisualSnapshot(result)
  return result
}

async function checkedTarget(variantId: number, identity: VisualIdentity) {
  const data = await catalog()
  validateVisualReferences([{ variantId, identity } as LureVisualProfile], [], data)
  const matches = data.lureVariants.filter(v => {
    const model = data.lureModels.find(m => m.id === v.modelId), series = model && data.lureSeries.find(s => s.id === model.seriesId)
    const manufacturer = series && data.lureManufacturers.find(m => m.id === series.manufacturerId)
    return model && series && manufacturer && visualNaturalKey(visualIdentityForVariant(v, model, series, manufacturer)) === visualNaturalKey(identity)
  })
  if (matches.length !== 1 || matches[0]!.id !== variantId) throw new Error('同じ自然キーの候補が複数あります。カタログを確認してください。')
}

/** Explicit human edit only. Existing protected values require an exact displayed revision. */
export async function saveRepresentative(variantId: number, identity: VisualIdentity, appearance: VisualAppearance,
  expected?: { id: string; revision: number }): Promise<void> {
  const savedIdentity = structuredClone(identity), savedAppearance = structuredClone(appearance)
  return db.transaction('rw', [db.lureVisualProfiles, ...catalogTables], async () => {
    await checkedTarget(variantId, savedIdentity)
    const naturalKey = visualNaturalKey(savedIdentity)
    const existing = await db.lureVisualProfiles.where('naturalKey').equals(naturalKey).first()
    if (existing ? !expected || expected.id !== existing.id || expected.revision !== existing.revision : expected !== undefined) throw new Error('代表配色が変更されています。候補を読み直してください。')
    await saveVisualProfile({ id: existing?.id ?? crypto.randomUUID(), variantId, identity: savedIdentity, naturalKey,
      appearance: savedAppearance, origin: 'user', userEdited: true, confirmed: true,
      revision: (existing?.revision ?? 0) + 1, updatedAt: new Date().toISOString() }, existing?.revision)
  })
}

/** Read validated profiles only; detached/stale references never become selectable automatically. */
export async function readVisualProfiles(): Promise<LureVisualProfile[]> {
  return db.transaction('r', [db.lureVisualProfiles, ...catalogTables], async () => {
    const data = await catalog(), profiles = await db.lureVisualProfiles.toArray()
    return profiles.filter(p => {
      if (p.variantId === undefined) return false
      try { validateVisualRecord('lureVisualProfiles', p); validateVisualReferences([p], [], data); return true }
      catch { return false }
    })
  })
}

/** Link a saved provisional catch. No ownership or historical appearance writes. */
export async function linkCatchAppearance(expected: CatchRecord, variantId: number, identity: VisualIdentity): Promise<void> {
  const original = structuredClone(expected), target = structuredClone(identity)
  return db.transaction('rw', [db.catches, db.temporaryLureColors, db.lureVisualProfiles, ...catalogTables], async () => {
    if (!original.id || !original.visualColorSnapshot) throw new Error('紐付ける仮配色がありません。')
    validateVisualSnapshot(original.visualColorSnapshot)
    const current = await db.catches.get(original.id)
    if (!current || JSON.stringify(current) !== JSON.stringify(original) || current.lureId !== undefined || current.lureVariantId !== undefined) throw new Error('釣果が変更されたか、既に公式カラーへ紐付いています。読み直してください。')
    await checkedTarget(variantId, target)
    const existing = await db.lureVisualProfiles.where('naturalKey').equals(visualNaturalKey(target)).first()
    if (!existing) await saveRepresentative(variantId, target, original.visualColorSnapshot.appearance)
    else if (existing.variantId === undefined) {
      // Explicit target choice may reconnect a detached profile, preserving its appearance and protection.
      validateVisualReferences([{ ...existing, variantId }], [], await catalog())
      await db.lureVisualProfiles.update(existing.id, { variantId, revision: existing.revision + 1, updatedAt: new Date().toISOString() })
    } else if (existing.variantId !== variantId) throw new Error('代表配色の参照が競合しています。')
    const variant = await db.lureVariants.get(variantId), model = variant && await db.lureModels.get(variant.modelId)
    const temporary: TemporaryLureColor = { id: crypto.randomUUID(), name: current.lureColor || '釣果の仮配色',
      appearance: structuredClone(original.visualColorSnapshot.appearance), linkedVariantId: variantId, linkedIdentity: target,
      origin: 'user', userEdited: true, confirmed: true, revision: 1, updatedAt: new Date().toISOString() }
    validateVisualRecord('temporaryLureColors', temporary)
    await db.temporaryLureColors.add(temporary)
    await db.catches.update(current.id!, { lureVariantId: variantId, lureName: model!.name, lureColor: variant!.colorName })
  })
}

/** Link a standalone provisional dictionary entry without touching catches or ownership. */
export async function linkTemporaryAppearance(expected: TemporaryLureColor, variantId: number, identity: VisualIdentity): Promise<void> {
  const original = structuredClone(expected), target = structuredClone(identity)
  return db.transaction('rw', [db.temporaryLureColors, db.lureVisualProfiles, ...catalogTables], async () => {
    const current = await db.temporaryLureColors.get(original.id)
    if (!current || JSON.stringify(current) !== JSON.stringify(original) || current.linkedVariantId !== undefined) throw new Error('仮カラーが変更されたか、既に紐付いています。読み直してください。')
    validateVisualRecord('temporaryLureColors', current)
    await checkedTarget(variantId, target)
    const existing = await db.lureVisualProfiles.where('naturalKey').equals(visualNaturalKey(target)).first()
    if (!existing) await saveRepresentative(variantId, target, current.appearance)
    else if (existing.variantId === undefined) {
      validateVisualReferences([{ ...existing, variantId }], [], await catalog())
      await db.lureVisualProfiles.update(existing.id, { variantId, revision: existing.revision + 1, updatedAt: new Date().toISOString() })
    } else if (existing.variantId !== variantId) throw new Error('代表配色の参照が競合しています。')
    const next = { ...current, linkedVariantId: variantId, linkedIdentity: target, revision: current.revision + 1, updatedAt: new Date().toISOString() }
    validateVisualRecord('temporaryLureColors', next)
    validateVisualReferences([], [next], await catalog())
    await db.temporaryLureColors.put(next)
  })
}
