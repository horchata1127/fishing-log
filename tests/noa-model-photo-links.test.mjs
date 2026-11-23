import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test, after, beforeEach } from 'node:test'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'
const loader = await localTypeScript()
const { db } = await loader.load('src/db/database.ts')
const { rc43Fixture } = await loader.load('tests/rc43Fixture.ts')
const { importBackup } = await loader.load('src/utils/backup.ts')
const { currentPhotoCatalog, resolveColorPhoto, saveExternalPhotoLink, createPhotoBackup } = await loader.load('src/utils/lurePhotos.ts')
const { modelProductLinkForOption, validateProductUrl } = await loader.load('src/utils/noaPhotoCatalog.ts')
const { noaModelExternalLinks } = await loader.load('src/data/noaModelExternalLinks.ts')
beforeEach(async () => { await db.delete(); await db.open(); await importBackup({ text: async () => JSON.stringify(rc43Fixture()) }) })
after(async () => { db.close(); await db.delete(); await loader.close() })

test('reviewed links have unique exact model/color keys and accept only individual product URLs', () => {
  assert.ok(noaModelExternalLinks.length > 0)
  const keys = new Set()
  for (const link of noaModelExternalLinks) {
    validateProductUrl(link.externalProductUrl)
    for (const color of link.colorNames) {
      const key = JSON.stringify([link.modelName, color])
      assert.ok(!keys.has(key), key); keys.add(key)
    }
  }
})

test('model defaults are read only, survive reload, and never override saved user links or explicit removal', async () => {
  const catalog = await currentPhotoCatalog()
  const option = catalog.find(c => modelProductLinkForOption(c))
  assert.ok(option)
  const original = Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
  const expected = modelProductLinkForOption(option).externalProductUrl
  assert.equal((await resolveColorPhoto(option)).externalProductUrl, expected)
  db.close(); await db.open()
  assert.equal((await resolveColorPhoto(option)).externalProductUrl, expected)
  for (const t of db.tables) assert.deepEqual(await t.toArray(), original[t.name], t.name)
  await saveExternalPhotoLink(option, 'https://example.com/products/user-common', '自分のリンク', true)
  assert.equal((await resolveColorPhoto(option)).externalProductUrl, 'https://example.com/products/user-common')
  await saveExternalPhotoLink(option, 'https://example.com/products/user-model', '自分のモデルリンク', true, true)
  assert.equal((await resolveColorPhoto(option)).externalProductUrl, 'https://example.com/products/user-model')
  const backup = await createPhotoBackup()
  assert.equal(backup.photos.length, 1)
  assert.equal(backup.blobs.length, 0)
  await saveExternalPhotoLink(option, '', '', false, true)
  await saveExternalPhotoLink(option, '', '', false)
  assert.equal((await resolveColorPhoto(option)).externalProductUrl, undefined)
})

test('weight, manufacturer, regular numbers and collaboration names cannot borrow scoped links', async () => {
  const catalog = await currentPhotoCatalog()
  const option = catalog.find(c => modelProductLinkForOption(c))
  assert.ok(option)
  assert.equal(modelProductLinkForOption({ ...option, modelName: 'NOA 99g' }), undefined)
  assert.equal(modelProductLinkForOption({ ...option, manufacturerName: '別メーカー' }), undefined)
  for (const colorName of ['#1 シルバー', '#2 ゴールド', '2026 FORODOX', '#1 ゲンちゃんブラウニー', 'エルドラド風']) {
    assert.equal(modelProductLinkForOption({ ...option, colorName }), undefined)
  }
})
