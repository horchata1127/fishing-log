/** Minimal synthetic data; no device backup or ownership/history copied. */
export function rc28Fixture() {
  return {
    format: 'fishing-log-backup', version: 7, exportedAt: '2020-01-01T00:00:00.000Z',
    data: {
      lureManufacturers: [{ id: 5, name: 'Lucky Craft' }, { id: 8, name: 'TIMON' }],
      lureSeries: [{ id: 103, manufacturerId: 5, name: 'Wah' }, { id: 44, manufacturerId: 8, name: 'REKUZE' }],
      lureModels: [{ id: 110, seriesId: 103, name: 'WAH 37HF', category: 'クランク', lengthMm: 37 },
        { id: 109, seriesId: 103, name: 'WAH 37F', weightG: 2.3, lengthMm: 37, category: 'クランク' },
        { id: 226, seriesId: 44, name: 'REKUZE', category: 'その他' }],
      lureVariants: [{ id: 9000, modelId: 109, colorName: '合成テスト色' }],
      myLures: [{ id: 90, variantId: 9000, active: true, ownershipStatus: 'owned' }],
      trips: [{ id: 80, fishingAreaName: '合成RC28テスト池', fishingDate: '2020-01-01', fishingStyle: 'AREA_TROUT', startedAt: '2020-01-01T00:00:00.000Z', endedAt: '2020-01-01T02:00:00.000Z' }],
      catches: [{ id: 70, tripId: 80, lureId: 90, lureVariantId: 9000, caughtAt: '2020-01-01T00:10:00.000Z', lureName: '合成テスト' }],
      tripEvents: [], rods: [], reels: [], lines: [], tackleSets: [], fishSpecies: [],
      facilities: [], zones: [], appMetadata: [],
      tripWeatherLocations: [{ tripId: 80, latitude: 35, longitude: 139, locationSource: 'manual', coordinateSystem: 'WGS84', facilityName: '合成テスト地点', updatedAt: '2020-01-01T00:00:00.000Z' }],
      tripWeatherHours: [], tripWeatherRequests: [],
    },
  }
}
