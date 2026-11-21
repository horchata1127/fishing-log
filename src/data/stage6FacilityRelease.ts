import type { FacilityMasterV1 } from '../utils/facilityMaster'
import master from './facility-master.rc44.json' with { type: 'json' }

export type FacilityRelease =
  | { status: 'pending' }
  | { status: 'approved'; master: FacilityMasterV1 }

// RC44 cumulative full snapshot: unchanged initial 50/73 plus Okutama 1/5, releaseOrder 2.
// The historical v1 file stays frozen; the existing transaction validates this release.
export const stage6FacilityRelease: FacilityRelease = { status: 'approved', master: master as FacilityMasterV1 }
