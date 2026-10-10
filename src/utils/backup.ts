import { db, tackleTableNames, validateTackleRecord } from '../db/database'

export const backupTableNames = [
  'trips', 'catches', 'tripEvents', 'lureManufacturers',
  'lureSeries', 'lureModels', 'lureVariants', 'myLures',
] as const

export const allBackupTableNames = [...backupTableNames, ...tackleTableNames] as const
type TableName = typeof allBackupTableNames[number]
type Row = Record<string, unknown>
type RestoredData = Record<typeof backupTableNames[number], Row[]> & Partial<Record<typeof tackleTableNames[number], Row[]>>

export interface FishingLogBackup {
  format: 'fishing-log-backup'
  version: 1 | 2 | 3 | 4
  exportedAt: string
  data: {
    trips: unknown[]
    catches: unknown[]
    tripEvents?: unknown[]
    lureManufacturers: unknown[]
    lureSeries: unknown[]
    lureModels: unknown[]
    lureVariants: unknown[]
    myLures: unknown[]
    rods?: unknown[]
    reels?: unknown[]
    lines?: unknown[]
    tackleSets?: unknown[]
  }
}

function fail(path: string, reason: string): never {
  throw new Error(`バックアップの ${path}: ${reason}`)
}

function object(value: unknown, path: string): Row {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'オブジェクトが必要です')
  }
  return value as Row
}

function id(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    fail(path, '正の整数IDが必要です')
  }
  return value
}

function string(value: unknown, path: string, required = false) {
  if (value === undefined && !required) return
  if (typeof value !== 'string' || (required && !value.trim())) fail(path, '文字列が必要です')
}

function calendarDate(value: unknown, path: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(path, 'YYYY-MM-DD形式の日付が必要です')
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(path, '存在しない日付です')
  }
}

function dateTime(value: unknown, path: string): Date {
  // JSON出力のISO日時のみ受け付け、null・数値・曖昧なローカル日時を拒否する。
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail(path, 'タイムゾーン付きISO日時が必要です')
  }
  calendarDate(value.slice(0, 10), path)
  const time = value.slice(11, 19).split(':').map(Number)
  if (time[0]! > 23 || time[1]! > 59 || time[2]! > 59) fail(path, '時刻が不正です')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) fail(path, '日時が不正です')
  return parsed
}

/** 書き込み前に全テーブルを検証し、入力を変更せずDateを復元する。 */
export function validateBackup(value: unknown): RestoredData {
  const backup = object(value, 'ルート')
  if (backup.format !== 'fishing-log-backup' || ![1, 2, 3, 4].includes(backup.version as number)) {
    fail('format/version', '対応するFishing Logバックアップではありません')
  }
  dateTime(backup.exportedAt, 'exportedAt')
  const source = object(backup.data, 'data')
  const data = {} as RestoredData
  const ids = {} as Record<TableName, Set<number>>

  for (const table of allBackupTableNames) {
    if ((tackleTableNames as readonly string[]).includes(table) && backup.version !== 4) {
      if (source[table] !== undefined) fail(`data.${table}`, 'タックルデータにはv4形式が必要です')
      ids[table] = new Set()
      continue
    }
    // v1にはイベントテーブルがない。v2の欠落は破損として拒否する。
    const entries = table === 'tripEvents' && backup.version === 1 && source[table] === undefined
      ? [] : source[table]
    if (!Array.isArray(entries)) fail(`data.${table}`, '配列が必要です')
    const seen = new Set<number>()
    data[table] = entries.map((entry, index) => {
      const path = `${table}[${index}]`
      const row = { ...object(entry, path) }
      const rowId = id(row.id, `${path}.id`)
      if (seen.has(rowId)) fail(`${path}.id`, `ID ${rowId} が重複しています`)
      seen.add(rowId)
      return row
    })
    ids[table] = seen
  }

  const reference = (row: Row, field: string, parent: TableName, path: string, optional = false) => {
    if (optional && row[field] === undefined) return
    const target = id(row[field], `${path}.${field}`)
    if (!ids[parent].has(target)) fail(`${path}.${field}`, `${parent} のID ${target} がありません`)
  }
  const styles = ['AREA_TROUT', 'CHUBBING', 'NATIVE_TROUT', 'BASS', 'OTHER']
  const categories = ['スプーン', 'クランク', 'ミノー', 'トップ', 'バイブレーション', 'その他']
  const manufacturerNames = new Set<string>()
  const ownedVariants = new Map(data.myLures.map(row => [row.id, row.variantId]))

  const snapshot = (value: unknown, setId: unknown, path: string) => {
    const saved = object(value, path)
    if (saved.version !== 1 || saved.setId !== setId) fail(path, 'スナップショットの形式・セットIDが不正です')
    reference(saved, 'setId', 'tackleSets', path)
    string(saved.setName, `${path}.setName`, true)
    for (const [field, table] of [['rod', 'rods'], ['reel', 'reels'], ['mainLine', 'lines'], ['leader', 'lines']] as const) {
      if ((field === 'mainLine' || field === 'leader') && saved[field] === undefined) continue
      const part = object(saved[field], `${path}.${field}`)
      validateTackleRecord(table, part)
      reference(part, 'id', table, `${path}.${field}`)
    }
    const reel = saved.reel as Row
    if (reel.mainLineId !== (saved.mainLine as Row | undefined)?.id) fail(path, 'メインラインの構成が一致しません')
  }

  for (const table of allBackupTableNames) {
    data[table]?.forEach((row, index) => {
      const path = `${table}[${index}]`
      for (const field of ['memo', 'note', 'nickname', 'weather', 'lureName', 'lureColor',
        'rangeLevel', 'retrieveSpeed', 'action', 'fishSpecies']) {
        string(row[field], `${path}.${field}`)
      }
      for (const field of ['temperatureC', 'waterTemperatureC', 'fishSizeCm', 'lengthMm', 'weightG']) {
        const number = row[field]
        if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) ||
          (!['temperatureC', 'waterTemperatureC'].includes(field) && number < 0))) {
          fail(`${path}.${field}`, '数値が不正です')
        }
      }
      switch (table) {
        case 'trips': {
          if (row.tackleSetIds !== undefined) {
            if (backup.version !== 4 || !Array.isArray(row.tackleSetIds)) fail(`${path}.tackleSetIds`, 'v4形式のセットID配列が必要です')
            if (new Set(row.tackleSetIds).size !== row.tackleSetIds.length) fail(path, '持参セットが重複しています')
            for (const setId of row.tackleSetIds) reference({ setId }, 'setId', 'tackleSets', path)
          }
          string(row.fishingAreaName, `${path}.fishingAreaName`, true)
          calendarDate(row.fishingDate, `${path}.fishingDate`)
          // 古い釣行のスタイル未設定は既存UIのフォールバックで扱う。自動補完しない。
          if (row.fishingStyle !== undefined && !styles.includes(row.fishingStyle as string)) {
            fail(`${path}.fishingStyle`, '釣りスタイルが不正です')
          }
          const start = dateTime(row.startedAt, `${path}.startedAt`)
          row.startedAt = start
          if (row.endedAt !== undefined) {
            const end = dateTime(row.endedAt, `${path}.endedAt`)
            if (end < start) fail(`${path}.endedAt`, '開始より前の終了日時です')
            row.endedAt = end
          }
          break
        }
        case 'catches':
          reference(row, 'tripId', 'trips', path)
          reference(row, 'lureId', 'myLures', path, true)
          reference(row, 'lureVariantId', 'lureVariants', path, true)
          if (row.lureId !== undefined && row.lureVariantId !== undefined && ownedVariants.get(row.lureId) !== row.lureVariantId) {
            fail(`${path}.lureVariantId`, '所有個体のカラー参照と一致しません')
          }
          if (row.tackleSetId !== undefined) id(row.tackleSetId, `${path}.tackleSetId`)
          // 導入前のIDのみの記録は意味を推測せず保持する。新記録はsnapshotと参照を検証。
          if (row.tackleSnapshot !== undefined) {
            if (backup.version !== 4) fail(path, 'スナップショットにはv4形式が必要です')
            snapshot(row.tackleSnapshot, row.tackleSetId, `${path}.tackleSnapshot`)
          }
          row.caughtAt = dateTime(row.caughtAt, `${path}.caughtAt`)
          break
        case 'tripEvents':
          reference(row, 'tripId', 'trips', path)
          if (row.type !== 'stocking' && row.type !== 'pellet') fail(`${path}.type`, 'イベント種別が不正です')
          row.occurredAt = dateTime(row.occurredAt, `${path}.occurredAt`)
          break
        case 'lureManufacturers':
          string(row.name, `${path}.name`, true)
          if (manufacturerNames.has(row.name as string)) fail(`${path}.name`, 'メーカー名が重複しています')
          manufacturerNames.add(row.name as string)
          break
        case 'lureSeries':
          string(row.name, `${path}.name`, true)
          reference(row, 'manufacturerId', 'lureManufacturers', path)
          break
        case 'lureModels':
          string(row.name, `${path}.name`, true)
          reference(row, 'seriesId', 'lureSeries', path)
          if (row.category !== undefined && !categories.includes(row.category as string)) {
            fail(`${path}.category`, 'カテゴリが不正です')
          }
          break
        case 'lureVariants':
          string(row.colorName, `${path}.colorName`, true)
          reference(row, 'modelId', 'lureModels', path)
          break
        case 'myLures':
          reference(row, 'variantId', 'lureVariants', path)
          if (typeof row.active !== 'boolean') fail(`${path}.active`, 'booleanが必要です')
          if (row.ownershipStatus !== undefined && !['owned', 'unverified', 'placeholder'].includes(row.ownershipStatus as string)) {
            fail(`${path}.ownershipStatus`, '所有状態が不正です')
          }
          break
        case 'rods':
        case 'lines':
          validateTackleRecord(table, row)
          break
        case 'reels':
          validateTackleRecord(table, row)
          reference(row, 'mainLineId', 'lines', path, true)
          break
        case 'tackleSets':
          validateTackleRecord(table, row)
          reference(row, 'rodId', 'rods', path)
          reference(row, 'reelId', 'reels', path)
          reference(row, 'leaderLineId', 'lines', path, true)
          break
      }
    })
  }
  return data
}

export async function createBackup(): Promise<FishingLogBackup> {
  const data = await db.transaction('r', allBackupTableNames.map(name => db.table(name)), async () => {
    const result = {} as Record<TableName, unknown[]>
    await Promise.all(allBackupTableNames.map(async name => {
      result[name] = await db.table(name).toArray()
    }))
    return result
  })
  // タックル関連データはv4。未導入データは従来のv2/v3形式との互換性を保つ。
  const hasTackle = tackleTableNames.some(name => data[name].length > 0) ||
    data.trips.some(row => (row as Row).tackleSetIds !== undefined) || data.catches.some(row => (row as Row).tackleSnapshot !== undefined)
  const version = hasTackle ? 4 : data.myLures.some(row => (row as Row).ownershipStatus !== undefined) ||
    data.catches.some(row => (row as Row).lureVariantId !== undefined) ? 3 : 2
  if (!hasTackle) for (const name of tackleTableNames) delete (data as Partial<typeof data>)[name]
  return { format: 'fishing-log-backup', version, exportedAt: new Date().toISOString(), data }
}

export async function exportBackup(): Promise<void> {
  const backup = await createBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  try {
    link.href = url
    link.download = `fishing-log-backup-${date}.json`
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

export async function importBackup(file: File): Promise<void> {
  let value: unknown
  try {
    value = JSON.parse(await file.text())
  } catch {
    throw new Error('JSONファイルを読み込めませんでした')
  }
  const data = validateBackup(value)
  await db.transaction('rw', allBackupTableNames.map(name => db.table(name)), async () => {
    for (const name of allBackupTableNames) await db.table(name).clear()
    for (const name of allBackupTableNames) await db.table(name).bulkAdd(data[name] ?? [])
    // 例外を握りつぶさず、全12テーブルの変更をロールバックする。
  })
}
