import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test, after, beforeEach } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-stage6-pr4-'))
const sources = { database: 'db/database', facilityMaster: 'utils/facilityMaster', facilityStorage: 'utils/facilityStorage',
  backup: 'utils/backup', facilityRelease: 'utils/facilityRelease', stage6FacilityRelease: 'data/stage6FacilityRelease' }
const paths = Object.fromEntries(Object.keys(sources).map(n => [n, join(directory, `${n}.mjs`)]))
for (const [name, source] of Object.entries(sources)) {
  let code = ts.transpileModule(await readFile(new URL(`../src/${source}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  code = code.replace("'dexie'", JSON.stringify(import.meta.resolve('dexie')))
  for (const [dependency, target] of Object.entries(sources)) {
    for (const prefix of ['./', '../db/', '../utils/', '../data/']) code = code.replaceAll(`'${prefix}${target.split('/').at(-1)}'`, JSON.stringify(pathToFileURL(paths[dependency]).href))
  }
  await writeFile(paths[name], code)
}
const load = name => import(pathToFileURL(paths[name]).href)
const { db } = await load('database')
const { applyFacilityMaster } = await load('facilityStorage')
const { validateFacilityMaster, planFacilityMasterUpdate, canonicalizeFacilityMaster } = await load('facilityMaster')
const { initializeFacilityRelease } = await load('facilityRelease')
const { createBackup, importBackup } = await load('backup')
const json = async name => JSON.parse(await readFile(new URL(`../docs/stage6-pr4/${name}`, import.meta.url), 'utf8'))
const master = await json('facility-master.candidate.json'), research = await json('research-source.json'), audit = await json('audit.json')
const copy = v => JSON.parse(JSON.stringify(v))
const state = async () => copy(Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()]))))
async function seedLegacy() {
  const records = {
    trips: { id: 40, fishingAreaName: '自由入力の過去釣行', fishingDate: '2026-10-11', startedAt: new Date('2026-10-11T00:00:00Z') },
    catches: { id: 40, tripId: 40, caughtAt: new Date('2026-10-11T00:00:00Z'), lureId: 40, lureVariantId: 40, resultType: 'lost', lostDistance: 'near' },
    tripEvents: { id: 40, tripId: 40, type: 'stocking', occurredAt: new Date() },
    lureManufacturers: { id: 40, name: 'テストメーカー' }, lureSeries: { id: 40, manufacturerId: 40, name: 'テストシリーズ' },
    lureModels: { id: 40, seriesId: 40, name: 'テストモデル', weightG: 1.5 }, lureVariants: { id: 40, modelId: 40, colorName: '赤' },
    myLures: { id: 40, variantId: 40, active: true, ownershipStatus: 'owned' },
    rods: { id: 40, manufacturer: 'テスト', modelName: 'ロッド', active: true },
    reels: { id: 40, manufacturer: 'テスト', modelName: 'リール', mainLineId: 40, active: true },
    lines: { id: 40, material: 'ナイロン', strengthLb: 3.5, active: true },
    tackleSets: { id: 40, name: 'セット', rodId: 40, reelId: 40, active: true },
    fishSpecies: { fish_id: 'test:fish', group: 'ニジマス', display_name: 'テスト魚', aliases: '', region: '', lineage_or_type: '', source_status: '', notes: '', source_url: '', active: true, origin: 'user' },
  }
  for (const [name, record] of Object.entries(records)) await db.table(name).put(record)
}
beforeEach(async () => { await db.open(); for (const t of db.tables) await t.clear() })
after(async () => { db.close(); await rm(directory, { recursive: true }) })

test('PR4 candidate: formal validation, 50/73, stable IDs, NFC names, order uniqueness and research provenance', async () => {
  assert.equal(validateFacilityMaster(master).ok, true)
  assert.equal(validateFacilityMaster(research).ok, false)
  const bytes = await readFile(new URL('../docs/stage6-pr4/research-source.json', import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), audit.sources[1].sha256)
  const candidateBytes = await readFile(new URL('../docs/stage6-pr4/facility-master.candidate.json', import.meta.url))
  assert.equal(createHash('sha256').update(candidateBytes).digest('hex'), audit.candidateSha256)
  assert.equal(master.facilities.length, 50)
  assert.equal(master.facilities.flatMap(f => f.zones).length, 73)
  const ids = master.facilities.flatMap(f => [f.id, ...f.zones.map(z => z.id)])
  assert.equal(new Set(ids).size, 123)
  assert.deepEqual(ids, research.facilities.flatMap(f => [f.id, ...f.zones.map(z => z.id)]))
  assert.equal(new Set(master.facilities.map(f => f.name.normalize('NFC'))).size, 50)
  for (const f of master.facilities) {
    assert.equal(new Set(f.zones.map(z => z.name.normalize('NFC'))).size, f.zones.length)
    assert.equal(new Set(f.zones.map(z => z.sortOrder)).size, f.zones.length)
    const original = research.facilities.find(o => o.id === f.id)
    for (const key of ['verifiedAt', 'operationStatus', 'lureAllowed', 'address']) assert.deepEqual(f[key], original[key])
  }
  const zones = master.facilities.find(f => f.id === 'official:nihon-iwana-center').zones
  assert.deepEqual(zones.map(z => z.name), ['ZERO号池第2', 'ZERO号池第1', '1号池', '2号池', '3・4号池', '5・6号池', '7号池', '8号池', '9号池'])
  assert.equal(master.facilities.flatMap(f => f.zones).find(z => z.id === audit.correction.zoneId).sortOrder, 5)
  const plan = planFacilityMasterUpdate({ facilities: [], zones: [] }, master)
  assert.equal(plan.ok, true)
  assert.equal(plan.value.facilities.added.length, 50); assert.equal(plan.value.zones.added.length, 73)
  assert.equal(plan.value.applied.canonicalContent, canonicalizeFacilityMaster(master).value)
  assert.equal(plan.value.applied.releaseOrder, 1)
})

test('PR4 pending gate never accesses DB; startup apply failure leaves records intact', async () => {
  const original = db.transaction
  db.transaction = () => { throw new Error('No DB access allowed while pending') }
  try { assert.equal(await initializeFacilityRelease(), undefined) } finally { db.transaction = original }
  await db.trips.put({ id: 90, fishingAreaName: '過去自由入力', fishingDate: '2026-10-18', startedAt: new Date() })
  const before = await state()
  assert.match(await initializeFacilityRelease({ status: 'approved', master: research }), /更新できません/)
  assert.deepEqual(await state(), before)
  const hook = () => { throw new Error('startup write failure') }
  db.zones.hook('creating', hook)
  try { assert.match(await initializeFacilityRelease({ status: 'approved', master }), /startup write failure/) }
  finally { db.zones.hook('creating').unsubscribe(hook) }
  assert.deepEqual(await state(), before)
})

test('PR4 apply concurrent/repeat no-op, same-name user and all 13 legacy stores preserved', async () => {
  await seedLegacy()
  await db.facilities.put({ id: 'user:iwana', name: '日本イワナセンター', origin: 'user' })
  await db.zones.put({ id: 'user:zone', facilityId: 'user:iwana', name: '9号池', origin: 'user' })
  await db.trips.update(40, { facilityId: 'user:iwana', currentZoneId: 'user:zone' })
  await db.catches.update(40, { facilityId: 'user:iwana', zoneId: 'user:zone', locationSnapshot: { facilityName: '過去のユーザー施設名', zoneName: '過去の9号池' } })
  const before = await state()
  await Promise.all([applyFacilityMaster(master), applyFacilityMaster(master)])
  const after = await state()
  for (const name of Object.keys(before).filter(n => !['facilities', 'zones', 'appMetadata'].includes(n))) assert.deepEqual(after[name], before[name])
  assert.deepEqual(after.facilities.find(f => f.id === 'user:iwana'), before.facilities[0])
  assert.deepEqual(after.zones.find(f => f.id === 'user:zone'), before.zones[0])
  await applyFacilityMaster(master); assert.deepEqual(await state(), after)
})

test('PR4 actual candidate v6 round trip preserves all 16 stores and catch/lost snapshots', async () => {
  await seedLegacy()
  await applyFacilityMaster(master)
  const trip = { id: 90, fishingAreaName: '日本イワナセンター', fishingDate: '2026-10-18', startedAt: new Date(), facilityId: 'official:nihon-iwana-center', currentZoneId: 'official:nihon-iwana-center:pond-9' }
  await db.trips.put(trip)
  for (const [id, resultType] of [[90, 'catch'], [91, 'lost']]) await db.catches.put({ id, tripId: 90, caughtAt: new Date(), resultType,
    ...(resultType === 'lost' ? { lostDistance: 'offshore' } : {}), facilityId: trip.facilityId, zoneId: trip.currentZoneId,
    locationSnapshot: { facilityName: '保存時イワセン', zoneName: '保存時9号池' } })
  await db.facilities.put({ id: 'user:iwana', name: '日本イワナセンター', origin: 'user' })
  const backup = await createBackup(), before = await state()
  assert.equal(backup.version, 6); assert.equal(Object.keys(backup.data).length, 16)
  for (const table of db.tables) await table.clear()
  await importBackup(new File([JSON.stringify(backup)], 'isolated-v6.json'))
  assert.deepEqual(await state(), before)
})

for (const kind of ['same-release', 'older', 'move-zone', 'validation', 'mid-write']) test(`PR4 candidate ${kind} rejection changes zero tables`, async () => {
  const m = copy(master)
  if (kind !== 'mid-write' && kind !== 'validation') await applyFacilityMaster({ ...master, releaseOrder: 2 })
  const before = await state()
  if (kind === 'same-release') { m.releaseOrder = 2; m.facilities[0].name += '異内容' }
  if (kind === 'move-zone') { m.releaseOrder = 3; m.facilities[0].zones.push(m.facilities[7].zones.pop()) }
  if (kind === 'validation') m.facilities[0].verifiedAt = '2026-02-30'
  const hook = () => { throw new Error('injected mid-write failure') }
  if (kind === 'mid-write') db.zones.hook('creating', hook)
  try { await assert.rejects(applyFacilityMaster(m)) } finally { if (kind === 'mid-write') db.zones.hook('creating').unsubscribe(hook) }
  assert.deepEqual(await state(), before)
})
