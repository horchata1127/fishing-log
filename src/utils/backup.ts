import { db, tackleTableNames, validateTackleRecord, validateFishSpecies, validateFishCatch, validateCatchResult, validateCatchAction,
  weatherTableNames, weatherFields, validateWeatherLocation, validateWeatherHour, validateWeatherRequest } from '../db/database'
import { facilityTableNames, validateFacilityStorage, readFacilityStorage, mergeFacilityStorage, validateLocationReferences, type FacilityStorage } from './facilityStorage'

export const backupTableNames = [
  'trips', 'catches', 'tripEvents', 'lureManufacturers',
  'lureSeries', 'lureModels', 'lureVariants', 'myLures',
] as const

export const allBackupTableNames = [...backupTableNames, ...tackleTableNames] as const
export const fullBackupTableNames = [...allBackupTableNames, 'fishSpecies'] as const
type TableName = typeof allBackupTableNames[number]
type Row = Record<string, unknown>
type RestoredData = Record<typeof backupTableNames[number], Row[]> & Partial<Record<typeof tackleTableNames[number], Row[]>> & { fishSpecies?: Row[] } & Partial<FacilityStorage> & Partial<Record<typeof weatherTableNames[number], Row[]>>
export const completeBackupTableNames = [...fullBackupTableNames, ...facilityTableNames, ...weatherTableNames] as const

export interface FishingLogBackup {
  format: 'fishing-log-backup'
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7
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
    fishSpecies?: unknown[]
    facilities?: unknown[]
    zones?: unknown[]
    appMetadata?: unknown[]
    tripWeatherLocations?: unknown[]
    tripWeatherHours?: unknown[]
    tripWeatherRequests?: unknown[]
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
  if (backup.format !== 'fishing-log-backup' || ![1, 2, 3, 4, 5, 6, 7].includes(backup.version as number)) {
    fail('format/version', '対応するFishing Logバックアップではありません')
  }
  dateTime(backup.exportedAt, 'exportedAt')
  const source = object(backup.data, 'data')
  const data = {} as RestoredData
  const ids = {} as Record<TableName, Set<number>>
  const fishIds = new Set<string>()
  const fishNames = new Set<string>()
  if (Number(backup.version) >= 5) {
    if (!Array.isArray(source.fishSpecies)) fail('data.fishSpecies', '配列が必要です')
    data.fishSpecies = source.fishSpecies.map(entry => {
      validateFishSpecies(entry)
      const name = entry.display_name.trim().toLocaleLowerCase('ja-JP')
      if (fishIds.has(entry.fish_id) || fishNames.has(name)) fail('data.fishSpecies', '魚種IDまたは名称が重複しています')
      fishIds.add(entry.fish_id)
      fishNames.add(name)
      return { ...entry }
    })
  } else if (source.fishSpecies !== undefined) fail('data.fishSpecies', '魚種マスターにはv5形式が必要です')

  for (const table of allBackupTableNames) {
    if ((tackleTableNames as readonly string[]).includes(table) && Number(backup.version) < 4) {
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
            if (Number(backup.version) < 4 || !Array.isArray(row.tackleSetIds)) fail(`${path}.tackleSetIds`, 'v4以降のセットID配列が必要です')
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
          if (Number(backup.version) < 5 && (row.fishSpeciesId !== undefined || row.fishSpeciesGroup !== undefined)) fail(path, '魚種参照にはv5形式が必要です')
          validateCatchResult(row)
          validateCatchAction(row)
          validateFishCatch(row, fishIds)
          reference(row, 'tripId', 'trips', path)
          reference(row, 'lureId', 'myLures', path, true)
          reference(row, 'lureVariantId', 'lureVariants', path, true)
          if (row.lureId !== undefined && row.lureVariantId !== undefined && ownedVariants.get(row.lureId) !== row.lureVariantId) {
            fail(`${path}.lureVariantId`, '所有個体のカラー参照と一致しません')
          }
          if (row.tackleSetId !== undefined) id(row.tackleSetId, `${path}.tackleSetId`)
          // 導入前のIDのみの記録は意味を推測せず保持する。新記録はsnapshotと参照を検証。
          if (row.tackleSnapshot !== undefined) {
            if (Number(backup.version) < 4) fail(path, 'スナップショットにはv4以降の形式が必要です')
            snapshot(row.tackleSnapshot, row.tackleSetId, `${path}.tackleSnapshot`)
          }
          row.caughtAt = dateTime(row.caughtAt, `${path}.caughtAt`)
          break
        case 'tripEvents':
          for (const field of ['note', 'facilityId', 'zoneId', 'zoneName']) if (row[field] !== undefined) string(row[field], `${path}.${field}`)
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
  if (Number(backup.version) >= 6) {
    const facilities = validateFacilityStorage(source)
    Object.assign(data, facilities)
    validateLocationReferences(data, facilities)
  } else {
    for (const name of facilityTableNames) if (source[name] !== undefined) fail(`data.${name}`, '施設データにはv6形式が必要です')
    for (const row of [...data.trips, ...data.catches]) {
      if (['facilityId', 'currentZoneId', 'zoneId', 'locationSnapshot'].some(key => row[key] !== undefined)) fail('場所参照', '場所参照にはv6形式が必要です')
    }
  }
  if (backup.version === 7) {
    for (const name of weatherTableNames) {
      if (!Array.isArray(source[name])) fail(`data.${name}`, '配列が必要です')
      data[name] = (source[name] as unknown[]).map(value => ({ ...object(value, name) }))
    }
    const locations = new Set<number>(), requests = new Map<number, Row>(), hourKeys = new Set<string>()
    for (const row of data.tripWeatherLocations!) {
      validateWeatherLocation(row)
      if (!ids.trips.has(row.tripId) || locations.has(row.tripId)) fail('tripWeatherLocations', '釣行参照または地点の重複が不正です')
      locations.add(row.tripId)
    }
    for (const row of data.tripWeatherRequests!) {
      validateWeatherRequest(row)
      if (!locations.has(row.tripId) || requests.has(row.id!)) fail('tripWeatherRequests', '地点参照または取得IDの重複が不正です')
      requests.set(row.id!, row as unknown as Row)
    }
    const grouped = new Map<number, Row[]>()
    for (const row of data.tripWeatherHours!) {
      validateWeatherHour(row)
      const request = requests.get(row.requestId), key = `${row.tripId}:${row.timestamp}`
      if (!request || request.tripId !== row.tripId || !['complete','partial'].includes(request.status as string) || request.fetchedAt !== row.fetchedAt || hourKeys.has(key)) fail('tripWeatherHours', '取得参照・時刻重複が不正です')
      const start = Date.parse(`${request.startDayJst}T00:00:00+09:00`), end = Date.parse(`${request.endDayJst}T00:00:00+09:00`) + 86400000
      if (row.timestamp < start || row.timestamp >= end || end - start > 366 * 86400000) fail('tripWeatherHours', '取得期間と時刻が一致しません')
      hourKeys.add(key)
      const hours = grouped.get(row.tripId) ?? []; hours.push(row as unknown as Row); grouped.set(row.tripId, hours)
    }
    for (const hours of grouped.values()) {
      const first = hours[0]!, request = requests.get(first.requestId as number)!
      const expected = (Date.parse(`${request.endDayJst}T00:00:00+09:00`) - Date.parse(`${request.startDayJst}T00:00:00+09:00`)) / 3600000 + 24
      if (hours.some(h => h.requestId !== first.requestId) || hours.length !== expected ||
          hours.reduce((count, h) => count + weatherFields.filter(f => h[f] === null).length, 0) !== request.missingValues) fail('tripWeatherHours', '保存時間帯・欠損情報が一致しません')
    }
  } else {
    for (const name of weatherTableNames) if (source[name] !== undefined) fail(`data.${name}`, '気象データにはv7形式が必要です')
  }
  return data
}

export async function createBackup(): Promise<FishingLogBackup> {
  const data = await db.transaction('r', completeBackupTableNames.map(name => db.table(name)), async () => {
    const result = {} as Record<typeof completeBackupTableNames[number], unknown[]>
    await Promise.all(completeBackupTableNames.map(async name => {
      result[name] = await db.table(name).toArray()
    }))
    return result
  })
  const hasFacilities = facilityTableNames.some(name => data[name].length > 0) ||
    [...data.trips, ...data.catches].some(row => ['facilityId', 'currentZoneId', 'zoneId', 'locationSnapshot'].some(key => (row as Row)[key] !== undefined))
  const hasWeather = weatherTableNames.some(name => data[name].length > 0)
  if (hasFacilities || hasWeather) {
    const storage = validateFacilityStorage(data)
    validateLocationReferences(data as { trips: Row[]; catches: Row[] }, storage)
    if (!hasWeather) for (const name of weatherTableNames) delete (data as Partial<typeof data>)[name]
    const backup: FishingLogBackup = { format: 'fishing-log-backup', version: hasWeather ? 7 : 6, exportedAt: new Date().toISOString(), data }
    if (hasWeather) validateBackup(JSON.parse(JSON.stringify(backup)))
    return backup
  }
  for (const name of weatherTableNames) delete (data as Partial<typeof data>)[name]
  for (const name of facilityTableNames) delete (data as Partial<typeof data>)[name]
  // タックル関連データはv4。未導入データは従来のv2/v3形式との互換性を保つ。
  const hasTackle = tackleTableNames.some(name => data[name].length > 0) ||
    data.trips.some(row => (row as Row).tackleSetIds !== undefined) || data.catches.some(row => (row as Row).tackleSnapshot !== undefined)
  const hasFish = data.fishSpecies.length > 0 || data.catches.some(row => (row as Row).fishSpeciesId !== undefined || (row as Row).fishSpeciesGroup !== undefined)
  const version = hasFish ? 5 : hasTackle ? 4 : data.myLures.some(row => (row as Row).ownershipStatus !== undefined) ||
    data.catches.some(row => (row as Row).lureVariantId !== undefined) ? 3 : 2
  if (!hasFish && !hasTackle) for (const name of tackleTableNames) delete (data as Partial<typeof data>)[name]
  if (!hasFish) delete (data as Partial<typeof data>).fishSpecies
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
  await db.transaction('rw', completeBackupTableNames.map(name => db.table(name)), async () => {
    const merged = mergeFacilityStorage(await readFacilityStorage(), {
      facilities: data.facilities ?? [], zones: data.zones ?? [], appMetadata: data.appMetadata ?? [],
    })
    validateLocationReferences(data, merged)
    for (const name of fullBackupTableNames) await db.table(name).clear()
    for (const name of fullBackupTableNames) await db.table(name).bulkAdd(data[name] ?? [])
    // A restore replaces trip IDs: never attach pre-restore weather to a different trip.
    for (const name of weatherTableNames) await db.table(name).clear()
    for (const name of weatherTableNames) await db.table(name).bulkAdd(data[name] ?? [])
    await db.facilities.bulkPut(merged.facilities)
    await db.zones.bulkPut(merged.zones)
    await db.appMetadata.bulkPut(merged.appMetadata)
    // Facility/zone/master stores retain the existing merge and conflict protections.
  })
}
