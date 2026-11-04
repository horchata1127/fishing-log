import { timelineScenario } from './timelineFixture'
import { weatherTripId } from './weatherFixture'

/** Synthetic export-only events, never an assertion about the real reference trip. */
export function rc39Fixture(dense = false) {
  const backup = timelineScenario(true)
  backup.data.lureVisualProfiles = []
  backup.data.temporaryLureColors = []
  backup.data.lureMasterImportHistory = []
  const trip = backup.data.trips!.find(t => t.id === weatherTripId)!
  trip.fishingAreaName = '合成タイムライン検証・多摩湖駅前フィッシングエリア'
  trip.fishingDate = '2026-10-17'
  trip.memo = '放流の前後と風の変化を確認。\n日陰になってから反応が変わった。'
  backup.data.catches!.push({ id: 98000, tripId: weatherTripId, caughtAt: '2026-10-17T01:13:00Z', resultType: 'lost', lostDistance: 'near' })
  backup.data.tripEvents!.push(
    { id: 98001, tripId: weatherTripId, type: 'stocking', occurredAt: '2026-10-17T00:00:00Z', note: '合成放流・ニジマス' },
    { id: 98002, tripId: weatherTripId, type: 'pellet', occurredAt: '2026-10-17T00:30:00Z', timePrecision: 'approximate', note: '合成ペレット散布' },
    { id: 98003, tripId: weatherTripId, type: 'weather', occurredAt: '2026-10-17T01:30:00Z', weatherObservation: { source: 'observed', sky: 'cloudy', wind: 'strong', changes: ['windStronger', 'sunHidden'], note: '合成記録・風が強まり、足元に波が寄ってきた。' } },
  )
  if (dense) {
    trip.fishingAreaName = '長い釣り場名・日本語の折り返しと大量記録を確認する合成釣行'.repeat(3)
    trip.endedAt = '2026-10-20T06:25:00Z'
    for (let i = 0; i < 28; i++) backup.data.catches!.push({ id: 99000 + i, tripId: weatherTripId, caughtAt: '2026-10-17T01:00:00Z' })
    backup.data.tripEvents!.push(
      { id: 98004, tripId: weatherTripId, type: 'pellet', occurredAt: '2026-10-17T00:00:00Z', timePrecision: 'unknown', note: '時刻不明の合成記録' },
      { id: 98005, tripId: weatherTripId, type: 'weather', occurredAt: '2026-10-22T01:00:00Z', note: '範囲外の合成記録', weatherObservation: { source: 'observed', sky: 'sunny', changes: [] } },
    )
  }
  return { ...backup, version: 10 }
}
