import { readFileSync } from 'node:fs'

/** Catalog-only audit extract plus synthetic fishing records. No private trip backup required. */
export function rc37Fixture() {
  const audit = JSON.parse(readFileSync('docs/moca-catalog/MOCA_CATALOG_DIFF.json', 'utf8')).existing
  return { format: 'fishing-log-backup', version: 11, exportedAt: '2026-11-03T12:00:00.000Z', data: {
    lureManufacturers: audit.manufacturers, lureSeries: audit.series, lureModels: audit.models,
    lureVariants: audit.variants, myLures: audit.owned, lureVisualProfiles: audit.visualProfiles,
    temporaryLureColors: [], lureMasterImportHistory: [],
    trips: [{ id: 1, fishingAreaName: '合成モカ検証', fishingDate: '2026-11-03', startedAt: '2026-11-03T00:00:00.000Z',
      summaryMvp: { name: 'MOCA DR-Fラトル', color: 'ミルクココア（暫定）', provisional: true } }],
    catches: [{ id: 1, tripId: 1, caughtAt: '2026-11-03T01:00:00.000Z', lureId: 8623, lureVariantId: 318,
      lureName: '記録時のモカ名称', lureColor: '記録時のカラー名称' }],
    tripEvents: [], rods: [], reels: [], lines: [], tackleSets: [], fishSpecies: [], facilities: [], zones: [], appMetadata: [],
    tripWeatherLocations: [], tripWeatherHours: [], tripWeatherRequests: [],
  } }
}
