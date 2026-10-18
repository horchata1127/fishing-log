import type { FacilityMasterV1 } from '../utils/facilityMaster'

export type FacilityRelease =
  | { status: 'pending' }
  | { status: 'approved'; master: FacilityMasterV1 }

// Activation requires a reviewed source change after data AND release-number approval.
// Research files and review candidates must never be imported into this module while pending.
export const stage6FacilityRelease: FacilityRelease = { status: 'pending' }
