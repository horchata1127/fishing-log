/** Synthetic RC19 state. Never reads a user's backup or browser profile. */
export function rc20Fixture() {
  const data: Record<string, Record<string, unknown>[]> = Object.fromEntries([
    'trips', 'catches', 'tripEvents', 'lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants',
    'myLures', 'rods', 'reels', 'lines', 'tackleSets',
  ].map(name => [name, []]))
  data.lureManufacturers = [{ id: 49, name: 'ニュードロワー' }, { id: 62, name: 'ベルベットアーツ' },
    { id: 1, name: '1089工房' }, { id: 71, name: 'ロブルアー' }]
  data.lureSeries = [{ id: 135, manufacturerId: 49, name: 'HUNT GRANDE' }, { id: 1, manufacturerId: 1, name: 'さかさにょろ' }]
  data.lureModels = [{ id: 305, seriesId: 135, name: 'HUNT GRANDE 1.3g', weightG: 1.3, category: 'スプーン' },
    { id: 1, seriesId: 1, name: 'さかさにょろ 35FS' }, { id: 2, seriesId: 1, name: 'さかさにょろ 60FS' }]
  data.lureVariants = [{ id: 1887, modelId: 305, colorName: 'T-15 シルバー（SILVER）' },
    { id: 1888, modelId: 305, colorName: 'T-18 黄茶次郎（KICYAJIRO）' }]
  data.myLures = [{ id: 3, variantId: 1887, active: true, ownershipStatus: 'owned' },
    { id: 4, variantId: 1888, active: true, ownershipStatus: 'owned' }]
  data.trips = [{ id: 10, fishingDate: '2026-10-11', fishingAreaName: '合成巾着田', fishingStyle: 'CHUBBING',
    startedAt: '2026-10-11T06:00:00+09:00', endedAt: '2026-10-11T08:00:00+09:00' }]
  data.catches = [11, 12, 13, 14].map((id, i) => ({ id, tripId: 10,
    caughtAt: `2026-10-11T06:${['12', '14', '48', '53'][i]}:00+09:00`,
    lureId: id === 14 ? 4 : 3, lureVariantId: id === 14 ? 1888 : 1887,
    lureName: 'HUNT GRANDE 1.3g', lureColor: id === 14 ? 'T-18 黄茶次郎（KICYAJIRO）' : 'T-15 シルバー（SILVER）', memo: '保持する履歴' }))
  return { format: 'fishing-log-backup', version: 4, exportedAt: '2026-10-12T00:00:00Z', data }
}
