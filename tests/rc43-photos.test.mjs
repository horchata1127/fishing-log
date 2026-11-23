import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'
const loader = await localTypeScript()
const { db } = await loader.load('src/db/database.ts')
const { rc43Fixture, rc43TestPng } = await loader.load('tests/rc43Fixture.ts')
const { importBackup, createBackup } = await loader.load('src/utils/backup.ts')
const { sharedColorForOption, matchesPhotoColorSearch, validateProductUrl } = await loader.load('src/utils/noaPhotoCatalog.ts')
const { noaExternalLinks } = await loader.load('src/data/noaExternalLinks.ts')
const photos = await loader.load('src/utils/lurePhotos.ts')
const { currentPhotoCatalog, saveColorPhoto, deleteColorPhoto, resolveColorPhoto, createPhotoBackup, importPhotoBackup, hashPhoto, photoTableNames, saveExternalPhotoLink } = photos
const draft = { imageType: 'front', sourceUrl: '', sourceName: '合成テスト画像', rightsStatus: 'user-owned', rightsNote: '', verificationStatus: 'verified', modelOnly: false }
const all = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
const counts = async () => Promise.all(photoTableNames.map(n => db.table(n).count()))
const color = async (modelId = 134, name = 'ゴールド') => (await currentPhotoCatalog()).find(c => c.modelId === modelId && c.colorName.replace(/^#\d+\s+/, '') === name)
async function image(r = 210) { const blob = new Blob([rc43TestPng(r)], { type: 'image/png' }); return { id: await hashPhoto(blob), blob, width: 24, height: 16 } }
async function restorePhoto(value) { const text = JSON.stringify(value); return importPhotoBackup({ size: text.length, text: async () => text }) }
beforeEach(async () => { await db.delete(); await db.open(); await importBackup({ text: async () => JSON.stringify(rc43Fixture()) }) })
after(async () => { db.close(); await db.delete(); await loader.close() })

test('native v11 to v12 upgrade preserves all 23 original stores, schemas and sparse IDs and adds four empty photo stores', async () => {
  const { default: Dexie } = await import('dexie')
  const originals = db.tables.filter(t => !photoTableNames.includes(t.name))
  const schema = Object.fromEntries(originals.map(t => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map(i => i.src)].join(',')]))
  await db.delete()
  const legacy = new Dexie(db.name); legacy.version(11).stores(schema); await legacy.open()
  try {
    for (const table of legacy.tables) {
      const pk = table.schema.primKey, keys = Array.isArray(pk.keyPath) ? pk.keyPath : [pk.keyPath]
      await table.add(Object.fromEntries(keys.map(k => [k, pk.auto || k === 'tripId' || k === 'timestamp' ? 900 : `${table.name}:fixture`])))
    }
    const before = Object.fromEntries(await Promise.all(legacy.tables.map(async t => [t.name, await t.toArray()])))
    assert.equal(legacy.tables.length, 23); legacy.close(); await db.open()
    assert.equal(db.verno, 12); assert.equal(db.tables.length, 27)
    for (const [name, rows] of Object.entries(before)) {
      assert.deepEqual(await db.table(name).toArray(), rows, name)
      const table = db.table(name)
      assert.equal([table.schema.primKey.src, ...table.schema.indexes.map(i => i.src)].join(','), schema[name])
    }
    assert.deepEqual(await counts(), [0,0,0,0])
    assert.ok(await db.catches.add({ tripId: 900, caughtAt: new Date() }) > 900)
  } finally { legacy.close() }
})

test('NOA full family has eight populated models, 688 colors; strict grouping protects numbered conflicts and similar labels', async () => {
  const catalog = await currentPhotoCatalog(), groups = catalog.map(sharedColorForOption)
  assert.equal(catalog.length, 688); assert.ok(groups.every(Boolean)); assert.equal(new Set(groups.map(g => g.id)).size, 94)
  const gold = catalog.filter(c => sharedColorForOption(c)?.colorCode === '1')
  assert.equal(gold.length, 8); assert.equal(new Set(gold.map(c => sharedColorForOption(c).id)).size, 1)
  const option = await color()
  assert.equal(sharedColorForOption({ ...option, manufacturerName: '別メーカー' }), undefined)
  assert.equal(sharedColorForOption({ ...option, seriesName: 'MOCA', modelName: 'MOCA 1.8g' }), undefined)
  assert.equal(sharedColorForOption({ ...option, modelName: 'NOA BOSS 5.5g', seriesName: 'NOA BOSS' }).id, sharedColorForOption(option).id)
  assert.notEqual(sharedColorForOption({ ...option, colorName: '#1 シルバー' }).id, sharedColorForOption({ ...option, colorName: '#2 シルバー' }).id)
  assert.notEqual(sharedColorForOption({ ...option, colorName: 'マンゴー/ブラック' }).id, sharedColorForOption({ ...option, colorName: '#50 マンゴー/マットブラック' }).id)
  assert.ok(matchesPhotoColorSearch(option, '#1')); assert.ok(matchesPhotoColorSearch(option, '1')); assert.ok(!matchesPhotoColorSearch(option, '#13'))
  assert.deepEqual(await counts(), [0,0,0,0])
})

test('selected links are 33 unique common colors, one shop and one individual page each; no retailer image binaries', async () => {
  assert.equal(noaExternalLinks.length, 33)
  assert.equal(new Set(noaExternalLinks.map(l => l.colorName)).size, 33)
  assert.equal(new Set(noaExternalLinks.map(l => l.externalProductUrl)).size, 33)
  for (const link of noaExternalLinks) { const url = new URL(validateProductUrl(link.externalProductUrl)); assert.equal(url.hostname, 'fishing-shop-jh.com'); assert.match(url.searchParams.get('pid'), /^\d+$/) }
  const source = JSON.parse(readFileSync('docs/rc43/NOA_LINK_RESEARCH.json', 'utf8'))
  assert.equal(source.candidates.filter(c => c.selected).length, 33)
  assert.ok(source.candidates.every(c => c.localDownload === false && c.rightsStatus === 'unknown'))
  const urls = new Set()
  for (const option of (await currentPhotoCatalog()).filter(c => sharedColorForOption(c).colorCode === '1')) urls.add((await resolveColorPhoto(option)).externalProductUrl)
  assert.deepEqual([...urls], ['https://fishing-shop-jh.com/?pid=190933838'])
  assert.notEqual((await resolveColorPhoto(await color(134, 'ブラック'))).externalProductUrl, [...urls][0])
  for (const url of ['javascript:alert(1)', 'https://example.com/', 'https://example.com/search?q=gold', 'https://fishing-shop-jh.com/?mode=grp&gid=1']) assert.throws(() => validateProductUrl(url))
})

test('one common image is shared by all NOA models, front/back metadata deduplicates bytes and preserves every original row', async () => {
  const before = await all(), option = await color(), blob = await image()
  await saveColorPhoto(option, blob, draft)
  await saveColorPhoto(option, blob, { ...draft, imageType: 'back' })
  assert.deepEqual(await counts(), [1,8,2,1])
  for (const peer of (await currentPhotoCatalog()).filter(c => sharedColorForOption(c).id === sharedColorForOption(option).id)) {
    assert.equal((await resolveColorPhoto(peer)).local[0].blobId, blob.id)
    assert.equal((await resolveColorPhoto(peer, 'back')).local[0].blobId, blob.id)
  }
  const saved = await all()
  for (const [name, rows] of Object.entries(before)) if (!photoTableNames.includes(name)) assert.deepEqual(saved[name], rows, name)
})

test('verified model override wins over common; unverified/other-face photos never replace confirmed common photos', async () => {
  const option = await color(), other = await color(135), common = await image(), model = await image(90)
  await saveColorPhoto(option, common, draft)
  const pending = await saveColorPhoto(other, model, { ...draft, modelOnly: true, verificationStatus: 'unverified' })
  assert.equal((await resolveColorPhoto(other)).local[0].blobId, common.id)
  await saveColorPhoto(other, model, { ...draft, modelOnly: true }, pending)
  assert.equal((await resolveColorPhoto(other)).local[0].blobId, model.id)
  assert.equal((await resolveColorPhoto(option)).local[0].blobId, common.id)
  assert.equal((await resolveColorPhoto(other, 'back')).local.length, 0)
  await saveExternalPhotoLink(other, 'https://example.com/products/noa-gold', '合成リンク', true, true)
  const resolved = await resolveColorPhoto(other)
  assert.equal(resolved.local[0].blobId, model.id); assert.equal(resolved.externalProductUrl, 'https://example.com/products/noa-gold')
  assert.notEqual((await resolveColorPhoto(option)).externalProductUrl, resolved.externalProductUrl)
})

test('replacement, stale-write protection, deletion and blob garbage collection preserve other references', async () => {
  const option = await color(), first = await image(), second = await image(50)
  const front = await saveColorPhoto(option, first, draft), back = await saveColorPhoto(option, first, { ...draft, imageType: 'back' })
  const updated = await saveColorPhoto(option, second, draft, front)
  assert.equal(await db.lurePhotoBlobs.count(), 2)
  await assert.rejects(saveColorPhoto(option, first, draft, front), /変更/)
  await deleteColorPhoto(back); assert.equal(await db.lurePhotoBlobs.count(), 1)
  await deleteColorPhoto(updated); assert.equal(await db.lurePhotoBlobs.count(), 0)
  assert.equal((await resolveColorPhoto(option)).local.length, 0)
  assert.equal((await resolveColorPhoto(option)).externalProductUrl, 'https://fishing-shop-jh.com/?pid=190933838')
})

test('unsafe rights, bad bytes and injected quota errors reject atomically', async () => {
  const option = await color(), before = await all(), blob = await image()
  await assert.rejects(saveColorPhoto(option, blob, { ...draft, rightsStatus: 'unknown' }), /許可/)
  await assert.rejects(saveColorPhoto(option, { ...blob, id: 'wrong-hash' }, draft), /ハッシュ/)
  await assert.rejects(saveColorPhoto(option, { ...blob, width: 1 }, draft), /サイズ/)
  await assert.rejects(saveColorPhoto(option, blob, { ...draft, rightsStatus: 'permitted', rightsNote: '' }), /許可/)
  assert.deepEqual(await all(), before)
  const fail = () => { throw new Error('simulated quota') }
  db.lurePhotoBlobs.hook('creating', fail)
  try { await assert.rejects(saveColorPhoto(option, blob, draft), /quota/) } finally { db.lurePhotoBlobs.hook('creating').unsubscribe(fail) }
  assert.deepEqual(await all(), before)
})

test('v10 JSON stays compatible and excludes Blob stores; old restores preserve photos without assigning reused IDs to other colors', async () => {
  const option = await color(), blob = await image()
  await saveColorPhoto(option, blob, draft)
  await saveColorPhoto(option, await image(70), { ...draft, modelOnly: true })
  const photoState = await counts(), backup = await createBackup()
  assert.ok(!('lurePhotoBlobs' in backup.data)); assert.ok(!('lureColorPhotos' in backup.data))
  await importBackup({ text: async () => JSON.stringify(rc43Fixture()) })
  assert.deepEqual(await counts(), photoState)
  assert.equal((await resolveColorPhoto(await color())).local.length, 2)
  const changed = rc43Fixture(); changed.data.lureVariants.find(v => v.id === option.variantId).colorName = '別の未登録色'
  changed.data.lureVisualProfiles = [] // Valid alternate backup with no SVG profile for the reassigned ID.
  await importBackup({ text: async () => JSON.stringify(changed) })
  assert.equal((await resolveColorPhoto((await currentPhotoCatalog()).find(c => c.variantId === option.variantId))).local.length, 0)
})

test('photo archive preserves one blob, provenance and scopes; repeated import adds nothing and corrupted archives roll back', async () => {
  const option = await color(), blob = await image()
  await saveColorPhoto(option, blob, draft); await saveColorPhoto(option, blob, { ...draft, modelOnly: true })
  const archive = await createPhotoBackup()
  assert.equal(archive.blobs.length, 1); assert.equal(archive.photos.length, 2)
  await db.transaction('rw', photoTableNames.map(n => db.table(n)), async () => { for (const n of photoTableNames) await db.table(n).clear() })
  await restorePhoto(archive); await restorePhoto(archive)
  assert.deepEqual(await counts(), [1,8,2,1])
  const before = await all(), corrupt = structuredClone(archive)
  corrupt.blobs[0].id = 'sha256:' + '0'.repeat(64)
  await assert.rejects(restorePhoto(corrupt), /ハッシュ/); assert.deepEqual(await all(), before)
  const missing = structuredClone(archive); missing.blobs = []
  await assert.rejects(restorePhoto(missing), /参照/); assert.deepEqual(await all(), before)
  const conflict = structuredClone(archive); conflict.photos[0].sourceName = 'modified'
  await assert.rejects(restorePhoto(conflict), /競合/); assert.deepEqual(await all(), before)
})

const deviceBackup = process.env.NOA_DEVICE_BACKUP ?? 'docs/rc42/fishing-log-backup-2026-11-21.json'
test('provided device backup stays byte-identical and photo registration preserves every original table/ID/value', { skip: !existsSync(deviceBackup) }, async () => {
  const raw = readFileSync(deviceBackup), hash = b => createHash('sha256').update(b).digest('hex')
  await importBackup({ text: async () => raw.toString('utf8') })
  const before = await all(), option = await color()
  await saveColorPhoto(option, await image(), draft)
  const after = await all()
  for (const [name, rows] of Object.entries(before)) if (!photoTableNames.includes(name)) assert.deepEqual(after[name], rows, name)
  assert.equal(hash(readFileSync(deviceBackup)), hash(raw))
})
