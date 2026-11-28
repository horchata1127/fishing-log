import { createHash } from 'node:crypto'

export const sha256 = input => createHash('sha256').update(input).digest('hex')

const catalogTables = ['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants']

// Keep every field and array position. Object key order carries no data.
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

export function backupFingerprints(raw, backup) {
  const { exportedAt, ...content } = backup
  return {
    backupSha256: sha256(raw),
    catalogSha256: catalogFingerprint(backup.data),
    backupContentSha256: sha256(canonicalJson(content)),
  }
}

export function assertReviewedCatalog(stats, fingerprints, label) {
  if (stats.catalogSha256 && stats.catalogSha256 !== fingerprints.catalogSha256) {
    throw new Error(label + ' review catalog fingerprint mismatch')
  }
  if (stats.backupContentSha256 && stats.backupContentSha256 !== fingerprints.backupContentSha256) {
    throw new Error(label + ' review backup content fingerprint mismatch')
  }
  if ((!stats.catalogSha256 || !stats.backupContentSha256) && stats.backupSha256 !== fingerprints.backupSha256) {
    throw new Error(label + ' review original file fingerprint mismatch')
  }
}
