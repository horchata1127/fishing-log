import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const directory = 'docs/lure-external-links/'
const file = directory + 'TIMON_IMAGE_SPOT_CHECKS.json'
const review = JSON.parse(await readFile(directory+'TIMON_REVIEW.json'))
const checkedAt = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())
let checks = []
try { checks = JSON.parse(await readFile(file)) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const completed = new Set(checks.map(check=>check.url))
const checkedPages = new Set(checks.map(check=>check.officialPage))
const selected = new Map()
const chosenUrls = new Set(completed)
for (const row of review.rows) {
  if (row.image?.status !== 'held-site-conditions' || (selected.has(row.officialUrl) || checkedPages.has(row.officialUrl))) continue
  if (chosenUrls.has(row.image.candidateUrl)) continue
  chosenUrls.add(row.image.candidateUrl)
  selected.set(row.officialUrl, row)
}
const browser = await chromium.launch()
try {
  const context = await browser.newContext({serviceWorkers:'block'})
  const page = await context.newPage()
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return url.origin === 'https://www.jackall.co.jp' && url.pathname.startsWith('/timon/wp-content/uploads/')
      ? route.continue() : route.abort()
  })
  for (const row of selected.values()) {
    const url = row.image.candidateUrl
    if (completed.has(url)) continue
    const responsePromise = page.waitForResponse(res=>res.url()===url,{timeout:10000}).catch(()=>undefined)
    const dimensions = await page.evaluate(async src => {
      const image = new Image()
      image.referrerPolicy = 'no-referrer'
      image.src = src
      const result = await Promise.race([image.decode().then(()=>true).catch(()=>false),
        new Promise(resolve=>setTimeout(()=>resolve(false),9000))])
      return result ? {decoded:true,width:image.naturalWidth,height:image.naturalHeight} : {decoded:false}
    },url)
    const response = await responsePromise
    checks.push({url,officialPage:row.officialUrl,checkedAt,browser:'Chromium img.decode no-referrer',
      httpStatus:response?.status(),...dimensions,conditions:'permission-not-obtained',activation:'held'})
    await writeFile(file,JSON.stringify(checks,null,2)+'\n')
    completed.add(url)
    if (response && [403,429].includes(response.status())) throw new Error('Official image host denied or rate limited the request; saved checkpoint')
    await new Promise(resolve=>setTimeout(resolve,400))
  }
  console.log('Image checks',checks.length,'decoded',checks.filter(c=>c.decoded).length)
} finally {
  await browser.close()
}
