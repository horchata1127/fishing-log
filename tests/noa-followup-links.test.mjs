import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'
const loader = await localTypeScript()
const { db } = await loader.load('src/db/database.ts')
const { importBackup } = await loader.load('src/utils/backup.ts')
const { rc43Fixture } = await loader.load('tests/rc43Fixture.ts')
const { currentPhotoCatalog, resolveColorPhoto, saveExternalPhotoLink, photoTableNames } = await loader.load('src/utils/lurePhotos.ts')
const { modelProductLinkForOption, imageReferenceForOption, validateProductUrl } = await loader.load('src/utils/noaPhotoCatalog.ts')
const { noaAdditionalExternalLinks, noaImageReferences } = await loader.load('src/data/noaExternalReferences.ts')
const latest = JSON.parse(readFileSync('docs/noa-photo-coverage-followup/CATALOG.json', 'utf8'))
const baseline = JSON.parse(readFileSync('docs/noa-color-photos/AUDIT.json', 'utf8'))
const snapshot = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
beforeEach(async () => {
  await db.delete(); await db.open()
  const fixture = rc43Fixture()
  Object.assign(fixture.data, { lureManufacturers: latest.manufacturers, lureSeries: latest.series, lureModels: latest.models, lureVariants: latest.variants })
  await importBackup({ text: async () => JSON.stringify(fixture) })
})
after(async () => { db.close(); await db.delete(); await loader.close() })

test('all 333 original link rows including the prior 73 remain byte-for-byte equal; all additions are read-only', async () => {
  const catalog = await currentPhotoCatalog(), before = await snapshot()
  assert.equal(catalog.length, 713)
  let kept = 0, added = 0, images = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('Links must not fetch images or product HTML') }
  try {
    for (const option of catalog) {
      const old = baseline.rows.find(r => r.variantId === option.variantId)
      const result = await resolveColorPhoto(option)
      if (old.externalProductUrl) { assert.equal(result.externalProductUrl, old.externalProductUrl, option.modelName + '/' + option.colorName); kept++ }
      else if (result.externalProductUrl) added++
      if (result.imageReference) images++
    }
  } finally { globalThis.fetch = originalFetch }
  assert.equal(kept, 333); assert.equal(added, 45); assert.equal(images, 118)
  assert.deepEqual(await snapshot(), before)
  for (const name of photoTableNames) assert.equal(await db.table(name).count(), 0)
})

test('FORODOX retains 2026 collaboration, exact weight URL and common sample; no regular color number substitution', async () => {
  const catalog = await currentPhotoCatalog()
  const family = noaAdditionalExternalLinks.filter(l => l.sourceName === 'オープンウォーター')
  assert.equal(family.length, 24)
  const expected = new Map([['NOA 1.5g', 'noa-15'], ['NOA 1.8g', 'noa-18'], ['NOA S 1.0g', 'noa-s10'], ['NOA S 1.4g', 'noa-s14']])
  for (const source of family) {
    assert.match(source.externalProductUrl, new RegExp('/'+expected.get(source.modelName)+'-forodox.html$'))
    const option = catalog.find(o => o.modelName === source.modelName && o.colorName === source.colorNames[0])
    assert.ok(option)
    const result = await resolveColorPhoto(option)
    assert.equal(result.imageReference.imageKind, 'weight-common-color-sample')
    assert.equal(modelProductLinkForOption({ ...option, colorName: '#1 ' + option.colorName }), undefined)
    assert.equal(imageReferenceForOption({ ...option, modelName: 'NOA 2.1g' }), undefined)
    assert.equal(imageReferenceForOption({ ...option, manufacturerName: '別メーカー' }), undefined)
  }
})

test('JOINTER front/back samples keep black variants separate and do not classify glow descriptions as a color', async () => {
  const catalog = await currentPhotoCatalog()
  for (const modelName of ['NOA Jr. 0.9g', 'NOA Jr. 1.2g', 'NOA Jr. 1.4g']) {
    const black = catalog.find(o => o.modelName === modelName && o.colorName === '腹黒')
    const second = catalog.find(o => o.modelName === modelName && o.colorName.normalize('NFKC') === '腹黒II')
    assert.notEqual(imageReferenceForOption(black).imageUrl, imageReferenceForOption(second).imageUrl)
    assert.equal(imageReferenceForOption({ ...black, colorName: '背面グリーングロー' }), undefined)
    assert.equal(imageReferenceForOption({ ...black, modelName: 'NOA 1.8g' }), undefined)
  }
})

test('user links and explicit deletion win over supplied image references; no remote URLs are treated as local photos', async () => {
  const option = (await currentPhotoCatalog()).find(o => o.modelName === 'NOA 1.8g' && o.colorName === 'エルドラド')
  assert.ok((await resolveColorPhoto(option)).imageReference)
  await saveExternalPhotoLink(option, 'https://example.com/products/my-eldorado', '自分の出典', true)
  assert.equal((await resolveColorPhoto(option)).imageReference, undefined)
  await saveExternalPhotoLink(option, '', '', false)
  assert.equal((await resolveColorPhoto(option)).externalProductUrl, undefined)
  assert.equal((await resolveColorPhoto(option)).imageReference, undefined)
  for (const source of noaImageReferences) {
    validateProductUrl(source.externalProductUrl)
    const url = new URL(source.imageUrl)
    assert.equal(url.protocol, 'https:'); assert.equal(url.username, ''); assert.equal(url.password, '')
  }
  assert.equal(await db.lurePhotoBlobs.count(), 0)
})
