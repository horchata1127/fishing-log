import { db, tackleTableNames, validateTackleRecord,
  type CatchRecord, type FishingTrip, type TackleSet, type TackleSnapshot, type TackleTable } from '../db/database'

export const tackleTables = tackleTableNames.map(name => db.table(name))

export async function loadTackleData() {
  return db.transaction('r', tackleTables, async () => {
    const [rods, reels, lines, tackleSets] = await Promise.all([
      db.rods.toArray(), db.reels.toArray(), db.lines.toArray(), db.tackleSets.toArray(),
    ])
    return { rods, reels, lines, tackleSets }
  })
}

export async function saveTackle(table: TackleTable, value: unknown, recordId?: number): Promise<number> {
  validateTackleRecord(table, value)
  const row = { ...value }
  delete row.id
  delete row.initialKey // 候補の識別キーは既存レコードの値を保持する。
  return db.transaction('rw', tackleTables, async () => {
    const target = db.table(table)
    const existing = recordId === undefined ? undefined : await target.get(recordId)
    if (recordId !== undefined && !existing) throw new Error('編集対象がありません。')
    const references = table === 'reels' ? [['mainLineId', 'lines']]
      : table === 'tackleSets' ? [['rodId', 'rods'], ['reelId', 'reels'], ['leaderLineId', 'lines']] : []
    for (const [field, parent] of references) {
      if (!field || !parent || row[field] === undefined) continue
      const referenced = await db.table(parent).get(row[field] as number)
      if (!referenced) throw new Error(`${field}: 参照先がありません。`)
      // 既存の停止済み参照を保持した編集は許容。新規の停止済み選択は拒否。
      if (row.active && !referenced.active && existing?.[field] !== row[field]) throw new Error(`${field}: 使用停止中です。`)
    }
    const id = await target.put({ ...row, ...(existing?.initialKey ? { initialKey: existing.initialKey } : {}),
      ...(recordId === undefined ? {} : { id: recordId }) })
    if (typeof id !== 'number') throw new Error('タックルを保存できませんでした。')
    return id
  })
}

export async function setTackleActive(table: TackleTable, id: number, active: boolean) {
  return db.transaction('rw', db.table(table), async () => {
    if (!(await db.table(table).get(id))) throw new Error('対象がありません。')
    await db.table(table).update(id, { active })
  })
}

const initialCandidates = [
  { table: 'rods', key: 'rod-palms-qfrgs48xul', row: { manufacturer: 'Palms', modelName: 'クワトロ Universal IV', modelCode: 'QFRGS-48XUL', active: true } },
  { table: 'rods', key: 'rod-smith-trmk504ul', row: { manufacturer: 'SMITH', modelName: 'トラウティンスピン マルチュース', modelCode: 'TRMK-504UL', active: true } },
  ...['ヴァンキッシュ', 'カーディフ', 'ヴァンフォード'].map(modelName => ({ table: 'reels', key: `reel-shimano-${modelName}`, row: { manufacturer: 'SHIMANO', modelName, active: true } })),
  ...[3, 3.5, 4].map(strengthLb => ({ table: 'lines', key: `line-nylon-${strengthLb}`, row: { material: 'ナイロン', strengthLb, active: true } })),
] as const

/** 明示操作のみ。編集・使用停止後もinitialKeyで重複投入を防止する。 */
export async function registerInitialTackles() {
  return db.transaction('rw', tackleTables, async () => {
    let added = 0
    for (const candidate of initialCandidates) {
      const table = db.table(candidate.table)
      const rows = await table.toArray()
      const same = rows.find(row => row.initialKey === candidate.key || Object.entries(candidate.row)
        .filter(([field]) => field !== 'active').every(([field, value]) => row[field] === value))
      if (same) {
        if (!same.initialKey) await table.update(same.id, { initialKey: candidate.key })
      } else {
        await table.add({ ...candidate.row, initialKey: candidate.key })
        added++
      }
    }
    return added
  })
}

export async function availableTackleSets(trip?: FishingTrip) {
  const data = await loadTackleData()
  const allowed = trip ? new Set(trip.tackleSetIds ?? []) : undefined
  return data.tackleSets.filter(set => set.active && (!allowed || allowed.has(set.id!)) &&
    data.rods.some(rod => rod.id === set.rodId && rod.active) &&
    data.reels.some(reel => reel.id === set.reelId && reel.active &&
      (reel.mainLineId === undefined || data.lines.some(line => line.id === reel.mainLineId && line.active))) &&
    (set.leaderLineId === undefined || data.lines.some(line => line.id === set.leaderLineId && line.active)))
}

/** 呼び出し側のトランザクション内で構成を確定する。 */
export async function snapshotTackle(setId: number): Promise<TackleSnapshot> {
  if (!Number.isSafeInteger(setId) || setId <= 0) throw new Error('セットIDが不正です。')
  const set = await db.tackleSets.get(setId)
  const rod = set && await db.rods.get(set.rodId)
  const reel = set && await db.reels.get(set.reelId)
  const mainLine = reel?.mainLineId === undefined ? undefined : await db.lines.get(reel.mainLineId)
  const leader = set?.leaderLineId === undefined ? undefined : await db.lines.get(set.leaderLineId)
  if (!set?.active || !rod?.active || !reel?.active ||
      (reel.mainLineId !== undefined && !mainLine?.active) || (set.leaderLineId !== undefined && !leader?.active)) {
    throw new Error('セットまたは構成品が使用停止中か、参照先がありません。セットを選び直してください。')
  }
  return { version: 1, setId, setName: set.name, rod: { ...rod, id: set.rodId },
    reel: { ...reel, id: set.reelId },
    ...(mainLine ? { mainLine: { ...mainLine, id: reel.mainLineId! } } : {}),
    ...(leader ? { leader: { ...leader, id: set.leaderLineId! } } : {}) }
}

export async function createTrip(trip: FishingTrip): Promise<number> {
  return db.transaction('rw', [db.trips, ...tackleTables], async () => {
    await validateTripSets(trip.tackleSetIds ?? [])
    const id = await db.trips.add(trip)
    if (id === undefined) throw new Error('釣行を保存できませんでした。')
    return id
  })
}

async function validateTripSets(ids: number[]) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error('持参セットが重複しています。')
  for (const id of ids) await snapshotTackle(id)
}

export async function updateTripTackles(tripId: number, ids: number[]) {
  return db.transaction('rw', [db.trips, ...tackleTables], async () => {
    const trip = await db.trips.get(tripId)
    if (!trip || trip.endedAt) throw new Error('釣行が存在しないか終了しています。')
    await validateTripSets(ids)
    await db.trips.update(tripId, { tackleSetIds: [...ids] })
  })
}

/** 同じ釣行の直前の保存済み釣果から、現在も使用可能なセットだけを提案する。 */
export function suggestTackleSetId(catches: CatchRecord[], sets: TackleSet[]): number | undefined {
  const last = catches.reduce<CatchRecord | undefined>((latest, record) =>
    !latest || record.caughtAt >= latest.caughtAt ? record : latest, undefined)
  return last?.tackleSnapshot && sets.some(set => set.id === last.tackleSetId)
    ? last.tackleSetId : undefined
}
