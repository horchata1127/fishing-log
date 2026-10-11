import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/facilityMaster.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { validateFacilityMaster: validate, flattenFacilityMaster: flatten, canonicalizeFacilityMaster: canonicalize,
  planFacilityMasterUpdate: plan } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
// Fictional fixtures only. No draft master or real facility information is bundled.
const zone = (id = 'official:zone-a') => ({ id, name: '架空エリア', sortOrder: 1, sourceUrl: null })
const facility = (id = 'official:facility-a', zones = [zone()]) => ({ id, name: '架空施設', prefecture: '長野県',
  address: null, facilityTypes: ['pond'], lureAllowed: true, operationStatus: 'unknown',
  officialUrl: null, sourceUrl: null, verifiedAt: null, aliases: [], zones })
const master = () => ({ schemaVersion: 1, masterVersion: 'sample-1', distributionMode: 'full', releaseOrder: 1, facilities: [facility()] })
function accepted(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result.value }
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v) } return v }
function stateOf(plan) {
  return { facilities: [...plan.facilities.added, ...plan.facilities.updated, ...plan.facilities.retired, ...plan.facilities.unchanged],
    zones: [...plan.zones.added, ...plan.zones.updated, ...plan.zones.retired, ...plan.zones.unchanged], applied: plan.applied }
}

test('valid contract, explicit null, zero zones; no input mutation or output aliasing', () => {
  const input = master(); input.facilities[0].zones = []; freeze(input)
  const value = accepted(validate(input)); assert.deepEqual(value, input)
  value.facilities[0].aliases.push('架空の略称'); assert.deepEqual(input.facilities[0].aliases, [])
})
const invalid = [
  ['null root', () => null], ['array root', () => []],
  ['schema version', m => { m.schemaVersion = 2 }], ['masterVersion blank', m => { m.masterVersion = ' ' }],
  ['partial distribution', m => { m.distributionMode = 'partial' }], ['research distribution', m => { m.distributionMode = 'full_snapshot_draft' }],
  ['release zero', m => { m.releaseOrder = 0 }], ['release fractional', m => { m.releaseOrder = 1.5 }],
  ['release unsafe', m => { m.releaseOrder = Number.MAX_SAFE_INTEGER + 1 }], ['release string', m => { m.releaseOrder = '1' }],
  ['empty distribution', m => { m.facilities = [] }], ['missing facilities', m => { delete m.facilities }],
  ['null facility', m => { m.facilities = [null] }], ['user facility ID', m => { m.facilities[0].id = 'user:x' }],
  ['empty official suffix', m => { m.facilities[0].id = 'official:' }], ['blank name', m => { m.facilities[0].name = '\t ' }],
  ['prefecture shorthand', m => { m.facilities[0].prefecture = '長野' }], ['missing nullable address', m => { delete m.facilities[0].address }],
  ['null facilityTypes', m => { m.facilities[0].facilityTypes = null }], ['empty facilityTypes', m => { m.facilities[0].facilityTypes = [] }],
  ['duplicate type', m => { m.facilities[0].facilityTypes = ['pond', 'pond'] }], ['unknown type', m => { m.facilities[0].facilityTypes = ['lake'] }],
  ['lure not allowed', m => { m.facilities[0].lureAllowed = false }], ['lure unknown', m => { m.facilities[0].lureAllowed = null }],
  ['status enum', m => { m.facilities[0].operationStatus = '営業中' }], ['javascript URL', m => { m.facilities[0].officialUrl = 'javascript:alert(1)' }],
  ['missing sourceUrl', m => { delete m.facilities[0].sourceUrl }], ['relative URL', m => { m.facilities[0].sourceUrl = '/source' }],
  ['invalid calendar date', m => { m.facilities[0].verifiedAt = '2026-02-29' }], ['missing date', m => { delete m.facilities[0].verifiedAt }],
  ['blank alias', m => { m.facilities[0].aliases = [' '] }], ['missing zones', m => { delete m.facilities[0].zones }],
  ['null zone', m => { m.facilities[0].zones = [null] }], ['zone blank name', m => { m.facilities[0].zones[0].name = '' }],
  ['sort NaN', m => { m.facilities[0].zones[0].sortOrder = NaN }], ['sort Infinity', m => { m.facilities[0].zones[0].sortOrder = Infinity }],
  ['sort fractional', m => { m.facilities[0].zones[0].sortOrder = .5 }], ['missing zone nullable', m => { delete m.facilities[0].zones[0].sourceUrl }],
  ['unknown root', m => { m.extra = true }], ['unknown facility', m => { m.facilities[0].verificationBasis = '未承認' }],
  ['unknown zone', m => { m.facilities[0].zones[0].lureAllowed = true }],
  ['duplicate facility ID', m => { m.facilities.push(facility()) }],
  ['duplicate global zone ID', m => { m.facilities.push(facility('official:facility-b')) }],
  ['cross-kind duplicate ID', m => { m.facilities[0].zones[0].id = m.facilities[0].id }],
]
for (const [name, change] of invalid) test(`reject ${name}`, () => {
  const input = master(), replacement = change(input)
  const result = validate(replacement === undefined ? input : replacement)
  assert.equal(result.ok, false); assert.ok(result.errors.length > 0)
  assert.ok(result.errors.every(e => e.path.startsWith('$')))
})
test('aggregate errors with facility/zone ID and JSON path', () => {
  const m = master(); m.facilities[0].name = ' '; m.facilities[0].zones[0].sourceUrl = 123
  const r = validate(m); assert.equal(r.errors.length, 2)
  assert.equal(r.errors[0].facilityId, 'official:facility-a'); assert.equal(r.errors[1].zoneId, 'official:zone-a')
})
test('known research metadata stripped and individually reported; unknown metadata fails', () => {
  const m = master(); m.status = 'research'; m.notes = ['調査']; m.facilities[0].researchStatus = 'pending'
  const r = validate(m); assert.equal(r.warnings.length, 3); assert.deepEqual(accepted(r), master())
  assert.equal(canonicalize(m).value, canonicalize(master()).value)
})
test('valid calendar leap date, URLs and every enumerated type/status', () => {
  const m = master(); m.facilities[0].verifiedAt = '2024-02-29'; m.facilities[0].officialUrl = 'https://example.invalid/'
  m.facilities[0].sourceUrl = 'http://example.invalid/source'; m.facilities[0].facilityTypes = ['pond', 'stream', 'pool', 'managed_river']
  for (const status of ['open', 'seasonal', 'temporarily_closed', 'closed', 'unknown']) { m.facilities[0].operationStatus = status; accepted(validate(m)) }
})
test('flatten adds exact parent ID and stable ID tie break, preserves zero and negative sort order', () => {
  const m = master(); m.facilities[0].zones = [zone('official:z'), zone('official:a'), { ...zone('official:zero'), sortOrder: 0 }, { ...zone('official:negative'), sortOrder: -1 }]
  freeze(m); const f = accepted(flatten(m))
  assert.deepEqual(f.zones.map(z => z.id), ['official:negative', 'official:zero', 'official:a', 'official:z'])
  assert.ok(f.zones.every(z => z.facilityId === m.facilities[0].id && z.origin === 'official'))
  f.facilities[0].facilityTypes.push('stream'); assert.deepEqual(m.facilities[0].facilityTypes, ['pond'])
})
test('canonical JSON ignores key ordering/formatting but treats array order and business content as significant', () => {
  const m = master(); const reordered = JSON.parse(JSON.stringify(m, null, 4)); reordered.facilities[0] = Object.fromEntries(Object.entries(reordered.facilities[0]).reverse())
  assert.equal(accepted(canonicalize(m)), accepted(canonicalize(reordered)))
  reordered.facilities[0].name = '別の架空名'; assert.notEqual(canonicalize(m).value, canonicalize(reordered).value)
  m.facilities[0].aliases = ['a', 'b']; reordered.facilities[0].name = m.facilities[0].name; reordered.facilities[0].aliases = ['b', 'a']
  assert.notEqual(canonicalize(m).value, canonicalize(reordered).value)
})
test('initial plan and repeat are idempotent, immutable and do not touch user rows', () => {
  const m = freeze(master()), empty = freeze({ facilities: [], zones: [] })
  const first = accepted(plan(empty, m)); assert.equal(first.facilities.added.length, 1); assert.equal(first.zones.added.length, 1)
  const state = stateOf(first); state.facilities.push({ id: 'user:facility', origin: 'user', name: 'ユーザー架空施設' })
  state.zones.push({ id: 'user:zone', origin: 'user', facilityId: 'official:facility-a', name: 'ユーザー架空エリア' }); freeze(state)
  const second = accepted(plan(state, m)); assert.equal(second.facilities.unchanged.length, 1); assert.equal(second.zones.unchanged.length, 1)
  for (const table of ['facilities', 'zones']) for (const action of ['added', 'updated', 'retired', 'unchanged']) assert.ok(second[table][action].every(r => r.origin === 'official'))
})
test('rename keeps IDs, upsert and retirement preserve rows, retired reappears, user zone remains untouched', () => {
  const original = master(); original.facilities.push(facility('official:removed', [zone('official:removed-zone')]))
  const state = stateOf(accepted(plan({ facilities: [], zones: [] }, original)))
  state.zones.push({ id: 'user:kept-zone', origin: 'user', facilityId: 'official:removed' })
  const next = master(); next.releaseOrder = 2; next.masterVersion = 'sample-2'; next.facilities[0].name = '改名された架空施設'
  next.facilities[0].zones[0].name = '改名された架空エリア'; next.facilities.push(facility('official:new', []))
  freeze(state); const r = accepted(plan(state, next))
  assert.equal(r.facilities.updated[0].id, 'official:facility-a'); assert.equal(r.zones.updated[0].id, 'official:zone-a')
  assert.equal(r.facilities.added.length, 1); assert.equal(r.facilities.retired[0].catalogState, 'retired'); assert.equal(r.zones.retired.length, 1)
  assert.equal(state.zones.at(-1).id, 'user:kept-zone')
  const repeat = accepted(plan(stateOf(r), next)); assert.equal(repeat.facilities.retired.length, 0)
  original.releaseOrder = 3; original.masterVersion = 'sample-3'
  assert.ok(accepted(plan(stateOf(r), original)).facilities.updated.some(f => f.id === 'official:removed' && f.catalogState === 'listed'))
})
test('reject rollback and same release different content, ignore masterVersion lexicographic order', () => {
  const state = stateOf(accepted(plan({ facilities: [], zones: [] }, master())))
  const next = master(); next.facilities[0].name = 'changed'; assert.equal(plan(state, next).ok, false)
  next.releaseOrder = 2; next.masterVersion = 'a'; const newer = accepted(plan(state, next))
  assert.equal(plan(stateOf(newer), master()).ok, false)
})
test('reject moved zone, user origin/official ID conflict, snapshot duplicates and missing parent', () => {
  const state = stateOf(accepted(plan({ facilities: [], zones: [] }, master())))
  const next = master(); next.releaseOrder = 2; next.facilities[0].zones = []; next.facilities.push(facility('official:b'))
  assert.equal(plan(state, next).ok, false)
  assert.equal(plan({ facilities: [{ ...state.facilities[0], origin: 'user' }], zones: [] }, master()).ok, false)
  assert.equal(plan({ facilities: [...state.facilities, ...state.facilities], zones: [] }, master()).ok, false)
  assert.equal(plan({ facilities: [], zones: state.zones }, master()).ok, false)
})
test('no retirement plan for partial, draft, empty or unknown-field distributions', () => {
  const state = stateOf(accepted(plan({ facilities: [], zones: [] }, master())))
  for (const distributionMode of ['partial', 'full_snapshot_draft', undefined]) assert.equal(plan(state, { ...master(), distributionMode }).ok, false)
  assert.equal(plan(state, { ...master(), facilities: [] }).ok, false)
  assert.equal(plan(state, { ...master(), futureField: 'unapproved' }).ok, false)
})
test('reject malformed snapshots and official rows rather than planning corrupt retirement', () => {
  const valid = stateOf(accepted(plan({ facilities: [], zones: [] }, master())))
  for (const snapshot of [null, {}, { facilities: null, zones: [] }, { facilities: [null], zones: [] },
    { facilities: [{ ...valid.facilities[0], name: 123 }], zones: valid.zones },
    { facilities: valid.facilities, zones: [{ ...valid.zones[0], catalogState: 'bad' }] },
    { ...valid, applied: { releaseOrder: 0, masterVersion: 'a', canonicalContent: '{}' } }]) {
    assert.equal(plan(snapshot, master()).ok, false)
  }
})
test('fixed IDs cannot be reassigned across facility and zone kinds', () => {
  const state = stateOf(accepted(plan({ facilities: [], zones: [] }, master())))
  const next = master(); next.releaseOrder = 2; next.facilities = [facility('official:zone-a', [])]
  assert.equal(plan(state, next).ok, false)
  next.facilities = [facility('official:new', [zone('official:facility-a')])]
  assert.equal(plan(state, next).ok, false)
})
