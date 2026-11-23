import { readFile, writeFile } from 'node:fs/promises'
const folder = 'docs/noa-retailer-product-links/'
const products = JSON.parse(await readFile(folder+'CASTING_PRODUCTS.json', 'utf8'))
const review = JSON.parse(await readFile(folder+'REVIEWED_CODES.json', 'utf8'))
const baseline = JSON.parse(await readFile('docs/noa-photo-coverage-followup/AUDIT.json', 'utf8'))
const jan = code => code.length === 13 && (10-[...code.slice(0,12)].reduce((a,d,i)=>a+Number(d)*(i%2 ? 3:1),0)%10)%10 === Number(code[12]) ? code : ''
const selected = review.codes.map(code => {
  const source = products.find(p => p.productCode === code)
  if (!source || source.error || !source.codePresent || !source.images?.[0]?.file.includes(code)) throw new Error('Unverified product '+code)
  const target = baseline.rows.find(r => r.variantId === source.matchedVariantIds[0])
  if (source.weightMentions.length !== 1 || Number.parseFloat(source.weightMentions[0]) !== target.weightG) throw new Error('Weight mismatch '+code)
  return { manufacturerName:'RODIO CRAFT', modelName:target.modelName, weightG:target.weightG, variantId:target.variantId,
    colorName:target.colorName, colorCode:target.colorCode, externalProductUrl:source.url, sourceName:'キャスティング',
    productCode:code, jan:jan(code), lastCheckedAt:review.checkedAt, photoStatus:'individual-confirmed',
    productTitle:source.title, photoFileId:source.images[0].file, pageSha256:source.pageSha256,
    verificationBasis:'通常のJavaScript有効ブラウザーで商品名・重量・色名/番号・商品コードを照合。個別写真を目視確認。別重量の写真・共通ポスターは採用しない。',
    spellingBasis:source.matchBasis, imageSaved:false }
})
selected.push(...JSON.parse(await readFile(folder+'OTHER_VERIFIED_PRODUCTS.json', 'utf8')))
if (new Set(selected.map(r=>r.variantId)).size !== selected.length) throw new Error('Duplicate reviewed row')
await writeFile(folder+'VERIFIED_PRODUCTS.json', JSON.stringify(selected,null,2)+'\n')
const links = selected.map(({modelName,colorName,externalProductUrl,sourceName,lastCheckedAt})=>({modelName,colorNames:[colorName],externalProductUrl,sourceName,lastCheckedAt}))
await writeFile('src/data/noaRetailerProductLinks.ts', `/** Individually reviewed model/weight/color product pages. No image URLs.\n * Evidence: docs/noa-retailer-product-links/VERIFIED_PRODUCTS.json\n */\nimport type { NoaModelExternalLink } from './noaModelExternalLinks'\nexport const noaRetailerProductLinks: readonly NoaModelExternalLink[] = `+JSON.stringify(links,null,2)+'\n')
console.log({ reviewedRows:selected.length, uniqueUrls:new Set(links.map(r=>r.externalProductUrl)).size })
