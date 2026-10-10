import { db } from '../db/database'

export const backupTableNames = [
  'trips', 'catches', 'tripEvents', 'lureManufacturers',
  'lureSeries', 'lureModels', 'lureVariants', 'myLures',
] as const

type TableName = typeof backupTableNames[number]
type Row = Record<string, unknown>
type RestoredData = Record<TableName, Row[]>

export interface FishingLogBackup {
  format: 'fishing-log-backup'
  version: 1 | 2
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
  if (backup.format !== 'fishing-log-backup' || (backup.version !== 1 && backup.version !== 2)) {
    fail('format/version', '対応するFishing Logバックアップではありません')
  }
  dateTime(backup.exportedAt, 'exportedAt')
  const source = object(backup.data, 'data')
  const data = {} as RestoredData
  const ids = {} as Record<TableName, Set<number>>

  for (const table of backupTableNames) {
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

  for (const table of backupTableNames) {
    data[table].forEach((row, index) => {
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
          if (row.tackleSetId !== undefined) id(row.tackleSetId, `${path}.tackleSetId`)
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
          break
      }
    })
  }
  return data
}

export async function createBackup(): Promise<FishingLogBackup> {
  const data = await db.transaction('r', backupTableNames.map(name => db.table(name)), async () => {
    const result = {} as Record<TableName, unknown[]>
    await Promise.all(backupTableNames.map(async name => {
      result[name] = await db.table(name).toArray()
    }))
    return result
  })
  return { format: 'fishing-log-backup', version: 2, exportedAt: new Date().toISOString(), data }
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
  await db.transaction('rw', backupTableNames.map(name => db.table(name)), async () => {
    for (const name of backupTableNames) await db.table(name).clear()
    for (const name of backupTableNames) await db.table(name).bulkAdd(data[name])
    // 例外を握りつぶさず、全8テーブルの変更をロールバックする。
  })
}
