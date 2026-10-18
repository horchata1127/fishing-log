import { stage6Backup } from './stage6Fixture'

/** Synthetic old catch/lost data with deliberately absent actionLength and free-form actions. */
export function rc24Fixture() {
  const fixture = stage6Backup()
  const data: Record<string, Record<string, any>[]> = fixture.data
  const facilityId = 'official:nihon-iwana-center', zoneId = `${facilityId}:pond-9`
  data.trips!.push({ id: 90000, fishingAreaName: 'RC24旧記録', fishingDate: '2020-10-11', startedAt: '2020-10-11T00:00:00Z',
    fishingStyle: 'AREA_TROUT', facilityId, currentZoneId: zoneId })
  for (const [i, action] of ['ユーザー独自の旧アクション', 'ジャーク', '旧コピー専用'].entries()) {
    data.catches!.push({ id: 90000 + i, tripId: 90000, caughtAt: `2020-10-11T0${i + 1}:00:00Z`, action,
      ...(i === 1 ? { resultType: 'lost', lostDistance: 'near' } : {}), facilityId, zoneId,
      locationSnapshot: { facilityName: '保存時のイワセン名', zoneName: '保存時の9号池名' } })
  }
  return { ...fixture, data }
}
