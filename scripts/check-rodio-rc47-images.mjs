import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
const directory = 'docs/lure-external-links/'
const images = JSON.parse(await readFile(directory+'IMAGE_CHECKS.json','utf8'))
const picked = new Map()
for (const image of images) {
  if (image.status !== 'held' || image.checkedAt !== '2026-11-28' || picked.has(image.series)) continue
  if (image.url.startsWith('https://') && image.sourceProductUrl.startsWith('https://')) picked.set(image.series,image)
}
const browser=await chromium.launch()
const results=[]
try {
  const context=await browser.newContext({serviceWorkers:'block'})
  const page=await context.newPage()
  for(const image of picked.values()){
    const responsePromise=page.waitForResponse(r=>r.url()===image.url,{timeout:10000}).catch(()=>undefined)
    const decoded=await page.evaluate(async url=>{
      const image=new Image()
      image.referrerPolicy='no-referrer'
      image.src=url
      try {
        await Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),8500))])
        return {status:'decoded',width:image.naturalWidth,height:image.naturalHeight}
      } catch (e) { return {status:e.message==='timeout'?'timeout':'failed'} }
    },image.url)
    const response=await responsePromise
    results.push({url:image.url,sourceProductUrl:image.sourceProductUrl,checkedAt:'2026-11-28',
      engine:'Chromium img.decode no-referrer',httpStatus:response?.status(),...decoded,conditions:'unconfirmed',decision:'held'})
    await new Promise(r=>setTimeout(r,500))
  }
}finally{await browser.close()}
await writeFile(directory+'RODIO_IMAGE_SPOT_CHECKS.json',JSON.stringify(results,null,2)+'\n')
console.log(results)
