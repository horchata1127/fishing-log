import type { FacilityMasterV1 } from '../utils/facilityMaster'
import master from './facility-master.v1.json' with { type: 'json' }

export type FacilityRelease =
  | { status: 'pending' }
  | { status: 'approved'; master: FacilityMasterV1 }

// User-approved initial 50-facility/73-zone snapshot, releaseOrder 1.
// PR1 validates this JSON at the existing transactional apply boundary.
export const stage6FacilityRelease: FacilityRelease = { status: 'approved', master: master as FacilityMasterV1 }
