import { db } from '../db/database'
import { planLureMaster, type LureMasterOptions } from './lureMasterPlanner'

/** Explicit read-only transaction; no seed, apply, restore, ownership or dictionary writes. */
export async function previewLureMaster(options: LureMasterOptions = {}) {
  return db.transaction('r', [db.lureManufacturers, db.lureSeries, db.lureModels, db.lureVariants, db.myLures, db.lureVisualProfiles], async () => {
    const [lureManufacturers, lureSeries, lureModels, lureVariants, myLures, lureVisualProfiles] = await Promise.all([
      db.lureManufacturers.toArray(), db.lureSeries.toArray(), db.lureModels.toArray(), db.lureVariants.toArray(),
      db.myLures.toArray(), db.lureVisualProfiles.toArray(),
    ])
    return planLureMaster({ lureManufacturers, lureSeries, lureModels, lureVariants, myLures, lureVisualProfiles }, options)
  })
}
