import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertReviewedCatalog, catalogFingerprint, sha256 } from '../scripts/catalog-audit-fingerprint.mjs'

const data = {
  lureManufacturers: [{ id: 1, name: 'Maker' }],
  lureSeries: [{ id: 2, manufacturerId: 1, name: 'Series' }],
  lureModels: [{ id: 3, seriesId: 2, name: 'Model', weightG: 1.8 }],
  lureVariants: [{ id: 4, modelId: 3, colorName: 'Color', catalogEvidence: { colorCode: '01', sourceTier: 'manufacturer' } }],
}

test('catalog review accepts an export timestamp or JSON property order change', () => {
  const original = JSON.stringify({ exportedAt: '2026-11-23', data })
  const latest = JSON.stringify({ exportedAt: '2026-11-28', data: {
    ...data, lureManufacturers: [{ name: 'Maker', id: 1 }],
  } })
  assert.notEqual(sha256(original), sha256(latest))
  assert.doesNotThrow(() => assertReviewedCatalog({
    backupSha256: sha256(original), catalogSha256: catalogFingerprint(data),
  }, sha256(latest), catalogFingerprint(JSON.parse(latest).data), 'Test'))
})

test('catalog review rejects changed IDs, specifications, provenance and missing tables', () => {
  const catalogSha256 = catalogFingerprint(data)
  for (const changed of [
    { ...data, lureManufacturers: [{ id: 5, name: 'Maker' }] },
    { ...data, lureModels: [{ ...data.lureModels[0], weightG: 1.4 }] },
    { ...data, lureVariants: [{ ...data.lureVariants[0], catalogEvidence: { colorCode: '02', sourceTier: 'manufacturer' } }] },
  ]) {
    assert.throws(() => assertReviewedCatalog({ catalogSha256 }, 'raw', catalogFingerprint(changed), 'Test'), /mismatch/)
  }
  assert.throws(() => catalogFingerprint({ ...data, lureVariants: undefined }), /Missing catalog table/)
})

test('legacy reviews without a catalog fingerprint still require the exact original file', () => {
  assert.doesNotThrow(() => assertReviewedCatalog({ backupSha256: 'original' }, 'original', 'catalog', 'Test'))
  assert.throws(() => assertReviewedCatalog({ backupSha256: 'original' }, 'other', 'catalog', 'Test'), /mismatch/)
})
