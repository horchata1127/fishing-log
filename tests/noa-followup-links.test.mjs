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
const { retailerProductLinkForOption, validateProductUrl } = await loader.load('src/utils/noaPhotoCatalog.ts')
const { noaAdditionalExternalLinks } = await loader.load('src/data/noaExternalReferences.ts')
const { noaRetailerProductLinks } = await loader.load('src/data/noaRetailerProductLinks.ts')
const { noaUnavailableProductLinks } = await loader.load('src/data/noaUnavailableProductLinks.ts')
const { resolveLureExternalReference } = await loader.load('src/utils/lureExternalCatalog.ts')
const latest = JSON.parse(readFileSync('docs/noa-photo-coverage-followup/CATALOG.json', 'utf8'))
const baseline = JSON.parse(readFileSync('docs/noa-photo-coverage-followup/AUDIT.json', 'utf8'))
const snapshot = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
beforeEach(async () => {
  await db.delete(); await db.open()
  const fixture = rc43Fixture()
  Object.assign(fixture.data, { lureManufacturers: latest.manufacturers, lureSeries: latest.series, lureModels: latest.models, lureVariants: latest.variants })
  await importBackup({ text: async () => JSON.stringify(fixture) })
})
after(async () => { db.close(); await db.delete(); await loader.close() })

test('all valid PR45 links remain reachable alongside better model references; retired defaults are replaced without writes', async () => {
  const catalog = await currentPhotoCatalog(), before = await snapshot()
  let kept = 0, added = 0, replaced = 0, supplements = 0, rc47Added = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('Browsing catalog must not fetch external content') }
  try {
    for (const option of catalog) {
      const old = baseline.rows.find(r => r.variantId === option.variantId)
      const result = await resolveColorPhoto(option)
      const urls = [result.externalProductUrl, ...result.additionalProductLinks.map(p=>p.url)]
      const unavailable = noaUnavailableProductLinks.includes(old.productUrl)
      if (old.productUrl && !unavailable) { assert.ok(urls.includes(old.productUrl), option.modelName+'/'+option.colorName); kept++ }
      if (!old.productUrl && result.externalProductUrl) {
        const rc47 = resolveLureExternalReference(option, undefined, true)
        if (rc47?.externalProductUrl === result.externalProductUrl) rc47Added++
        else added++
      }
      if (unavailable && result.externalProductUrl !== old.productUrl) replaced++
      if (old.productUrl && !unavailable && old.productUrl !== result.externalProductUrl) supplements++
    }
  } finally { globalThis.fetch = originalFetch }
  assert.equal(catalog.length,713); assert.equal(kept,361); assert.equal(added,10); assert.equal(rc47Added,9); assert.equal(replaced,17); assert.equal(supplements,124)
  assert.deepEqual(await snapshot(),before)
  for (const name of photoTableNames) assert.equal(await db.table(name).count(),0)
})

test('product-only sources match model, weight, manufacturer and full color name; no image URL can be saved', async () => {
  assert.equal(noaAdditionalExternalLinks.length,45); assert.equal(noaRetailerProductLinks.length,151)
  const catalog = await currentPhotoCatalog()
  const option = catalog.find(o=>o.modelName==='NOA 1.8g'&&o.colorName==='N.03')
  assert.equal(retailerProductLinkForOption(option).externalProductUrl,'https://store.castingnet.jp/shop/g/g4573151242095/')
  assert.equal(retailerProductLinkForOption({...option,manufacturerName:'別メーカー'}),undefined)
  assert.equal(retailerProductLinkForOption({...option,modelName:'NOA 99g'}),undefined)
  assert.equal(retailerProductLinkForOption({...option,colorName:'#1 N.03'}),undefined)
  for (const source of [...noaAdditionalExternalLinks,...noaRetailerProductLinks]) {
    validateProductUrl(source.externalProductUrl)
    assert.deepEqual(Object.keys(source).sort(),['modelName','colorNames','externalProductUrl','sourceName','lastCheckedAt'].sort())
  }
  for (const url of ['https://store.castingnet.jp/img/goods/L/4573151242095.jpg','https://evil.example/shop/g/g4573151242095/','https://store.castingnet.jp/shop/goods/search.aspx?keyword=NOA']) assert.throws(()=>validateProductUrl(url))
})

test('product-page data stays independent of restored image display and retains JOINTER/FORODOX pages', async () => {
  const sources = readFileSync('src/data/noaExternalReferences.ts','utf8')+readFileSync('src/data/noaRetailerProductLinks.ts','utf8')
  assert.doesNotMatch(sources,/imageUrl|noaImageReferences|\.jpg|\.png|yimg\.jp/)
  const component = readFileSync('src/components/LurePhotoDisplay.vue','utf8')
  assert.match(component,/ExternalColorPhoto/)
  assert.doesNotMatch(component,/商品写真を開く|重量共通の色見本を開く/)
  const catalog = await currentPhotoCatalog()
  const black = catalog.find(o=>o.modelName==='NOA Jr. 0.9g'&&o.colorName==='腹黒')
  assert.equal((await resolveColorPhoto(black)).externalProductUrl,'https://www.jointer.jp/product/detail/rodio_craft_noa_noa_jr/')
  const show = catalog.find(o=>o.modelName==='NOA 1.8g'&&o.colorName==='SHOW')
  assert.equal((await resolveColorPhoto(show)).externalProductUrl,'https://store.shopping.yahoo.co.jp/openwater/noa-18-forodox.html')
})

test('user URLs and explicit deletion outrank improved bundled defaults, preserving all user records', async () => {
  const option = (await currentPhotoCatalog()).find(o=>o.modelName==='NOA 1.8g'&&o.colorName==='蛍光ピンク')
  await saveExternalPhotoLink(option,'https://example.com/products/my-pink','自分の出典',true)
  let result = await resolveColorPhoto(option)
  assert.equal(result.externalProductUrl,'https://example.com/products/my-pink')
  assert.ok(result.additionalProductLinks.some(r=>r.url==='https://store.castingnet.jp/shop/g/g4571169082726/'))
  await saveExternalPhotoLink(option,'','',false)
  result=await resolveColorPhoto(option)
  assert.equal(result.externalProductUrl,undefined); assert.deepEqual(result.additionalProductLinks,[])
  assert.equal(await db.lurePhotoBlobs.count(),0)
})
