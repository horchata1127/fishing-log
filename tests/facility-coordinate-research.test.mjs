import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readResearch, validateCoordinateResearch, renderAuditCsv, renderAuditMarkdown } from '../scripts/facility-coordinate-audit.mjs'

const research = readResearch()
const clone = () => ({ ...structuredClone({ candidate: research.candidate, evidence: research.evidence }), masterBytes: research.masterBytes })
test('coordinate research covers all 50 stable identities and separates address geocodes from facility points', () => {
  assert.deepEqual(validateCoordinateResearch(research), [])
  assert.equal(createHash('sha256').update(research.masterBytes).digest('hex'), '30514d6674b413a70e9d830b4e5a4230bc83b13feb4e2f876daeadd67d33fb9c')
  assert.equal(research.evidence.facilities.filter(f => f.originalAddress === null && f.researchedAddress).length, 7)
})
test('priority facilities use corroborated named points instead of coarse address geocodes', () => {
  for (const [id, latitude, longitude] of [['official:nihon-iwana-center', 36.6107647, 139.1938799], ['official:nireike-hakuba', 36.7067947, 137.8430938]]) {
    const row = research.candidate.facilities.find(f => f.facilityId === id)
    assert.equal(row.latitude, latitude); assert.equal(row.longitude, longitude)
    const audit = research.evidence.facilities.find(f => f.facilityId === id)
    assert(audit.coordinateEvidence.filter(p => Math.abs(p.latitude - latitude) < .0005 && Math.abs(p.longitude - longitude) < .0005).length >= 2)
    assert(audit.distanceFromFirstGeocodeMeters > 100)
  }
})
test('conflicts and incomplete verification retain null coordinate pairs', () => {
  const held = research.candidate.facilities.filter(f => f.verificationStatus !== 'source_cross_checked')
  assert.equal(held.length, 7)
  for (const f of held) { assert.equal(f.latitude, null); assert.equal(f.longitude, null); assert.equal(f.pointType, null) }
  assert(held.some(f => f.facilityId === 'official:hirayako-fishing-spot'))
  assert(held.some(f => f.facilityId === 'official:tamako-ekimae'))
})
test('validator rejects accidental release, swapped axes, orphan IDs and unproven points', () => {
  const mutations = [
    r => { r.candidate.approvalStatus = 'approved' },
    r => { r.candidate.distributionEnabled = true },
    r => { const f = r.candidate.facilities[0]; [f.latitude, f.longitude] = [f.longitude, f.latitude] },
    r => { r.candidate.facilities[0].facilityId = 'unknown' },
    r => { r.candidate.facilities[0].latitude += .1 },
    r => { r.evidence.facilities[0].coordinateEvidence = [] },
    r => { r.evidence.facilities[0].originalAddress = 'overwritten' },
    r => { const f = r.candidate.facilities.find(f => f.latitude === null); f.latitude = 35 },
  ]
  for (const mutate of mutations) { const fixture = clone(); mutate(fixture); assert(validateCoordinateResearch(fixture).length > 0) }
})
test('review tables are deterministic and keep nulls and source URLs explicit', () => {
  assert.equal(readFileSync(new URL('../docs/rc25-pr1/AUDIT.csv', import.meta.url), 'utf8').replaceAll('\r\n', '\n'), renderAuditCsv(research.candidate))
  assert.equal(readFileSync(new URL('../docs/rc25-pr1/AUDIT.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n'), renderAuditMarkdown(research.candidate))
})
test('research candidate has no runtime import or public copy', () => {
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), path)
      if (entry.isDirectory()) walk(child)
      else {
        assert(!entry.name.includes('facility-coordinates'), child.href)
        if (/\.(ts|js|vue|json|html)$/.test(entry.name)) assert(!/rc25-pr1|facility-coordinates\.candidate|research-evidence\.json/.test(readFileSync(child, 'utf8')), child.href)
      }
    }
  }
  walk(new URL('../src/', import.meta.url)); walk(new URL('../public/', import.meta.url))
})
