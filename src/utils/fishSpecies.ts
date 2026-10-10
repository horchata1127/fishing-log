import { db, validateFishSpecies, type FishSpecies, type CatchRecord } from '../db/database'
import { initialFishMaster } from '../data/fishMaster'

export const initialFishSpecies: FishSpecies[] = initialFishMaster.map(row => ({ ...row, active: true, origin: 'reviewed' }))
export const rainbowFishId = initialFishSpecies.find(row => row.group === 'ニジマス')!.fish_id
export function defaultFishSpeciesId(choices: FishSpecies[]) {
  return choices.some(row => row.fish_id === rainbowFishId && row.active) ? rainbowFishId : undefined
}

/** 起動時には呼ばない。既存ID・名称・編集・非表示を保持して不足分だけ追加。 */
export async function registerInitialFishSpecies() {
  return db.transaction('rw', db.fishSpecies, async () => {
    const rows = await db.fishSpecies.toArray()
    const ids = new Set(rows.map(row => row.fish_id))
    const names = new Set(rows.map(row => row.display_name.trim().toLocaleLowerCase('ja-JP')))
    let added = 0
    for (const row of initialFishSpecies) {
      if (ids.has(row.fish_id) || names.has(row.display_name.trim().toLocaleLowerCase('ja-JP'))) continue
      await db.fishSpecies.add(row)
      ids.add(row.fish_id)
      names.add(row.display_name.trim().toLocaleLowerCase('ja-JP'))
      added++
    }
    return added
  })
}

/** 未登録初期候補はメモリ上で提示。非表示・編集済みのIDは再生成しない。 */
export async function loadFishChoices() {
  const rows = await db.fishSpecies.toArray()
  const ids = new Set(rows.map(row => row.fish_id))
  const names = new Set(rows.map(row => row.display_name.trim().toLocaleLowerCase('ja-JP')))
  return [...rows, ...initialFishSpecies.filter(row => !ids.has(row.fish_id) && !names.has(row.display_name.trim().toLocaleLowerCase('ja-JP')))]
    .filter(row => row.active)
}

export async function saveFishSpecies(value: unknown, existingId?: string) {
  validateFishSpecies(value)
  return db.transaction('rw', db.fishSpecies, async () => {
    const existing = existingId === undefined ? undefined : await db.fishSpecies.get(existingId)
    if (existingId !== undefined && !existing) throw new Error('編集対象の魚種がありません。')
    const rows = await db.fishSpecies.toArray()
    const name = value.display_name.trim().toLocaleLowerCase('ja-JP')
    if (rows.some(row => row.fish_id !== existingId && row.display_name.trim().toLocaleLowerCase('ja-JP') === name) ||
        initialFishSpecies.some(row => row.fish_id !== existingId && row.display_name.trim().toLocaleLowerCase('ja-JP') === name && !rows.some(saved => saved.fish_id === row.fish_id))) {
      throw new Error('同じ名前の魚種が既に存在します。')
    }
    const fish_id = existing?.fish_id ?? `user:${crypto.randomUUID()}`
    await db.fishSpecies.put({ ...value, fish_id, origin: existing?.origin ?? 'user', userEdited: true })
    return fish_id
  })
}
export async function setFishSpeciesActive(id: string, active: boolean) {
  if (!(await db.fishSpecies.get(id))) throw new Error('魚種がありません。')
  await db.fishSpecies.update(id, { active, userEdited: true })
}

/** 釣果保存トランザクション内で呼ぶ。保存時だけ不足する初期マスターを登録する。 */
export async function fishSnapshot(id: string | undefined, previous?: CatchRecord) {
  if (id === undefined) return {}
  if (typeof id !== 'string' || !id.trim()) throw new Error('魚種IDが不正です。')
  let row = await db.fishSpecies.get(id)
  if (!row && initialFishSpecies.some(row => row.fish_id === id)) {
    await registerInitialFishSpecies()
    row = await db.fishSpecies.get(id)
  }
  if (!row || (!row.active && !previous)) throw new Error('魚種が存在しないか非表示です。選び直してください。')
  if (previous) return { fishSpeciesId: id, fishSpecies: previous.fishSpecies, fishSpeciesGroup: previous.fishSpeciesGroup }
  return { fishSpeciesId: id, fishSpecies: row.display_name, fishSpeciesGroup: row.group }
}

