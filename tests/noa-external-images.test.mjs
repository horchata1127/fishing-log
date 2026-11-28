import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'
const loader = await localTypeScript()
const { noaImageReferences } = await loader.load('src/data/noaExternalImages.ts')
const { imageReferenceForOption, externalImageForOption } = await loader.load('src/utils/noaPhotoCatalog.ts')
const { noaModelExternalLinks } = await loader.load('src/data/noaModelExternalLinks.ts')
const { externalImageHoldReason } = await loader.load('src/data/noaExternalImagePolicy.ts')
const prior = JSON.parse(readFileSync('docs/noa-photo-coverage-followup/AUDIT.json','utf8'))
const reviews = JSON.parse(readFileSync('docs/noa-color-photos/REVIEWED_LINKS.json','utf8'))
const additions = JSON.parse(readFileSync('docs/noa-photo-coverage-followup/ADDED_LINKS.json','utf8'))
after(()=>loader.close())
const option = r=>({ variantId:r.variantId, modelId:r.modelId, manufacturerName:r.manufacturer, seriesName:r.series, modelName:r.modelName, colorName:r.colorName })

test('all 120 original image definitions and 118 applicable rows are restored without changing reference identity',()=>{
  const expected=noaModelExternalLinks.map(link=>({...link,imageUrl:reviews.find(r=>r.url===link.externalProductUrl).imageUrl,imageKind:'product-photo'}))
    .concat(additions.map(({collaboration,verificationBasis,...source})=>source))
  assert.deepEqual(noaImageReferences,expected)
  assert.equal(noaImageReferences.length,120)
  const matches=prior.rows.filter(r=>imageReferenceForOption(option(r)))
  assert.equal(matches.length,118)
  for(const r of matches) assert.equal(imageReferenceForOption(option(r)).imageUrl,r.imageDirectUrl)
  assert.equal(matches.filter(r=>externalImageForOption(option(r))).length,0)
  const references = matches.map(r=>imageReferenceForOption(option(r)))
  assert.equal(references.filter(r=>externalImageHoldReason(r.sourceName)).length,118)
  assert.equal(references.filter(r=>r.sourceName==='城峰釣具店').length,73)
  assert.equal(references.filter(r=>r.sourceName==='JOINTER / WILD-1').length,18)
})

test('image scope includes manufacturer, NOA family, exact model/weight and full color; common samples stay explicitly classified',()=>{
  const r=prior.rows.find(r=>r.modelName==='NOA 1.8g'&&r.colorName==='エルドラド'), o=option(r)
  assert.ok(imageReferenceForOption(o))
  assert.equal(externalImageForOption(o),undefined)
  for(const change of [{manufacturerName:'別メーカー'},{seriesName:'JEKYLL'},{modelName:'NOA 99g'},{colorName:'エルドラド風'},{colorName:'#1 エルドラド'}])
    assert.equal(imageReferenceForOption({...o,...change}),undefined)
  const jr=prior.rows.find(r=>r.modelName==='NOA Jr. 0.9g'&&r.colorName==='腹黒')
  assert.equal(imageReferenceForOption(option(jr)).imageKind,'weight-common-color-sample')
  assert.equal(externalImageForOption(option(jr)),undefined)
  const show=prior.rows.find(r=>r.modelName==='NOA 1.8g'&&r.colorName==='SHOW')
  assert.ok(imageReferenceForOption(option(show))); assert.equal(externalImageForOption(option(show)),undefined)
})
