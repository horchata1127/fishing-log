/** Synthetic acceptance data. No user backup is read or modified. */
export function rc30Fixture() {
  return { format: 'fishing-log-backup', version: 7, exportedAt: '2026-10-25T00:00:00Z', data: {
    lureManufacturers: [{ id: 7, name: 'RODIO CRAFT' }],
    lureSeries: [{ id: 82, manufacturerId: 7, name: 'USSA' }],
    lureModels: [{ id: 144, seriesId: 82, name: 'USSA', category: 'クランク' }],
    lureVariants: [{ id: 386, modelId: 144, colorName: 'ハラオリ' }],
    myLures: [{ id: 1, variantId: 386, active: true, ownershipStatus: 'owned', quantity: 2 }],
    trips: [{ id: 13, fishingAreaName: '白馬八方ニレ池フィッシングセンター（合成テスト）', fishingDate: '2026-10-24', fishingStyle: 'AREA_TROUT',
      startedAt: '2026-10-23T23:00:00Z', endedAt: '2026-10-24T06:00:00Z', facilityId: 'user:rc30' }],
    catches: [{ id: 1, tripId: 13, caughtAt: '2026-10-24T01:36:00Z', lureName: 'USSA', lureColor: 'クロまんじゅう', lureId: 1, lureVariantId: 386 },
      { id: 2, tripId: 13, caughtAt: '2026-10-24T02:48:00Z', lureName: 'USSA', lureColor: 'クリアシルバー', resultType: 'lost', lostDistance: 'near' }],
    tripEvents: [], rods: [], reels: [], lines: [], tackleSets: [], fishSpecies: [],
    facilities: [{ id: 'user:rc30', origin: 'user', name: '合成ニレ池' }],
    zones: [{ id: 'user:rc30-zone', origin: 'user', facilityId: 'user:rc30', name: '合成エリア' }], appMetadata: [],
    tripWeatherLocations: [{ tripId: 13, latitude: 36.7, longitude: 137.8, locationSource: 'manual', coordinateSystem: 'WGS84', facilityName: '合成テスト地点', updatedAt: '2026-10-24T00:00:00.000Z' }], tripWeatherHours: [], tripWeatherRequests: [],
  } }
}
