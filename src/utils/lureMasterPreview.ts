import { db } from '../db/database'
import { planLureMaster, type LureMasterOptions } from './lureMasterPlanner'

export const lureMasterSnapshotTables = ['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures', 'lureVisualProfiles'] as const
/** Caller provides a transaction when it needs a consistent read or read/write snapshot. */
export async function readLureMasterSnapshot(database = db) {
  const [lureManufacturers, lureSeries, lureModels, lureVariants, myLures, lureVisualProfiles] = await Promise.all([
    database.lureManufacturers.toArray(), database.lureSeries.toArray(), database.lureModels.toArray(), database.lureVariants.toArray(),
    database.myLures.toArray(), database.lureVisualProfiles.toArray(),
  ])
  return { lureManufacturers, lureSeries, lureModels, lureVariants, myLures, lureVisualProfiles }
}

/** Explicit read-only transaction; no seed, apply, restore, ownership or dictionary writes. */
export async function previewLureMaster(options: LureMasterOptions = {}) {
  return db.transaction('r', lureMasterSnapshotTables.map(name => db.table(name)), async () => planLureMaster(await readLureMasterSnapshot(), options))
}
