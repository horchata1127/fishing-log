import { rc30Fixture } from './rc30Fixture'

/** Synthetic v7 data with the supplied baseline counts; contains no user backup. */
export function rc31Fixture() {
  const backup = rc30Fixture()
  const d = backup.data
  for (let i = 0; i < 79; i++) d.lureManufacturers.push({ id: 1000 + i, name: `Synthetic manufacturer ${i}` })
  for (let i = 0; i < 151; i++) d.lureSeries.push({ id: 1000 + i, manufacturerId: 7, name: `Synthetic series ${i}` })
  for (let i = 0; i < 354; i++) d.lureModels.push({ id: 1000 + i, seriesId: 82, name: `Synthetic model ${i}`, category: 'クランク' })
  for (let i = 0; i < 2815; i++) d.lureVariants.push({ id: 1000 + i, modelId: 144, colorName: `Synthetic color ${i}` })
  for (let i = 0; i < 8; i++) d.myLures.push({ ...d.myLures[0]!, id: 1000 + i })
  for (let i = 0; i < 2; i++) d.trips.push({ ...d.trips[0]!, id: 1000 + i })
  for (let i = 0; i < 13; i++) d.catches.push({ ...d.catches[0]!, id: 1000 + i })
  return { ...backup, data: { ...d, tripEvents: [{ id: 1, tripId: 13, type: 'stocking',
    occurredAt: '2026-10-24T01:30:00.000Z', timePrecision: 'exact', note: 'Synthetic event' }] } }
}
