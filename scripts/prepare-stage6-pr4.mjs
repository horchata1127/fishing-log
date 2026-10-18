// Read-only source audit. Outputs live under docs, outside Vite's runtime graph/public assets.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const notes = process.argv[2]
if (!notes) throw new Error('Usage: node scripts/prepare-stage6-pr4.mjs <notes-directory>')
const names = ['Fishing_Log_Stage6_施設マスター_50施設_精度改善ドラフト_v0.9.json', 'FishingLog_Stage6_50facilities_73zones_draft.json']
const bytes = await Promise.all(names.map(name => readFile(join(notes, name))))
const [original, draft] = bytes.map(b => JSON.parse(b.toString('utf8')))
const clone = value => JSON.parse(JSON.stringify(value))
const expected = clone(original)
const iwana = draft.facilities.find(f => f.id === 'official:nihon-iwana-center')
if (!iwana || iwana.zones.length !== 9) throw new Error('Expected nine Iwana zones')
expected.masterVersion = draft.masterVersion
expected.notes = draft.notes
expected.distributionMode = draft.distributionMode
expected.facilities.find(f => f.id === iwana.id).zones = clone(iwana.zones)
expected.facilities.find(f => f.id === iwana.id).verificationBasis = iwana.verificationBasis
if (JSON.stringify(expected) !== JSON.stringify(draft)) throw new Error('Unexpected source differences; stop for review')
if (original.facilities.length !== 50 || original.facilities.flatMap(f => f.zones).length !== 64) throw new Error('Unexpected original counts')
if (draft.distributionMode !== 'opt_in_import_draft' || draft.releaseOrder !== 9) throw new Error('Unexpected draft release metadata')
const facilityKeys = ['id', 'name', 'prefecture', 'address', 'facilityTypes', 'lureAllowed', 'operationStatus', 'officialUrl', 'sourceUrl', 'verifiedAt', 'aliases', 'zones']
const zoneKeys = ['id', 'name', 'sortOrder', 'sourceUrl']
const pick = (row, keys) => Object.fromEntries(keys.map(k => [k, clone(row[k])]))
const candidate = { schemaVersion: 1, masterVersion: '1.0.0-stage6-50f73z', distributionMode: 'full', releaseOrder: 1,
  facilities: draft.facilities.map(f => ({ ...pick(f, facilityKeys), zones: f.zones.map(z => pick(z, zoneKeys)) })) }
const king = candidate.facilities.find(f => f.id === 'official:anglers-park-kingfisher')
const fifth = king?.zones.find(z => z.name.includes('5号池'))
if (!fifth || fifth.sortOrder !== 1) throw new Error('Unexpected Kingfisher source; review before changing')
fifth.sortOrder = 5
const ids = new Set(), namesSeen = new Set()
for (const f of candidate.facilities) {
  const name = f.name.normalize('NFC')
  if (namesSeen.has(name)) throw new Error('Duplicate facility name')
  namesSeen.add(name)
  const orders = new Set(), zoneNames = new Set()
  for (const z of f.zones) {
    if (orders.has(z.sortOrder) || zoneNames.has(z.name.normalize('NFC'))) throw new Error('Duplicate zone order/name')
    orders.add(z.sortOrder); zoneNames.add(z.name.normalize('NFC'))
  }
  for (const row of [f, ...f.zones]) {
    if (!row.id.startsWith('official:') || ids.has(row.id)) throw new Error('ID collision/namespace')
    ids.add(row.id)
  }
}
if (candidate.facilities.flatMap(f => f.zones).length !== 73) throw new Error('Unexpected zone count')
const counts = key => Object.fromEntries([...new Set(draft.facilities.map(f => f[key]))].map(k => [k, draft.facilities.filter(f => f[key] === k).length]))
const dir = 'docs/stage6-pr4'
await mkdir(dir, { recursive: true })
// Exclusive creation protects pre-existing/untracked review artifacts.
await writeFile(`${dir}/research-source.json`, bytes[1], { flag: 'wx' })
await writeFile(`${dir}/facility-master.candidate.json`, JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx' })
const audit = { approval: 'pending', proposedReleaseOrder: 1, proposedMasterVersion: candidate.masterVersion,
  candidateSha256: createHash('sha256').update(JSON.stringify(candidate, null, 2) + '\n').digest('hex'),
  sources: names.map((name, i) => ({ name, sha256: createHash('sha256').update(bytes[i]).digest('hex') })),
  original: { facilities: 50, zones: 64 }, candidate: { facilities: 50, zones: 73 },
  operationStatus: counts('operationStatus'), researchStatus: counts('researchStatus'), prefecture: counts('prefecture'),
  missingAddress: draft.facilities.filter(f => f.address === null).length,
  noZones: candidate.facilities.filter(f => !f.zones.length).length,
  iwana: iwana.zones, correction: { facilityId: king.id, zoneId: fifth.id, from: 1, to: 5 },
  facilities: candidate.facilities.map(f => ({ id: f.id, name: f.name, zones: f.zones.length })) }
await writeFile(`${dir}/audit.json`, JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(audit, null, 2))
