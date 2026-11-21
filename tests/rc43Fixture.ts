import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { visualIdentityForVariant, visualNaturalKey } from '../src/db/database'

export const rc43Catalog = JSON.parse(readFileSync('docs/rc43/NOA_CATALOG.json', 'utf8'))
export function rc43Fixture() {
  const gold = rc43Catalog.variants.find((v: any) => v.modelId === 134 && v.colorName === 'ゴールド')
  const model = rc43Catalog.models.find((m: any) => m.id === gold.modelId), parent = rc43Catalog.series.find((s: any) => s.id === model.seriesId)
  const identity = visualIdentityForVariant(gold, model, parent, rc43Catalog.manufacturers[0])
  const profile = { id: '43000000-0000-4000-8000-000000000001', variantId: gold.id, identity, naturalKey: visualNaturalKey(identity),
    appearance: { version: 1, paletteVersion: 1, layout: 'spoon', regions: { front: { colors: ['gold'], attributes: ['metallic'] }, back: { colors: ['white'], attributes: [] } } },
    origin: 'user', userEdited: true, confirmed: true, revision: 7, updatedAt: '2026-11-21T00:00:00.000Z' }
  return { format: 'fishing-log-backup', version: 10, exportedAt: '2026-11-21T00:00:00.000Z', data: {
    lureManufacturers: structuredClone(rc43Catalog.manufacturers), lureSeries: structuredClone(rc43Catalog.series),
    lureModels: structuredClone(rc43Catalog.models), lureVariants: structuredClone(rc43Catalog.variants),
    myLures: [{ id: 1, variantId: gold.id, active: true, ownershipStatus: 'owned' }],
    trips: [{ id: 1, fishingAreaName: '合成NOA写真テスト', fishingDate: '2026-11-21', startedAt: '2026-11-21T00:00:00.000Z' }],
    catches: [{ id: 1, tripId: 1, caughtAt: '2026-11-21T01:00:00.000Z', lureId: 1, lureVariantId: gold.id, lureName: '記録時のNOA名', lureColor: '記録時の金色' }],
    tripEvents: [], rods: [], reels: [], lines: [], tackleSets: [], fishSpecies: [], facilities: [], zones: [], appMetadata: [],
    tripWeatherLocations: [], tripWeatherHours: [], tripWeatherRequests: [], lureVisualProfiles: [profile], temporaryLureColors: [], lureMasterImportHistory: [],
  } }
}
/** Synthetic image pixels for tests only; never represented as real lure photography. */
export function rc43TestPng(red = 210, green = 155, blue = 35) {
  function crc32(bytes: Buffer) {
    let value = 0xffffffff
    for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0) }
    return (value ^ 0xffffffff) >>> 0
  }
  function chunk(name: string, data: Buffer) {
    const label = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4)
    size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([label, data])))
    return Buffer.concat([size, label, data, crc])
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(24, 0); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 2
  const lines = Buffer.concat(Array.from({ length: 16 }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 24 }, () => [red, green, blue]).flat())])))
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(lines)), chunk('IEND', Buffer.alloc(0))])
}
