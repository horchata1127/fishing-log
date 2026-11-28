import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'

const loader = await localTypeScript()
after(() => loader.close())
const { resolveLureExternalReference: resolve } = await loader.load('src/utils/lureExternalCatalog.ts')
const option = { manufacturerName: 'ＴＩＭＯＮ', seriesName: 'Test', modelName: 'Model F',
  modelDetails: { weightG: 1.2, lengthMm: 24, buoyancy: 'F' }, colorName: '#01 Test Color' }
const reference = {
  ...option, manufacturerName: 'TIMON', colorName: 'Test Color', colorCode: '1', colorAliases: ['#01 Test Color'],
  sourceName: 'Fixture', sourceType: 'manufacturer', checkedAt: '2026-11-28',
  evidenceUrl: 'https://example.test/item/model', verificationBasis: 'Synthetic exact model and color',
  product: { url: 'https://example.test/item/model', verified: true },
  image: { url: 'https://images.example.test/color.jpg', verifiedHost: 'images.example.test',
    kind: 'official-color-sample', conditions: 'permitted', conditionsEvidence: 'Synthetic permission', decoded: true },
}
test('matching uses normalized names, explicit color aliases and exact known model specifications', () => {
  assert.equal(resolve(option, [reference]).imageReference.imageUrl, reference.image.url)
  assert.ok(resolve({ ...option, externalColorCode: '#01' }, [reference]))
  assert.equal(resolve({ ...option, externalColorCode: '02' }, [reference]), undefined)
  for (const change of [{ manufacturerName: 'SMITH' }, { seriesName: 'Different' },
    { modelName: 'Model SS' }, { colorName: '#01 Limited Test Color' }, { colorName: '#01' },
    { modelDetails: undefined }, { modelDetails: { ...option.modelDetails, weightG: undefined } },
    { modelDetails: { ...option.modelDetails, lengthMm: 27 } },
    { modelDetails: { ...option.modelDetails, rattle: 'rattle' } }]) {
    assert.equal(resolve({ ...option, ...change }, [reference]), undefined)
  }
  assert.equal(resolve(option, [reference, reference]), undefined)
})

test('TIMON retailer product conditions are required independently of image conditions', () => {
  const retailer = { ...reference, sourceType: 'retailer', image: undefined }
  assert.equal(resolve(option, [retailer]), undefined)
  const reviewed = { ...retailer, product: { ...reference.product, conditionsEvidence: 'https://example.test/terms' } }
  assert.equal(resolve(option, [reviewed]).externalProductUrl, reference.product.url)
  assert.equal(resolve({ ...option, manufacturerName: 'SMITH' }, [{ ...reviewed, manufacturerName: 'SMITH' }]), undefined)
  assert.equal(resolve(option, [{ ...reviewed, image: { ...reference.image, conditions: 'held' } }]).imageReference, undefined)
  assert.equal(resolve(option, [{ ...retailer, image: reference.image }]).imageReference.imageUrl, reference.image.url)
})
test('product and image eligibility are independent and fail closed', () => {
  for (const change of [{ conditions: 'unknown' }, { conditions: 'held' }, { conditionsEvidence: '' },
    { decoded: false }, { verifiedHost: 'other.example.test' }, { url: 'https://images.example.test/c.jpg?expires=123' }]) {
    const result = resolve(option, [{ ...reference, image: { ...reference.image, ...change } }])
    assert.equal(result.imageReference, undefined)
    assert.equal(result.externalProductUrl, reference.product.url)
  }
  for (const url of ['http://example.test/item/model', 'https://name@example.test/item/model',
    'https://example.test/search.aspx', 'https://example.test/pages?keyword=model']) {
    const result = resolve(option, [{ ...reference, product: { verified: true, url } }])
    assert.equal(result.externalProductUrl, undefined)
    assert.equal(result.imageReference.imageUrl, reference.image.url)
  }
  assert.equal(resolve(option), undefined)
})
