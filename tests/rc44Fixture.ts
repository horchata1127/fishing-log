import { readFileSync } from 'node:fs'
import { rc43Fixture } from './rc43Fixture'
import { flattenFacilityMaster, canonicalizeFacilityMaster } from '../src/utils/facilityMaster'
import { initialFishSpecies } from '../src/utils/fishSpecies'

export const okutamaId = 'official:okutama-fishing-center'
export const okutamaZones = ['ルアー・フライ・テンカラ釣り場', 'ポンドエリア', '初級者エサ釣り場', '一般エサ釣り場', '釣り堀エリア']
// Public synthetic v10 data, with the same 51/75 field counts as the device backup.
// No private backup is read or copied by this fixture.
export function rc44Fixture() {
  const backup = rc43Fixture()
  const original = JSON.parse(readFileSync('src/data/facility-master.v1.json', 'utf8'))
  const flat = flattenFacilityMaster(original), canonical = canonicalizeFacilityMaster(original)
  if (!flat.ok || !canonical.ok) throw new Error('Invalid historical field master')
  const facilities = [...flat.value.facilities, { id: 'user:rc44', name: '合成ユーザー施設', origin: 'user', memo: '編集内容を維持' }]
  const zones = [...flat.value.zones, ...['a', 'b'].map(slug => ({ id: `user:rc44:${slug}`, facilityId: 'user:rc44', name: `合成${slug}`, origin: 'user' }))]
  return { ...backup, data: { ...backup.data, fishSpecies: structuredClone(initialFishSpecies), facilities, zones,
    appMetadata: [{ key: 'facilityMaster', releaseOrder: 1, masterVersion: original.masterVersion, canonicalContent: canonical.value }] } }
}
