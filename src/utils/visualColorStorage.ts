import { db, visualPalette, validateVisualAppearance, validateVisualRecord, validateVisualReferences,
  validateVisualSnapshot, type VisualAppearance, type VisualColorSnapshot, type VisualState,
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
