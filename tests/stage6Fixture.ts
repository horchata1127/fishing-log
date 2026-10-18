import { readFileSync } from 'node:fs'
import { rc23Fixture } from './rc23Fixture'

// Review candidate is read by the test runner only, never served/imported by the app.
export const stage6Candidate = JSON.parse(readFileSync(new URL('../docs/stage6-pr4/facility-master.candidate.json', import.meta.url), 'utf8'))
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export function stage6Backup() {
  const backup = rc23Fixture()
  const facilities: any[] = [], zones: any[] = []
  for (const { zones: nested, ...facility } of stage6Candidate.facilities) {
    facilities.push({ ...facility, origin: 'official', catalogState: 'listed' })
    zones.push(...nested.map((z: any) => ({ ...z, facilityId: facility.id, origin: 'official', catalogState: 'listed' })))
  }
  facilities.push({ id: 'user:iwana', name: '日本イワナセンター', origin: 'user' })
  zones.push({ id: 'user:iwana:9', facilityId: 'user:iwana', name: '9号池', origin: 'user' })
  return { ...backup, version: 6, data: { ...backup.data, facilities, zones,
    appMetadata: [{ key: 'facilityMaster', releaseOrder: stage6Candidate.releaseOrder, masterVersion: stage6Candidate.masterVersion, canonicalContent: canonical(stage6Candidate) }] } }
}
