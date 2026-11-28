import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertReviewedCatalog, backupFingerprints, catalogFingerprint } from '../scripts/catalog-audit-fingerprint.mjs'

const data = {
  lureManufacturers: [{ id: 1, name: 'Maker' }],
  lureSeries: [{ id: 2, manufacturerId: 1, name: 'Series' }],
  lureModels: [{ id: 3, seriesId: 2, name: 'Model', weightG: 1.8 }],
  lureVariants: [{ id: 4, modelId: 3, colorName: 'Color', catalogEvidence: { colorCode: '01', sourceTier: 'manufacturer' } }],
}
const fingerprints = backup => backupFingerprints(JSON.stringify(backup), backup)

test('catalog review accepts an export timestamp or JSON property order change', () => {
  const original = fingerprints({ exportedAt: '2026-11-23', data })
  const latest = fingerprints({ exportedAt: '2026-11-28', data: {
    ...data, lureManufacturers: [{ name: 'Maker', id: 1 }],
  } })
  assert.notEqual(original.backupSha256, latest.backupSha256)
  assert.doesNotThrow(() => assertReviewedCatalog(original, latest, 'Test'))
})

test('catalog review rejects changed IDs, specifications, provenance and missing tables', () => {
  const original = fingerprints({ data })
  for (const changed of [
    { ...data, lureManufacturers: [{ id: 5, name: 'Maker' }] },
    { ...data, lureModels: [{ ...data.lureModels[0], weightG: 1.4 }] },
    { ...data, lureVariants: [{ ...data.lureVariants[0], catalogEvidence: { colorCode: '02', sourceTier: 'manufacturer' } }] },
  ]) {
    assert.throws(() => assertReviewedCatalog(original, fingerprints({ data: changed }), 'Test'), /catalog fingerprint mismatch/)
  }
  assert.throws(() => catalogFingerprint({ ...data, lureVariants: undefined }), /Missing catalog table/)
})

test('review also detects changes to an otherwise identical backup outside the catalog', () => {
  const original = fingerprints({ version: 12, data: { ...data, myLures: [] } })
  const changed = fingerprints({ version: 12, data: { ...data, myLures: [{ id: 1, variantId: 4 }] } })
  assert.equal(original.catalogSha256, changed.catalogSha256)
  assert.throws(() => assertReviewedCatalog(original, changed, 'Test'), /backup content fingerprint mismatch/)
})

test('legacy reviews without a catalog fingerprint still require the exact original file', () => {
  assert.doesNotThrow(() => assertReviewedCatalog({ backupSha256: 'original' }, { backupSha256: 'original' }, 'Test'))
  assert.throws(() => assertReviewedCatalog({ backupSha256: 'original' }, { backupSha256: 'other' }, 'Test'), /mismatch/)
})
