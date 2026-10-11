import { db } from '../db/database'
import { validateFacilityMaster, canonicalizeFacilityMaster, flattenFacilityMaster, planFacilityMasterUpdate,
  type MasterSnapshot, type AppliedMaster, type FlatOfficialFacility, type FlatOfficialZone } from './facilityMaster'

export const facilityTableNames = ['facilities', 'zones', 'appMetadata'] as const
export interface FacilityStorage {
  facilities: MasterSnapshot['facilities']
  zones: MasterSnapshot['zones']
  appMetadata: (AppliedMaster & { key: 'facilityMaster' })[]
}
type Row = Record<string, unknown>
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
function fail(message: string): never { throw new Error(`施設マスター: ${message}`) }
function requireJson(value: unknown, path: string, ancestors = new Set<object>()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (!object(value) && !Array.isArray(value)) fail(`${path}: JSONで保持できない値です`)
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) fail(`${path}: JSONオブジェクトが必要です`)
  if (ancestors.has(value)) fail(`${path}: 循環参照です`)
  ancestors.add(value)
  for (const [key, child] of Object.entries(value)) requireJson(child, `${path}.${key}`, ancestors)
  ancestors.delete(value)
}
function accepted<T>(result: { ok: true; value: T } | { ok: false; errors: { path: string; message: string }[] }): T {
  if (!result.ok) fail(result.errors.map(e => `${e.path}: ${e.message}`).join('\n'))
  return result.value
}
function snapshot(data: FacilityStorage): MasterSnapshot {
  return { facilities: data.facilities, zones: data.zones, applied: data.appMetadata[0] }
}

/** Validate persisted/backup rows, including exact agreement between listed rows and canonical metadata. */
export function validateFacilityStorage(value: unknown): FacilityStorage {
  if (!object(value)) fail('施設データのオブジェクトが必要です')
  for (const key of facilityTableNames) if (!Array.isArray(value[key])) fail(`${key}: 配列が必要です`)
  const data = value as unknown as FacilityStorage
  const ids = new Set<string>(), parents = new Map<string, Row>()
  for (const table of ['facilities', 'zones'] as const) {
    for (const item of data[table]) {
      if (!object(item) || !nonempty(item.id) || !nonempty(item.name)) fail(`${table}: ID・名称が必要です`)
      requireJson(item, item.id)
      if (!['official', 'user'].includes(item.origin as string) || !new RegExp(`^${item.origin}:\\S+$`).test(item.id)) fail(`${item.id}: 名前空間が不正です`)
      if (ids.has(item.id)) fail(`${item.id}: IDが重複しています`)
      ids.add(item.id)
      if (table === 'facilities') parents.set(item.id, item)
      if (item.origin === 'user') {
        // Known optional fields keep their types. JSON extension fields are preserved, not stringified individually.
        for (const key of ['address', 'officialUrl', 'sourceUrl', 'verifiedAt', 'memo']) {
          if (item[key] !== undefined && item[key] !== null && typeof item[key] !== 'string') fail(`${item.id}.${key}: 文字列が必要です`)
        }
        if (item.active !== undefined && typeof item.active !== 'boolean') fail(`${item.id}.active: booleanが必要です`)
        if (item.sortOrder !== undefined && !Number.isSafeInteger(item.sortOrder)) fail(`${item.id}.sortOrder: 整数が必要です`)
      } else if (!['listed', 'retired'].includes(item.catalogState as string)) fail(`${item.id}: 状態が不正です`)
    }
  }
  for (const zone of data.zones) {
    const parent = parents.get(zone.facilityId)
    if (!parent || (zone.origin === 'official' && parent.origin !== 'official')) fail(`${zone.id}: 所属施設が不正です`)
  }
  if (data.appMetadata.length > 1) fail('metadataが重複しています')
  const metadata = data.appMetadata[0]
  const official = data.facilities.filter((f): f is FlatOfficialFacility => f.origin === 'official')
  if (official.length && !metadata) fail('公式行の適用metadataがありません')
  if (metadata) {
    if (!object(metadata) || metadata.key !== 'facilityMaster' || Object.keys(metadata).some(k => !['key', 'releaseOrder', 'masterVersion', 'canonicalContent'].includes(k))) fail('metadata形式が不正です')
    let parsed: unknown
    try { parsed = JSON.parse(metadata.canonicalContent) } catch { fail('canonical JSONが不正です') }
    const master = accepted(validateFacilityMaster(parsed))
    if (master.releaseOrder !== metadata.releaseOrder || master.masterVersion !== metadata.masterVersion || accepted(canonicalizeFacilityMaster(master)) !== metadata.canonicalContent) fail('metadataと完全版の内容が一致しません')
    // PR1 also checks namespaces, existing official properties, collisions and zone parent consistency.
    accepted(planFacilityMasterUpdate(snapshot(data), master))
    const expected = accepted(flattenFacilityMaster(master))
    for (const table of ['facilities', 'zones'] as const) {
      const listed = data[table].filter(r => r.origin === 'official' && r.catalogState === 'listed')
      const sorted = (rows: { id: string }[]) => [...rows].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      if (canonical(sorted(listed)) !== canonical(sorted(expected[table]))) fail(`${table}: listed行と完全版metadataが一致しません`)
      if (data[table].some(r => r.origin === 'official' && r.catalogState === 'retired' && expected[table].some(n => n.id === r.id))) fail(`${table}: 完全版のIDが退役しています`)
    }
  } else if (data.zones.some(z => z.origin === 'official')) fail('公式エリアのmetadataがありません')
  // Only these three stores cross this boundary. Do not overwrite validated Date objects in old stores.
  return clone({ facilities: data.facilities, zones: data.zones, appMetadata: data.appMetadata })
}

export async function readFacilityStorage(): Promise<FacilityStorage> {
  return { facilities: await db.facilities.toArray(), zones: await db.zones.toArray(), appMetadata: await db.appMetadata.toArray() }
}

/** Input is validated before opening the transaction; the plan uses current rows inside the transaction. */
export async function applyFacilityMaster(input: unknown): Promise<void> {
  const master = accepted(validateFacilityMaster(input))
  await db.transaction('rw', facilityTableNames.map(name => db.table(name)), async () => {
    const current = validateFacilityStorage(await readFacilityStorage())
    const plan = accepted(planFacilityMasterUpdate(snapshot(current), master))
    if (current.appMetadata[0]?.canonicalContent === plan.applied.canonicalContent) return
    await db.facilities.bulkPut([...plan.facilities.added, ...plan.facilities.updated, ...plan.facilities.retired])
    await db.zones.bulkPut([...plan.zones.added, ...plan.zones.updated, ...plan.zones.retired])
    await db.appMetadata.put({ key: 'facilityMaster', ...plan.applied })
  })
}

/** Non-destructive union: newest official snapshot wins, missing historical official IDs survive retired. */
export function mergeFacilityStorage(currentValue: FacilityStorage, incomingValue: FacilityStorage): FacilityStorage {
  const current = validateFacilityStorage(currentValue), incoming = validateFacilityStorage(incomingValue)
  const cm = current.appMetadata[0], im = incoming.appMetadata[0]
  if (cm && im && cm.releaseOrder === im.releaseOrder && cm.canonicalContent !== im.canonicalContent) fail('同じreleaseOrderで異なる内容です')
  if (im && (!cm || im.releaseOrder > cm.releaseOrder)) accepted(planFacilityMasterUpdate(snapshot(current), JSON.parse(im.canonicalContent)))
  const incomingWins = !!im && (!cm || im.releaseOrder > cm.releaseOrder)
  const result = clone(incomingWins ? incoming : current), other = incomingWins ? current : incoming
  for (const table of ['facilities', 'zones'] as const) {
    for (const item of other[table]) {
      const wrongTable = table === 'facilities' ? result.zones : result.facilities
      if (wrongTable.some(r => r.id === item.id)) fail(`${item.id}: 施設・エリア間のID衝突`)
      const existing = result[table].find(r => r.id === item.id)
      if (existing) {
        if (item.origin !== existing.origin) fail(`${item.id}: origin衝突`)
        if (item.origin === 'user' && canonical(item) !== canonical(existing)) fail(`${item.id}: ユーザー施設・エリアの内容が衝突しています`)
        if (table === 'zones' && (item as Row).facilityId !== (existing as Row).facilityId) fail(`${item.id}: エリアの所属変更`)
      } else {
        const retained = item.origin === 'official' ? { ...item, catalogState: 'retired' as const } : item
        if (table === 'facilities') result.facilities.push(retained as FacilityStorage['facilities'][number])
        else result.zones.push(retained as FlatOfficialZone | FacilityStorage['zones'][number])
      }
    }
  }
  return validateFacilityStorage(result)
}

export function validateLocationReferences(records: { trips: Row[]; catches: Row[] }, data: FacilityStorage) {
  const facilities = new Set(data.facilities.map(f => f.id)), zones = new Map(data.zones.map(z => [z.id, z.facilityId]))
  for (const [table, rows] of Object.entries(records)) rows.forEach((record, i) => {
    const path = `${table}[${i}]`, zoneKey = table === 'trips' ? 'currentZoneId' : 'zoneId'
    if (record.facilityId !== undefined && (!nonempty(record.facilityId) || !facilities.has(record.facilityId))) fail(`${path}.facilityId: 参照先がありません`)
    if (record[zoneKey] !== undefined && (!nonempty(record[zoneKey]) || zones.get(record[zoneKey]) !== record.facilityId || record.facilityId === undefined)) fail(`${path}.${zoneKey}: エリア所属・参照先が不正です`)
    if (record.locationSnapshot !== undefined) {
      const saved = record.locationSnapshot
      if (!object(saved) || !nonempty(saved.facilityName) || (saved.zoneName !== undefined && !nonempty(saved.zoneName)) || record.facilityId === undefined) fail(`${path}.locationSnapshot: 形式が不正です`)
    }
  })
}
