import { stage6FacilityRelease, type FacilityRelease } from '../data/stage6FacilityRelease'
import { applyFacilityMaster } from './facilityStorage'

/** Pending releases perform no DB reads or writes. Approved full snapshots use PR2's transaction. */
export async function initializeFacilityRelease(release: FacilityRelease = stage6FacilityRelease): Promise<string | undefined> {
  if (release.status !== 'approved') return
  try {
    await applyFacilityMaster(release.master)
  } catch (error) {
    return `施設マスターを更新できませんでした。既存の記録は保持されています。${error instanceof Error ? error.message : String(error)}`
  }
}
