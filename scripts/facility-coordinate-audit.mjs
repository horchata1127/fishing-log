import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const directory = new URL('../docs/rc25-pr1/', import.meta.url)
const masterUrl = new URL('../src/data/facility-master.v1.json', import.meta.url)
export function readResearch() {
  return {
    candidate: JSON.parse(readFileSync(new URL('facility-coordinates.candidate.json', directory), 'utf8')),
    evidence: JSON.parse(readFileSync(new URL('research-evidence.json', directory), 'utf8')),
    masterBytes: readFileSync(masterUrl),
  }
}

// Research only: this module neither imports application code nor opens IndexedDB.
export function validateCoordinateResearch({ candidate, evidence, masterBytes }) {
  const errors = []
  const check = (condition, message) => { if (!condition) errors.push(message) }
  const master = JSON.parse(masterBytes.toString())
  check(candidate.schemaVersion === 1 && candidate.coordinateSystem === 'WGS84', 'schema / datum')
  check(candidate.approvalStatus === 'pending' && candidate.distributionEnabled === false, 'research must stay pending')
  check(candidate.sourceMasterSha256 === createHash('sha256').update(masterBytes).digest('hex'), 'master hash')
  check(master.facilities.length === 50 && master.facilities.filter(f => f.address).length === 43, '50 / 43 / 7 baseline')
  check(candidate.facilities.length === 50 && evidence.facilities.length === 50, '50 research rows')
  check(new Set(candidate.facilities.map(f => f.facilityId)).size === 50, 'duplicate candidate ID')
  check(new Set(evidence.facilities.map(f => f.facilityId)).size === 50, 'duplicate evidence ID')
  const types = ['facility_representative', 'park_representative', 'campground_representative']
  for (const [index, original] of master.facilities.entries()) {
    const row = candidate.facilities[index]
    const audit = evidence.facilities.find(f => f.facilityId === original.id)
    if (!row || !audit) { errors.push(`missing row: ${original.id}`); continue }
    check(row.facilityId === original.id && row.name === original.name, `identity / order: ${original.id}`)
    check(audit.originalAddress === original.address, `original address: ${original.id}`)
    check(typeof row.address === 'string' && row.address.length > 0, `address: ${original.id}`)
    check(audit.geocoding.query === row.address && Array.isArray(audit.geocoding.results), `geocoding attempt: ${original.id}`)
    check(audit.geocoding.usableAsFacilityCoordinate === false, `geocode is not a facility pin: ${original.id}`)
    check(audit.officialResearchPages.length > 0 && audit.mapQuery.httpStatus === 200, `source attempts: ${original.id}`)
    check(row.checkedOn === candidate.researchDate && evidence.researchDate === candidate.researchDate, 'research date')
    check(row.sourceUrls.length >= 2 && row.sourceUrls.every(u => /^https?:\/\//.test(u) && !/[?&]key=/i.test(u)), `sources: ${original.id}`)
    check(typeof row.notes === 'string' && row.notes.length > 0, `notes: ${original.id}`)
    if (original.address === null) {
      check(row.address === audit.researchedAddress && row.sourceUrls.includes(audit.addressSourceUrl), `new address provenance: ${original.id}`)
      check(audit.officialResearchPages.some(p => p.url === audit.addressSourceUrl && p.httpStatus === 200), `official address source: ${original.id}`)
    } else check(row.address === original.address, `preserve master address: ${original.id}`)
    if (row.verificationStatus === 'source_cross_checked') {
      check(Number.isFinite(row.latitude) && row.latitude >= 30 && row.latitude <= 46, `latitude: ${original.id}`)
      check(Number.isFinite(row.longitude) && row.longitude >= 129 && row.longitude <= 146, `longitude: ${original.id}`)
      check(types.includes(row.pointType), `point type: ${original.id}`)
      const selection = audit.selection
      check(['map_feature_pin', 'map_place_url_pin', 'published_site_coordinates', 'official_map_q_pin', 'tourism_linked_map_pin'].includes(selection?.method), `pin method: ${original.id}`)
      check(selection && selection.latitude === row.latitude && selection.longitude === row.longitude && row.sourceUrls.includes(selection.sourceUrl), `selection: ${original.id}`)
      check(audit.coordinateEvidence.some(p => p.latitude === row.latitude && p.longitude === row.longitude && p.sourceUrl === selection?.sourceUrl && p.method === selection?.method), `coordinate evidence: ${original.id}`)
    } else {
      check(['unconfirmed', 'conflicting_sources'].includes(row.verificationStatus), `status: ${original.id}`)
      check(row.latitude === null && row.longitude === null && row.pointType === null && audit.selection === null, `unconfirmed must be null: ${original.id}`)
    }
  }
  return errors
}

export function renderAuditCsv(candidate) {
  const columns = ['facilityId', 'name', 'address', 'latitude', 'longitude', 'pointType', 'verificationStatus', 'sourceUrls', 'checkedOn', 'notes']
  const cell = value => `"${String(value === null ? 'null' : Array.isArray(value) ? value.join('\n') : value).replaceAll('"', '""')}"`
  return '\uFEFF' + [columns, ...candidate.facilities.map(row => columns.map(key => row[key]))].map(row => row.map(cell).join(',')).join('\n') + '\n'
}
export function renderAuditMarkdown(candidate) {
  const clean = text => String(text ?? 'null').replaceAll('|', '\\|').replaceAll('\n', ' ')
  const lines = [
    '# RC25 PR1 座標監査表', '',
    `${candidate.researchDate} 調査。全50施設。座標あり${candidate.facilities.filter(f => f.latitude !== null).length}施設、保留null ${candidate.facilities.filter(f => f.latitude === null).length}施設。承認・配布はpending。`, '',
    '「source_cross_checked」は公開資料の施設名・所在地・地点を照合した状態であり、現地確認・入口精度・正式採用の承認を意味しない。住所代表点の検索結果はresearch-evidence.jsonへ分離した。', '',
    '| facilityId | 施設名 | 住所 | 緯度 | 経度 | 地点種別 | 確認状態 | 根拠URL | 留意点 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...candidate.facilities.map(f => `| ${[f.facilityId, f.name, f.address, f.latitude, f.longitude, f.pointType, f.verificationStatus, f.sourceUrls.map((u, i) => `[根拠${i + 1}](${u})`).join(' / '), f.notes].map(clean).join(' | ')} |`), '',
  ]
  return lines.join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const research = readResearch()
  const errors = validateCoordinateResearch(research)
  if (errors.length) throw new Error(errors.join('\n'))
  for (const [name, contents] of [['AUDIT.csv', renderAuditCsv(research.candidate)], ['AUDIT.md', renderAuditMarkdown(research.candidate)]]) {
    const path = new URL(name, directory)
    if (process.argv.includes('--check')) {
      if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== contents) throw new Error(`outdated: ${name}`)
    } else writeFileSync(path, contents)
  }
  console.log('RC25 coordinate research: 50 identities, provenance, null policy and audit files valid')
}
