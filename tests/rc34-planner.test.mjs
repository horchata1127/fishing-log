import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Transpile only the local dependency graph to an isolated temporary directory.
const directory = await mkdtemp(join(tmpdir(), 'fishing-rc34-'))
const modules = new Map()
async function compile(file) {
  file = resolve(file)
  if (modules.has(file)) return modules.get(file)
  const url = pathToFileURL(join(directory, `${modules.size}.mjs`)).href
  modules.set(file, url)
  let code = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  for (const specifier of [...code.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1])) {
    const target = specifier.startsWith('.') ? await compile(resolve(dirname(file), `${specifier}.ts`)) : import.meta.resolve(specifier)
    code = code.replaceAll(`'${specifier}'`, JSON.stringify(target)).replaceAll(`"${specifier}"`, JSON.stringify(target))
  }
  await writeFile(new URL(url), code)
  return url
}
const planner = await import(await compile('src/utils/lureMasterPlanner.ts'))
const { previewLureMaster } = await import(await compile('src/utils/lureMasterPreview.ts'))
const { lureMasterManifest: manifest, validateLureMasterManifest } = await import(await compile('src/data/lureMasterManifest.ts'))
const schema = await import(await compile('src/db/database.ts'))
const { db } = schema
const copy = v => structuredClone(v)
const empty = () => ({ lureManufacturers: [], lureSeries: [], lureModels: [], lureVariants: [], myLures: [], lureVisualProfiles: [] })
const subset = (...targets) => ({ ...copy(manifest), targets: copy(targets), pending: [] })
const palms = () => copy(manifest.targets.find(t => t.model === 'GA-24S'))
function seed(target, ids = [701, 902, 1103]) {
  const s = empty()
  s.lureManufacturers.push({ id: ids[0], name: target.manufacturer })
  s.lureSeries.push({ id: ids[1], name: target.series, manufacturerId: ids[0] })
  s.lureModels.push({ id: ids[2], name: target.model, seriesId: ids[1], weightG: target.weight,
    ...(target.length === undefined ? {} : { lengthMm: target.length }), ...(target.actionType ? { actionType: target.actionType } : {}) })
  return s
}
function populatedParents() {
  const s = empty(); let id = 101
  for (const t of manifest.targets) {
    let m = s.lureManufacturers.find(m => m.name === t.manufacturer)
    if (!m) { m = { id: id++, name: t.manufacturer }; s.lureManufacturers.push(m) }
    if (t.manufacturer !== '1089工房') continue
    let p = s.lureSeries.find(p => p.manufacturerId === m.id && p.name === t.series)
    if (!p) { p = { id: id++, manufacturerId: m.id, name: t.series }; s.lureSeries.push(p) }
    s.lureModels.push({ id: id++, seriesId: p.id, name: t.model, weightG: t.weight })
  }
  return s
}
// Test-only projection of the add-only plan, with fresh positive IDs. Never applies to a browser DB.
function materialize(s, plan) {
  const result = copy(s), ids = new Map(); let id = 10000
  for (const op of plan.additions) {
    const row = copy(op.value), temporary = row.id; row.id = id++
    for (const field of ['manufacturerId', 'seriesId', 'modelId']) if (row[field] < 0) row[field] = ids.get(row[field])
    result[op.table].push(row); ids.set(temporary, row.id)
  }
  for (const row of plan.rows) {
    if (row.catalog === 'hold') continue
    const variantId = ids.get(row.plannedVariantId) ?? row.plannedVariantId
    if (row.ownership === 'add') result.myLures.push({ id: id++, variantId, active: true, ownershipStatus: 'owned' })
    if (row.visual === 'photo' || row.visual === 'name') {
      const variant = result.lureVariants.find(v => v.id === variantId), model = result.lureModels.find(m => m.id === variant.modelId)
      const parent = result.lureSeries.find(p => p.id === model.seriesId), maker = result.lureManufacturers.find(m => m.id === parent.manufacturerId)
      const identity = schema.visualIdentityForVariant(variant, model, parent, maker)
      result.lureVisualProfiles.push({ id: crypto.randomUUID(), variantId, identity, naturalKey: schema.visualNaturalKey(identity),
        appearance: copy(row.appearance), origin: row.visual === 'photo' ? 'photo' : 'name', userEdited: false,
        confirmed: row.visual === 'photo', revision: 1, updatedAt: '2026-11-01T00:00:00.000Z' })
    }
  }
  return result
}
after(async () => {
  db.close(); await db.delete()
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep), 'cleanup must stay inside the temporary directory')
  await rm(directory, { recursive: true, force: true })
})

test('cumulative manifest explicitly merges RC19/20, RC20/21 and RC31/33; all source colors survive', () => {
  assert.equal(manifest.targets.length, 83)
  assert.equal(manifest.targets.reduce((n, t) => n + t.colors.length, 0), 1287)
  assert.equal(manifest.pending.length, 31)
  const sources = manifest.targets.flatMap(t => t.colors.flatMap(c => c.sources))
  for (const [rc, count] of Object.entries({ RC19: 2, RC20: 332, RC21: 282, RC22: 100, RC28: 369, RC30: 140, RC31: 83, RC33: 61, RC37: 203 })) {
    assert.equal(sources.filter(s => s.revision === rc).length, count, rc)
  }
  assert.equal(manifest.targets.flatMap(t => t.colors).reduce((n, c) => n + c.purchase, 0), 11)
  assert.equal(palms().colors.filter(c => c.code === 'MT-933').length, 1)
  assert.deepEqual(palms().revisions, ['RC31', 'RC33'])
  assert.equal(manifest.targets.filter(t => t.revisions.includes('RC21')).every(t => t.allowNewModel), true)
})

test('pure planning is deterministic, does not mutate inputs and retains official PALMS spelling', () => {
  const s = populatedParents(), before = copy(s), original = copy(manifest)
  const p = planner.planLureMaster(s)
  assert.deepEqual(s, before); assert.deepEqual(manifest, original)
  assert.deepEqual(planner.planLureMaster(s), p)
  assert.equal(p.addedColors, 1276); assert.equal(p.heldColors, 11)
  assert.equal(p.photoColors, 29); assert.equal(p.provisionalColors, 12); assert.equal(p.unknownColors, 20)
  assert.ok(p.rows.filter(r => r.visual === 'photo').every(r => r.visualEvidence.sourceUrl && r.visualEvidence.basis.length))
  assert.ok(p.rows.filter(r => r.visual === 'name').every(r => r.visualEvidence.estimatorVersion && r.visualEvidence.basis.length))
  assert.equal(p.addedOwned, 0); assert.equal(p.options.includePurchases, false)
  assert.ok(p.rows.some(r => r.color.name === 'かべるね'))
  assert.ok(p.rows.some(r => r.color.name === 'かるべね'))
})

test('full plan projected in memory is idempotent; existing records, ownership and dictionary remain unchanged', () => {
  const s = populatedParents(), p = planner.planLureMaster(s, { includePurchases: true })
  assert.equal(p.addedOwned, 11)
  const after = materialize(s, p), beforeRepeat = copy(after), again = planner.planLureMaster(after, { includePurchases: true })
  assert.equal(again.additions.length, 0); assert.equal(again.addedColors, 0); assert.equal(again.addedOwned, 0)
  assert.equal(again.photoColors + again.provisionalColors, 0); assert.equal(again.retainedOwned, 11)
  assert.equal(again.heldColors, 11); assert.deepEqual(after, beforeRepeat)
  for (const table of Object.keys(s)) for (const row of s[table]) assert.deepEqual(after[table].find(r => r.id === row.id), row)
  assert.equal(new Set(after.lureVariants.map(v => `${v.modelId}/${v.colorName}`)).size, after.lureVariants.length)
})

test('token includes data, manifest, matching rules and purchase option, but ignores snapshot array/property ordering', () => {
  const s = populatedParents(), token = planner.planLureMaster(s).comparisonToken
  const reordered = Object.fromEntries(Object.entries(s).reverse().map(([k, v]) => [k, v.toReversed().map(r => Object.fromEntries(Object.entries(r).reverse()))]))
  assert.equal(planner.planLureMaster(reordered).comparisonToken, token)
  assert.notEqual(planner.planLureMaster(s, { includePurchases: true }).comparisonToken, token)
  const m = copy(manifest); m.matchingVersion++
  assert.notEqual(planner.planLureMaster(s, {}, m).comparisonToken, token)
  m.targets[0].colors[0].sourceUrl += '?changed'
  assert.notEqual(planner.planLureMaster(s, {}, m).comparisonToken, token)
})

test('ambiguous manufacturers, models and colors hold the whole target without partial additions', () => {
  for (const kind of ['maker', 'model', 'color']) {
    const t = palms(), s = seed(t), c = t.colors[0]
    if (kind === 'maker') s.lureManufacturers.push({ id: 702, name: t.manufacturerAliases[0] ?? t.manufacturer })
    if (kind === 'model') s.lureModels.push({ ...s.lureModels[0], id: 1104 })
    if (kind === 'color') s.lureVariants.push(...[500, 501].map(id => ({ id, modelId: 1103, colorName: c.label })))
    const p = planner.planLureMaster(s, {}, subset(t))
    assert.equal(p.heldColors, t.colors.length, kind); assert.equal(p.additions.length, 0, kind)
  }
})

test('code-less aliases are reused; conflicting explicit code and model attributes are held', () => {
  const t = palms(), c = t.colors[0], s = seed(t)
  s.lureVariants.push({ id: 500, modelId: 1103, colorName: c.name })
  let p = planner.planLureMaster(s, {}, subset(t)); assert.equal(p.retainedColors, 1)
  s.lureVariants[0].catalogEvidence = { revision: 'RC31', colorClass: '', sourceTier: 'manufacturer', manufacturerUrl: '', retailerUrl: '', jan: '', originalName: c.name, colorCode: 'MT-999' }
  p = planner.planLureMaster(s, {}, subset(t)); assert.equal(p.heldColors, t.colors.length); assert.equal(p.additions.length, 0)
  delete s.lureVariants[0].catalogEvidence; s.lureModels[0].weightG = 2.1
  assert.equal(planner.planLureMaster(s, {}, subset(t)).heldColors, t.colors.length)
})

test('two distinct products claiming the same model ID hold both products', () => {
  const t = palms(), other = copy(t)
  other.model = '別商品'; other.modelAliases = [t.model]
  other.key = JSON.stringify([other.manufacturer, other.series, other.model].map(s => s.normalize('NFKC').replace(/\s/g, '').toLowerCase()))
  const p = planner.planLureMaster(seed(t), {}, subset(t, other))
  assert.equal(p.heldColors, t.colors.length * 2); assert.equal(p.additions.length, 0)
})

test('model-scoped codes stay separate, and wrong-series aliases do not create another model', () => {
  const targets = manifest.targets.filter(t => t.manufacturer === 'PALMS')
  const s = materialize(empty(), planner.planLureMaster(empty(), {}, subset(...targets)))
  assert.equal(s.lureVariants.length, 83)
  assert.equal(planner.planLureMaster(s, {}, subset(...targets)).addedColors, 0)
  const t = palms(), bad = seed(t); bad.lureSeries[0].name = '別シリーズ'
  assert.equal(planner.planLureMaster(bad, {}, subset(t)).heldColors, t.colors.length)
})

test('RC21/22 resolve arbitrary manufacturer IDs; unreviewed models and SSS stay held', () => {
  const t = copy(manifest.targets.find(t => t.revisions.includes('RC21'))), s = seed(t)
  assert.equal(planner.planLureMaster(s, {}, subset(t)).heldColors, 0)
  const barbie = copy(manifest.targets.find(t => t.rule === 'barbie' && t.productVerified))
  assert.equal(planner.planLureMaster(seed(barbie), {}, subset(barbie)).heldColors, 0)
  const unverified = copy(manifest.targets.find(t => t.rule === 'barbie' && !t.productVerified))
  assert.equal(planner.planLureMaster(seed(unverified), {}, subset(unverified)).heldColors, unverified.colors.length)
  const restricted = copy(manifest.targets.find(t => t.manufacturer === '1089工房'))
  const missing = seed(restricted); missing.lureModels = []
  assert.equal(planner.planLureMaster(missing, {}, subset(restricted)).addedModels, 0)
})

test('classified JAN/name/class conflicts are held and partial plans are discarded', () => {
  const t = copy(manifest.targets.find(t => t.rule === 'classified' && t.colors.some(c => c.jan))), c = t.colors.find(c => c.jan)
  for (const kind of ['jan-name', 'class', 'jan-other-model']) {
    const s = seed(t)
    const v = { id: 500, modelId: 1103, colorName: c.label, catalogEvidence: { revision: 'RC28', originalName: c.name,
      jan: c.jan, colorClass: c.colorClass, sourceTier: c.sourceTier, manufacturerUrl: c.manufacturerUrl, retailerUrl: c.retailerUrl } }
    if (kind === 'jan-name') v.colorName = '別の色'
    if (kind === 'class') v.catalogEvidence.colorClass = '別区分'
    if (kind === 'jan-other-model') v.modelId = 999
    s.lureVariants.push(v)
    const p = planner.planLureMaster(s, {}, subset(t))
    assert.equal(p.heldColors, t.colors.length, kind); assert.equal(p.additions.length, 0, kind)
  }
})

test('USSA numbers reused across limited classes remain distinct on repeat', () => {
  const targets = manifest.targets.filter(t => t.revisions.includes('RC30')), s = empty()
  s.lureManufacturers.push({ id: 770, name: 'RODIO CRAFT' })
  const first = planner.planLureMaster(s, {}, subset(...targets))
  assert.equal(first.addedColors, 140); assert.equal(first.heldColors, 0)
  const again = planner.planLureMaster(materialize(s, first), {}, subset(...targets))
  assert.equal(again.addedColors, 0); assert.equal(again.heldColors, 0)
})

test('RC33 inactive/unverified ownership and every existing visual profile are protected', () => {
  const t = copy(manifest.targets.find(t => t.model === 'くるん タイプ1'))
  const s = materialize(empty(), planner.planLureMaster(empty(), { includePurchases: true }, subset(t)))
  s.myLures.forEach(m => { m.active = false; m.ownershipStatus = 'unverified' })
  s.lureVisualProfiles.forEach(p => { p.origin = 'user'; p.userEdited = true; p.confirmed = true })
  const before = copy(s), p = planner.planLureMaster(s, { includePurchases: true }, subset(t))
  assert.equal(p.addedOwned, 0); assert.equal(p.retainedOwned, 5)
  assert.equal(p.rows.filter(r => r.visual === 'keep').length, 13); assert.deepEqual(s, before)
  delete s.lureVisualProfiles[0].variantId
  const held = planner.planLureMaster(s, { includePurchases: true }, subset(t))
  assert.equal(held.heldColors, 13); assert.equal(held.addedOwned, 0); assert.equal(held.additions.length, 0)
})

test('virtual parent dependencies settle within one plan even if supplying pack is later', () => {
  const p = planner.planLureMaster(empty())
  assert.ok(p.rows.some(r => r.manufacturer === 'TIMON' && r.model.includes('Tearo') && r.catalog === 'add'))
  const after = materialize(empty(), p), again = planner.planLureMaster(after)
  assert.equal(again.additions.length, 0); assert.equal(again.photoColors + again.provisionalColors, 0)
})

test('manifest duplicates and invalid snapshot IDs are rejected before planning', () => {
  const t = palms(), m = subset(t, t)
  assert.throws(() => validateLureMasterManifest(m), /モデル重複/)
  const duplicate = subset(t); duplicate.targets[0].colors.push(copy(t.colors[0]))
  assert.throws(() => planner.planLureMaster(empty(), {}, duplicate), /カラー重複/)
  const s = seed(t); s.lureManufacturers[0].id = -1
  assert.throws(() => planner.planLureMaster(s), /ID/)
  const codes = subset(t); codes.targets[0].colors.push({ ...copy(t.colors[0]), code: 'ＡＬ９２８' })
  assert.throws(() => validateLureMasterManifest(codes), /カラー重複/)
})

test('preview uses a read-only IndexedDB transaction and leaves every store unchanged', async () => {
  await db.delete(); await db.open()
  const s = populatedParents()
  for (const [name, rows] of Object.entries(s)) await db.table(name).bulkAdd(rows)
  const state = () => Promise.all(db.tables.map(async t => [t.name, await t.toArray()]))
  const before = await state(), write = () => { throw new Error('preview must never write') }
  for (const t of db.tables) for (const event of ['creating', 'updating', 'deleting']) t.hook(event, write)
  try {
    const p = await previewLureMaster({ includePurchases: true })
    assert.equal(p.addedColors, 1276); assert.equal(p.addedOwned, 11)
    assert.deepEqual(await state(), before)
    assert.equal(db.verno, 10); assert.equal(db.tables.length, 22)
  } finally {
    for (const t of db.tables) for (const event of ['creating', 'updating', 'deleting']) t.hook(event).unsubscribe(write)
  }
})

test('the unified planner preserves actual legacy RC33 import results in an isolated DB', async () => {
  const legacy = await import(await compile('src/utils/rc33Catalog.ts'))
  await db.delete(); await db.open()
  for (const [name, rows] of Object.entries(populatedParents())) await db.table(name).bulkAdd(rows)
  const checked = await legacy.previewRc33Catalog()
  assert.equal(checked.addedColors, 61)
  await legacy.applyRc33Catalog(checked.comparisonToken)
  const before = await Promise.all(db.tables.map(async t => [t.name, await t.toArray()]))
  const unified = await previewLureMaster({ includePurchases: true })
  assert.equal(unified.retainedColors, 61); assert.equal(unified.addedColors, 1215)
  assert.equal(unified.addedOwned, 0); assert.equal(unified.retainedOwned, 11)
  assert.equal(unified.photoColors + unified.provisionalColors, 0)
  assert.deepEqual(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])), before)
})
