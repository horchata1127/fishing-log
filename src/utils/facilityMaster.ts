/** Stage 6 PR1: pure contracts and plans only. No database, browser or network calls. */
export const facilityPrefectures = ['宮城県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '山梨県', '長野県', '静岡県'] as const
export const facilityTypes = ['pond', 'stream', 'pool', 'managed_river'] as const
export const operationStatuses = ['open', 'seasonal', 'temporarily_closed', 'closed', 'unknown'] as const
export interface OfficialZoneV1 { id: string; name: string; sortOrder: number; sourceUrl: string | null }
export interface OfficialFacilityV1 {
  id: string; name: string; prefecture: typeof facilityPrefectures[number]; address: string | null
  facilityTypes: typeof facilityTypes[number][]; lureAllowed: true
  operationStatus: typeof operationStatuses[number]; officialUrl: string | null; sourceUrl: string | null
  verifiedAt: string | null; aliases: string[]; zones: OfficialZoneV1[]
}
export interface FacilityMasterV1 {
  schemaVersion: 1; masterVersion: string; distributionMode: 'full'; releaseOrder: number; facilities: OfficialFacilityV1[]
}
export interface MasterIssue { path: string; message: string; facilityId?: string; zoneId?: string }
export type MasterResult<T> = { ok: true; value: T; warnings: MasterIssue[] } | { ok: false; errors: MasterIssue[]; warnings: MasterIssue[] }
type JsonRow = Record<string, unknown>
const facilityKeys = ['id', 'name', 'prefecture', 'address', 'facilityTypes', 'lureAllowed', 'operationStatus', 'officialUrl', 'sourceUrl', 'verifiedAt', 'aliases', 'zones']
const zoneKeys = ['id', 'name', 'sortOrder', 'sourceUrl']
const row = (v: unknown): v is JsonRow => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const officialId = (v: unknown): v is string => typeof v === 'string' && /^official:\S+$/.test(v)
function urlOrNull(v: unknown) {
  if (v === null) return true
  if (typeof v !== 'string' || !v.trim()) return false
  try { const url = new URL(v); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname } catch { return false }
}
function dateOrNull(v: unknown) {
  if (v === null) return true
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const date = new Date(`${v}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v
}
function pick(value: JsonRow, keys: string[]) { return Object.fromEntries(keys.map(key => [key, value[key]])) }

/** Known research metadata is reported and stripped, never promoted into distribution fields. */
export function validateFacilityMaster(input: unknown): MasterResult<FacilityMasterV1> {
  const errors: MasterIssue[] = [], warnings: MasterIssue[] = [], ids = new Set<string>()
  const issue = (path: string, message: string, facilityId?: string, zoneId?: string) => errors.push({ path, message, facilityId, zoneId })
  function keys(value: JsonRow, allowed: string[], ignored: string[], path: string, facilityId?: string, zoneId?: string) {
    for (const key of Object.keys(value)) {
      if (ignored.includes(key)) warnings.push({ path: `${path}.${key}`, message: '既知の調査メタデータを無視しました', facilityId, zoneId })
      else if (!allowed.includes(key)) issue(`${path}.${key}`, '未知フィールドです', facilityId, zoneId)
    }
  }
  function checkId(value: unknown, path: string, facilityId?: string, zoneId?: string) {
    if (!officialId(value)) issue(path, 'official:名前空間の非空IDが必要です', facilityId, zoneId)
    else if (ids.has(value)) issue(path, '施設・エリアを通じてIDが重複しています', facilityId, zoneId)
    else ids.add(value)
  }
  if (!row(input)) return { ok: false, errors: [{ path: '$', message: 'JSONオブジェクトが必要です' }], warnings }
  keys(input, ['schemaVersion', 'masterVersion', 'distributionMode', 'releaseOrder', 'facilities'], ['status', 'notes'], '$')
  if (input.schemaVersion !== 1) issue('$.schemaVersion', 'schemaVersionは1のみ対応しています')
  if (!text(input.masterVersion)) issue('$.masterVersion', '非空文字列が必要です')
  if (input.distributionMode !== 'full') issue('$.distributionMode', '完全版fullのみ対応しています。ドラフト/部分配布は適用できません')
  if (!Number.isSafeInteger(input.releaseOrder) || (input.releaseOrder as number) <= 0) issue('$.releaseOrder', '正の安全な整数が必要です')
  if (!Array.isArray(input.facilities)) issue('$.facilities', '配列が必要です')
  else if (!input.facilities.length) issue('$.facilities', '空配布は未承認のため拒否します')
  const facilities: JsonRow[] = []
  if (Array.isArray(input.facilities)) input.facilities.forEach((facility: unknown, i: number) => {
    const path = `$.facilities[${i}]`
    if (!row(facility)) { issue(path, '施設オブジェクトが必要です'); return }
    const fid = typeof facility.id === 'string' ? facility.id : undefined
    keys(facility, facilityKeys, ['researchStatus'], path, fid)
    checkId(facility.id, `${path}.id`, fid)
    if (!text(facility.name)) issue(`${path}.name`, '非空名称が必要です', fid)
    if (!(facilityPrefectures as readonly unknown[]).includes(facility.prefecture)) issue(`${path}.prefecture`, '対象12都県の正式表記が必要です', fid)
    if (facility.address !== null && typeof facility.address !== 'string') issue(`${path}.address`, '文字列または明示nullが必要です', fid)
    if (!Array.isArray(facility.facilityTypes) || !facility.facilityTypes.length || facility.facilityTypes.some(v => !(facilityTypes as readonly unknown[]).includes(v)) || new Set(facility.facilityTypes).size !== facility.facilityTypes.length) issue(`${path}.facilityTypes`, '許可値の重複なし非空配列が必要です', fid)
    if (facility.lureAllowed !== true) issue(`${path}.lureAllowed`, '公式施設はtrue必須です。未確認値を補完しません', fid)
    if (!(operationStatuses as readonly unknown[]).includes(facility.operationStatus)) issue(`${path}.operationStatus`, '営業状態が不正です', fid)
    for (const key of ['officialUrl', 'sourceUrl']) if (!urlOrNull(facility[key])) issue(`${path}.${key}`, 'http/https URLまたは明示nullが必要です', fid)
    if (!dateOrNull(facility.verifiedAt)) issue(`${path}.verifiedAt`, '実在するYYYY-MM-DDまたは明示nullが必要です', fid)
    if (!Array.isArray(facility.aliases) || facility.aliases.some(v => !text(v))) issue(`${path}.aliases`, '非空文字列の配列が必要です（空配列可）', fid)
    const zones: JsonRow[] = []
    if (!Array.isArray(facility.zones)) issue(`${path}.zones`, '配列が必要です（0件可）', fid)
    else facility.zones.forEach((zone: unknown, j: number) => {
      const zp = `${path}.zones[${j}]`
      if (!row(zone)) { issue(zp, 'エリアオブジェクトが必要です', fid); return }
      const zid = typeof zone.id === 'string' ? zone.id : undefined
      keys(zone, zoneKeys, [], zp, fid, zid); checkId(zone.id, `${zp}.id`, fid, zid)
      if (!text(zone.name)) issue(`${zp}.name`, '非空名称が必要です', fid, zid)
      if (!Number.isSafeInteger(zone.sortOrder)) issue(`${zp}.sortOrder`, '安全な整数が必要です（0/負数も正規化しません）', fid, zid)
      if (!urlOrNull(zone.sourceUrl)) issue(`${zp}.sourceUrl`, 'http/https URLまたは明示nullが必要です', fid, zid)
      zones.push(pick(zone, zoneKeys))
    })
    facilities.push({ ...pick(facility, facilityKeys), zones })
  })
  if (errors.length) return { ok: false, errors, warnings }
  // Only validated, explicitly selected JSON fields cross the boundary; inputs are not mutated.
  const value = JSON.parse(JSON.stringify({ schemaVersion: 1, masterVersion: input.masterVersion,
    distributionMode: 'full', releaseOrder: input.releaseOrder, facilities })) as FacilityMasterV1
  return { ok: true, value, warnings }
}

/** Stable keys/formatting; arrays keep their declared order. No hash collision or crypto dependency. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (row(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function canonicalizeFacilityMaster(input: unknown): MasterResult<string> {
  const result = validateFacilityMaster(input)
  return result.ok ? { ok: true, value: canonical(result.value), warnings: result.warnings } : result
}
export type FlatOfficialFacility = Omit<OfficialFacilityV1, 'zones'> & { origin: 'official'; catalogState: 'listed' | 'retired' }
export type FlatOfficialZone = OfficialZoneV1 & { facilityId: string; origin: 'official'; catalogState: 'listed' | 'retired' }
export interface FlatMaster { facilities: FlatOfficialFacility[]; zones: FlatOfficialZone[] }
export function flattenFacilityMaster(input: unknown): MasterResult<FlatMaster> {
  const result = validateFacilityMaster(input)
  if (!result.ok) return result
  const facilities: FlatOfficialFacility[] = [], zones: FlatOfficialZone[] = []
  for (const facility of result.value.facilities) {
    const { zones: nested, ...fields } = facility
    facilities.push({ ...fields, origin: 'official', catalogState: 'listed' })
    zones.push(...[...nested].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(zone => ({ ...zone, facilityId: facility.id, origin: 'official' as const, catalogState: 'listed' as const })))
  }
  return { ok: true, value: { facilities, zones }, warnings: result.warnings }
}
export interface UserFacility { id: string; origin: 'user'; [key: string]: unknown }
export interface UserZone extends UserFacility { facilityId: string }
export interface AppliedMaster { releaseOrder: number; masterVersion: string; canonicalContent: string }
export interface MasterSnapshot {
  facilities: (FlatOfficialFacility | UserFacility)[]; zones: (FlatOfficialZone | UserZone)[]; applied?: AppliedMaster
}
export interface PlannedRows<T> { added: T[]; updated: T[]; retired: T[]; unchanged: T[] }
export interface MasterUpdatePlan { facilities: PlannedRows<FlatOfficialFacility>; zones: PlannedRows<FlatOfficialZone>; applied: AppliedMaster }

/** Build a full-distribution diff without writing, deleting or touching trips/catches/user rows. */
export function planFacilityMasterUpdate(snapshot: MasterSnapshot, input: unknown): MasterResult<MasterUpdatePlan> {
  const next = validateFacilityMaster(input)
  if (!next.ok) return next
  const errors: MasterIssue[] = [], warnings = next.warnings
  const fail = (path: string, message: string) => errors.push({ path, message })
  if (!row(snapshot) || !Array.isArray(snapshot.facilities) || !Array.isArray(snapshot.zones)) {
    return { ok: false, errors: [{ path: 'snapshot', message: '施設・エリアsnapshot配列が必要です' }], warnings }
  }
  const applied = { releaseOrder: next.value.releaseOrder, masterVersion: next.value.masterVersion, canonicalContent: canonical(next.value) }
  if (snapshot.applied) {
    if (!Number.isSafeInteger(snapshot.applied.releaseOrder) || snapshot.applied.releaseOrder <= 0 || !text(snapshot.applied.masterVersion) || !text(snapshot.applied.canonicalContent)) fail('snapshot.applied', '適用状態が不正です')
    else if (applied.releaseOrder < snapshot.applied.releaseOrder) fail('$.releaseOrder', '古い配布への巻き戻しを拒否します')
    else if (applied.releaseOrder === snapshot.applied.releaseOrder && (applied.canonicalContent !== snapshot.applied.canonicalContent || applied.masterVersion !== snapshot.applied.masterVersion)) fail('$.releaseOrder', '同じreleaseOrderで異なる内容です')
  }
  const seen = new Set<string>(), parents = new Set(snapshot.facilities.filter(row).map(f => f.id))
  for (const [table, records] of [['facilities', snapshot.facilities], ['zones', snapshot.zones]] as const) {
    records.forEach((record, i) => {
      const path = `snapshot.${table}[${i}]`
      if (!row(record) || !text(record.id)) { fail(path, '既存行のID/形式が不正です'); return }
      if (seen.has(record.id)) fail(`${path}.id`, '既存IDが重複しています')
      seen.add(record.id)
      if (record.origin === 'user') {
        if (!/^user:\S+$/.test(record.id)) fail(`${path}.id`, '公式IDとユーザー行が衝突しています')
      } else if (record.origin !== 'official' || !officialId(record.id) || !['listed', 'retired'].includes(record.catalogState as string)) fail(path, '既存公式行の名前空間/状態が不正です')
      if (table === 'zones' && !parents.has((record as JsonRow).facilityId as string)) fail(`${path}.facilityId`, '既存エリアの所属施設がありません')
    })
  }
  const flat = flattenFacilityMaster(next.value)
  if (!flat.ok) return flat
  if (errors.length) return { ok: false, errors, warnings }
  const oldOfficial = snapshot.facilities.filter((f): f is FlatOfficialFacility => f.origin === 'official')
  if (oldOfficial.length) {
    const check = validateFacilityMaster({ schemaVersion: 1, masterVersion: 'snapshot-check', distributionMode: 'full', releaseOrder: 1,
      facilities: oldOfficial.map(f => ({ ...pick(f as unknown as JsonRow, facilityKeys.filter(k => k !== 'zones')),
        zones: snapshot.zones.filter(z => z.origin === 'official' && z.facilityId === f.id).map(z => pick(z as unknown as JsonRow, zoneKeys)) })) })
    if (!check.ok) errors.push(...check.errors.map(e => ({ ...e, path: e.path.replace('$', 'snapshot') })))
  }
  for (const facility of flat.value.facilities) if (snapshot.zones.some(z => z.id === facility.id)) fail(`facilities[${facility.id}].id`, '既存エリアIDを施設IDへ転用できません')
  for (const zone of flat.value.zones) {
    if (snapshot.facilities.some(f => f.id === zone.id)) fail(`zones[${zone.id}].id`, '既存施設IDをエリアIDへ転用できません')
    const old = snapshot.zones.find(z => z.id === zone.id)
    if (old && old.facilityId !== zone.facilityId) fail(`zones[${zone.id}].facilityId`, '同じエリアIDの所属施設変更を拒否します')
  }
  for (const zone of snapshot.zones) if (zone.origin === 'official' && !oldOfficial.some(f => f.id === zone.facilityId)) fail(`zones[${zone.id}].facilityId`, '公式エリアには公式施設が必要です')
  if (errors.length) return { ok: false, errors, warnings }
  function diff<T extends FlatOfficialFacility | FlatOfficialZone>(existing: (T | UserFacility)[], incoming: T[]): PlannedRows<T> {
    const plan: PlannedRows<T> = { added: [], updated: [], retired: [], unchanged: [] }
    const nextIds = new Set(incoming.map(v => v.id))
    for (const record of incoming) {
      const previous = existing.find(v => v.id === record.id)
      if (!previous) plan.added.push(record)
      else if (canonical(previous) === canonical(record)) plan.unchanged.push(record)
      else plan.updated.push(record)
    }
    for (const previous of existing) if (previous.origin === 'official' && !nextIds.has(previous.id)) {
      const retained = JSON.parse(JSON.stringify(previous)) as T
      if (retained.catalogState === 'retired') plan.unchanged.push(retained)
      else plan.retired.push({ ...retained, catalogState: 'retired' })
    }
    return plan
  }
  return { ok: true, value: { facilities: diff<FlatOfficialFacility>(snapshot.facilities, flat.value.facilities), zones: diff<FlatOfficialZone>(snapshot.zones, flat.value.zones), applied }, warnings }
}
