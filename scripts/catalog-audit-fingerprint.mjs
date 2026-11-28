import { createHash } from 'node:crypto'

export const sha256 = input => createHash('sha256').update(input).digest('hex')

const catalogTables = ['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants']

// Keep every field and array position. Only object key order and the export envelope are irrelevant.
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

export function catalogFingerprint(data) {
  const payload = catalogTables.map(table => {
    const rows = data?.[table]
    if (!Array.isArray(rows)) throw new Error('Missing catalog table: ' + table)
    return [table, rows]
  })
  return sha256(canonicalJson(payload))
}

export function assertReviewedCatalog(stats, rawHash, catalogHash, label) {
  const matches = stats.catalogSha256 ? stats.catalogSha256 === catalogHash : stats.backupSha256 === rawHash
  if (!matches) throw new Error(label + ' review catalog fingerprint mismatch')
}
