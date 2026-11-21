import { readFileSync } from 'node:fs'
import type { MasterManifest } from '../src/data/lureMasterManifest'

export const rc42Audit = JSON.parse(readFileSync('docs/rc42/RC42_OFFICIAL_AUDIT.json', 'utf8'))

/** Public catalog extract with synthetic ownership/history; never includes private trips. */
export function rc42Fixture() {
  return { format: 'fishing-log-backup', version: 11, exportedAt: '2026-11-21T00:00:00.000Z', data: {
    lureManufacturers: [rc42Audit.models[0].existingManufacturer],
    lureSeries: [rc42Audit.models[0].existingSeries],
    lureModels: rc42Audit.models.map((m: any) => m.existingModel),
    lureVariants: rc42Audit.models.flatMap((m: any) => m.colors.flatMap((c: any) => c.existing)),
    myLures: [{ id: 1, variantId: 1254, active: true, ownershipStatus: 'owned' }],
    trips: [{ id: 1, fishingAreaName: '合成RC42検証', fishingDate: '2026-11-21', startedAt: '2026-11-21T00:00:00.000Z' }],
    catches: [{ id: 1, tripId: 1, caughtAt: '2026-11-21T01:00:00.000Z', lureId: 1, lureVariantId: 1254,
      lureName: '記録時のモデル名称', lureColor: '記録時のカラー名称' }],
    tripEvents: [], rods: [], reels: [], lines: [], tackleSets: [], fishSpecies: [], facilities: [], zones: [], appMetadata: [],
    tripWeatherLocations: [], tripWeatherHours: [], tripWeatherRequests: [],
    lureVisualProfiles: [], temporaryLureColors: [], lureMasterImportHistory: [],
  } }
}

/** Test-only catalog projection. No RC42 pack is shipped because every official color already exists.
 * RC20 is the existing add-only protocol used to exercise hypothetical missing-color recovery. */
export function rc42ComparisonManifest(): MasterManifest {
  return { masterVersion: 'test-only-rc42-official-comparison', matchingVersion: 1, pending: [],
    targets: rc42Audit.models.map((m: any) => ({
      key: JSON.stringify(['DAIWA', 'PRESSO DOUBLE CLUTCH F', m.existingModel.name].map(s => s.normalize('NFKC').toLowerCase().replace(/\s/g, ''))),
      manufacturer: 'DAIWA', manufacturerAliases: ['ダイワ'], series: 'PRESSO DOUBLE CLUTCH F', seriesAliases: [],
      model: m.existingModel.name, modelAliases: [], category: 'ミノー', actionType: undefined,
      weight: m.existingModel.weightG, length: m.existingModel.lengthMm, rule: 'legacy', revisions: ['RC20'],
      allowNewManufacturer: false, allowNewModel: false, requireWeight: false, sourceUrl: m.sourceUrl,
      productVerified: true, holdReason: '',
      colors: m.colors.map((c: any) => ({ name: c.name, label: c.name, code: '',
        aliases: [c.name.replace(/RG$/, 'レッドグロー'), c.name.replace(/レッドグロー$/, 'RG')],
        colorClass: '', jan: c.jan, sourceUrl: m.sourceUrl, sourceTier: 'manufacturer', manufacturerUrl: m.sourceUrl,
        retailerUrl: '', verified: true, holdReason: '', purchase: 0,
        sources: [{ revision: 'RC20', color: { name: c.name, code: '' } }],
      })),
    })),
  }
}
