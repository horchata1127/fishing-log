// Ordinary cross-origin browser image decoding only. No image files, proxy, or access-control bypass.
import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { localTypeScript } from './load-local-typescript.mjs'
const loader = await localTypeScript()
const { noaImageReferences } = await loader.load('src/data/noaExternalImages.ts')
const { externalImageHoldReason } = await loader.load('src/data/noaExternalImagePolicy.ts')
const { imageReferenceForOption } = await loader.load('src/utils/noaPhotoCatalog.ts')
const catalog = JSON.parse(await readFile('docs/noa-photo-coverage-followup/AUDIT.json','utf8'))
const browser = await chromium.launch()
const results = new Map()
try {
  const page = await browser.newPage()
  const responses = new Map()
  page.on('response', response => { if(response.request().resourceType()==='image') responses.set(response.url(),response.status()) })
  await page.goto('about:blank')
  for (const reference of noaImageReferences) {
    if(externalImageHoldReason(reference.sourceName) || results.has(reference.imageUrl)) continue
    const result = await page.evaluate(url => new Promise(resolve => {
      const img = new Image(), timer = setTimeout(()=>finish({ status:'failure', reason:'timeout (15s)' }),15000)
      function finish(value) { clearTimeout(timer); img.onload=null; img.onerror=null; img.remove(); resolve(value) }
      img.referrerPolicy='no-referrer'
      img.onload=()=>finish({status:img.naturalWidth>0?'success':'failure',width:img.naturalWidth,height:img.naturalHeight})
      img.onerror=()=>finish({status:'failure',reason:'browser image load/decode error'})
      document.body.append(img); img.src=url
    }), reference.imageUrl)
    results.set(reference.imageUrl,{...result,httpStatus:responses.get(reference.imageUrl)??null})
    await writeFile('docs/noa-retailer-product-links/IMAGE_URL_CHECKS.json',JSON.stringify({checkedAt:new Date().toISOString(),images:[...results].map(([url,result])=>({url,...result}))},null,2)+'\n')
    console.log('checked unique image',results.size,result.status)
    await page.waitForTimeout(200)
  }
  const checkedAt=new Date().toISOString()
  const definitions=noaImageReferences.map(reference=>({...reference,checkedAt,
    ...(externalImageHoldReason(reference.sourceName)?{status:'held',reason:externalImageHoldReason(reference.sourceName)}:results.get(reference.imageUrl))}))
  const rows=catalog.rows.flatMap(row=>{
    const option={manufacturerName:row.manufacturer,seriesName:row.series,modelName:row.modelName,colorName:row.colorName}
    const reference=imageReferenceForOption(option)
    if(!reference)return []
    const checked=definitions[noaImageReferences.indexOf(reference)]
    return [{variantId:row.variantId,modelName:row.modelName,weightG:row.weightG,colorName:row.colorName,imageUrl:reference.imageUrl,imageKind:reference.imageKind,status:checked.status,reason:checked.reason??'',sourceName:reference.sourceName}]
  })
  const counts=list=>Object.fromEntries(['success','failure','held'].map(status=>[status,list.filter(r=>r.status===status).length]))
  const report={checkedAt,method:'Ordinary Chromium cross-origin img decoding, no-referrer, no image files written. Held sources not requested. Successful decode is not proof of permission.',
    summary:{definitions:definitions.length,definitionStatus:counts(definitions),applicableRows:rows.length,rowStatus:counts(rows),uniqueImagesRequested:results.size},definitions,rows}
  await writeFile('docs/noa-retailer-product-links/IMAGE_RESTORATION_CHECKS.json',JSON.stringify(report,null,2)+'\n')
  console.log(report.summary)
}finally{await browser.close();await loader.close()}
