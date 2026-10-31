import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createRc32Runtime } from '../scripts/lib/rc32Runtime.mjs'

const runtime = await createRc32Runtime()
const { db, visualNaturalKey } = runtime.database
const { inferColorName, normalizeColorName } = runtime.inference
const { planAutoColors, previewAutoColors, applyAutoColors } = runtime.importer
const { createBackup, importBackup, validateBackup } = runtime.backup
const state = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
const names = ['赤金', '黒金', 'クリアピンク', '蛍光オレンジ', 'T-4A', 'ひのえ2']
const input = () => ({ lureManufacturers: [{ id: 1, name: 'Synthetic' }], lureSeries: [{ id: 2, manufacturerId: 1, name: 'Series' }],
  lureModels: [{ id: 3, seriesId: 2, name: 'Model', category: 'スプーン' }], lureVariants: names.map((colorName, i) => ({ id: 10 + i, modelId: 3, colorName })), lureVisualProfiles: [] })
beforeEach(async () => {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
    for (const [name, rows] of Object.entries(input())) await db.table(name).bulkAdd(rows)
    await db.trips.add({ id: 1, fishingAreaName: 'Synthetic', fishingDate: '2026-10-31', fishingStyle: 'AREA_TROUT', startedAt: new Date('2026-10-31T00:00:00Z') })
    await db.myLures.add({ id: 2, variantId: 10, active: true, ownershipStatus: 'owned' })
    await db.catches.add({ id: 3, tripId: 1, lureId: 2, lureVariantId: 10, caughtAt: new Date('2026-10-31T00:00:00Z'),
      visualColorSnapshot: runtime.storage.createVisualSnapshot({ version: 1, paletteVersion: 1, layout: 'generic', regions: { whole: { colors: ['blue'], attributes: [] } } }, { origin: 'user', confirmed: true }) })
    await db.tripEvents.add({ id: 4, tripId: 1, type: 'pellet', occurredAt: new Date('2026-10-31T00:00:00Z') })
  })
})
after(async () => { await runtime.dispose() })

for (const [name, expected, attributes = []] of [
  ['赤金', ['red', 'gold']], ['黒金', ['black', 'gold']], ['クロまんじゅう', ['black', 'brown']],
  ['ワカサギ', ['silver', 'blue']], ['ペレット', ['brown']], ['クリアピンク', ['pink'], ['transparent']],
  ['オリーブ', ['olive']], ['蛍光オレンジ', ['orange'], ['fluorescent']], ['ﾀﾞｰｸﾌﾞﾙｰ', ['dark-blue']],
  ['Light Green / GOLD', ['light-green', 'gold']], ['BlackGold', ['black', 'gold']], ['#12 WHITE', ['white']],
  ['T-458 オリーブ', ['olive']], ['半透明ピンク', ['pink'], ['translucent']], ['マットレッドグロー', ['red'], ['matte', 'glow']],
  ['blue pearl', ['blue'], ['pearl']], ['赤金黒', ['red', 'gold', 'black']],
]) test(`name inference: ${name}`, () => {
  const result = inferColorName(name).inference
  assert.ok(result, name); assert.deepEqual(result.appearance.regions.whole.colors, expected)
  assert.deepEqual(result.appearance.regions.whole.attributes, attributes)
  assert.equal(result.origin, 'name'); assert.ok(result.basis.length); assert.ok(result.estimatorVersion)
  assert.equal(result.appearance.layout, 'generic'); assert.equal(result.appearance.regions.whole.pattern, undefined)
})

test('unknown codes, proper names, false substrings and four colors are not forced into a palette', () => {
  for (const name of ['', 'T-4A', 'GL', 'UV', 'ひのえ２', 'かべるね', 'Blueberry', 'グレープ', '赤城', '金太郎', '赤金黒白']) assert.equal(inferColorName(name).inference, undefined, name)
  assert.equal(normalizeColorName(' ｵﾘｰﾌﾞ  Pink '), 'オリーブ pink')
  assert.equal(inferColorName('赤城グロー').inference.appearance.regions.whole.colors.length, 0)
})

test('only explicit patterns/attributes are set; unknown parts stay unset; longest aliases win', () => {
  for (const [name, pattern] of [['レッド斑点', 'spots'], ['青マーブル', 'marble'], ['グラデーションピンク', 'gradient'], ['ツートン赤金', 'two-tone'], ['単色赤', 'single']]) assert.equal(inferColorName(name).inference.appearance.regions.whole.pattern, pattern)
  assert.deepEqual(inferColorName('ゴールド').inference.appearance.regions.whole.attributes, [])
  assert.deepEqual(inferColorName('ダークブラウン').inference.appearance.regions.whole.colors, ['dark-brown'])
  assert.equal(inferColorName('背ブルー').inference.appearance.regions.dorsal, undefined)
})

test('preview is read-only; apply twice is add-only; all original data and snapshots survive v8 round trip', async () => {
  const before = await state(), preview = await previewAutoColors()
  assert.deepEqual([preview.total, preview.added, preview.unknown, preview.photoMatched], [6, 4, 2, 0])
  assert.deepEqual(await state(), before)
  await applyAutoColors(preview.comparisonToken)
  const saved = await state()
  for (const [name, rows] of Object.entries(before)) if (name !== 'lureVisualProfiles') assert.deepEqual(saved[name], rows, name)
  assert.ok(saved.lureVisualProfiles.every(p => p.origin === 'name' && !p.userEdited && !p.confirmed && p.evidence.inputName && p.evidence.basis.length))
  const again = await previewAutoColors(); assert.deepEqual([again.added, again.kept], [0, 4])
  await applyAutoColors(again.comparisonToken); assert.deepEqual(await state(), saved)
  const backup = await createBackup(); assert.equal(backup.version, 8); validateBackup(JSON.parse(JSON.stringify(backup)))
  await importBackup(new File([JSON.stringify(backup)], 'synthetic-auto-v8.json'))
  assert.deepEqual(await state(), saved)
})

test('edited and confirmed profiles are protected, existing inference retained, stale catalog/profile previews rejected', async () => {
  const p = await previewAutoColors(); await applyAutoColors(p.comparisonToken)
  const profiles = await db.lureVisualProfiles.toArray()
  await db.lureVisualProfiles.update(profiles[0].id, { origin: 'user', userEdited: true, confirmed: true })
  await db.lureVisualProfiles.update(profiles[1].id, { confirmed: true })
  const before = await state(), preview = await previewAutoColors()
  assert.deepEqual([preview.protected, preview.kept, preview.added], [2, 2, 0])
  await applyAutoColors(preview.comparisonToken); assert.deepEqual(await state(), before)
  await db.lureVariants.update(10, { colorName: 'ブルー' })
  const changed = await state(); await assert.rejects(applyAutoColors(preview.comparisonToken), /変更/); assert.deepEqual(await state(), changed)
  const another = await previewAutoColors(); await db.lureVisualProfiles.update(profiles[2].id, { revision: 2 })
  await assert.rejects(applyAutoColors(another.comparisonToken), /変更/)
})

test('natural-key duplicates, ID/key conflicts and detached references are held without automatic rebinding', async () => {
  await db.lureVariants.add({ id: 99, modelId: 3, colorName: '赤金' })
  const preview = await previewAutoColors(); assert.equal(preview.held, 2)
  assert.equal(preview.rows.find(r => r.variantId === 10).action, 'hold')
  const s = input(), identity = { manufacturer: 'Synthetic', series: 'Series', model: 'Model', color: { kind: 'name', value: '赤金' } }
  s.lureVisualProfiles.push({ id: crypto.randomUUID(), identity, naturalKey: visualNaturalKey(identity), appearance: inferColorName('赤金').inference.appearance,
    origin: 'name', userEdited: false, confirmed: false, revision: 1, updatedAt: '2026-10-31T00:00:00.000Z' })
  assert.equal(planAutoColors(s).rows[0].action, 'hold')
  s.lureVisualProfiles[0].variantId = 11
  assert.equal(planAutoColors(s).rows[0].action, 'hold')
  s.lureVariants[0].modelId = 999; assert.equal(planAutoColors(s).rows[0].action, 'hold')
})

test('English leading words are names, explicit alphabetic codes remain valid, and legacy keys are held without rewriting', async () => {
  const s = input()
  s.lureVariants = [{ id: 10, modelId: 3, colorName: 'All Brown' }, { id: 11, modelId: 3, colorName: 'All Glow' }]
  let p = planAutoColors(s)
  assert.equal(p.held, 0); assert.equal(p.added, 2)
  assert.equal(p.rows[0].identity.color.kind, 'name')
  s.lureVariants[0].catalogEvidence = { colorCode: 'BGB', originalName: 'All Brown' }
  p = planAutoColors(s); assert.deepEqual(p.rows[0].identity.color, { kind: 'code', value: 'BGB' })
  delete s.lureVariants[0].catalogEvidence
  const legacyIdentity = { manufacturer: 'Synthetic', series: 'Series', model: 'Model', color: { kind: 'code', value: 'All' } }
  s.lureVisualProfiles = [{ id: crypto.randomUUID(), variantId: 10, identity: legacyIdentity, naturalKey: visualNaturalKey(legacyIdentity),
    appearance: inferColorName('All Brown').inference.appearance, origin: 'user', userEdited: true, confirmed: true, revision: 1, updatedAt: '2026-10-31T00:00:00.000Z' }]
  const frozen = structuredClone(s); p = planAutoColors(s)
  assert.equal(p.rows[0].action, 'hold'); assert.deepEqual(s, frozen)
})

test('mid-batch failure rolls back every addition; a later retry succeeds', async () => {
  const before = await state(), p = await previewAutoColors(); let count = 0
  const fail = () => { if (++count === 3) throw new Error('synthetic auto batch failure') }
  db.lureVisualProfiles.hook('creating', fail)
  try { await assert.rejects(applyAutoColors(p.comparisonToken), /synthetic auto batch failure/) }
  finally { db.lureVisualProfiles.hook('creating').unsubscribe(fail) }
  assert.deepEqual(await state(), before)
  await applyAutoColors(p.comparisonToken); assert.equal(await db.lureVisualProfiles.count(), 4)
})
