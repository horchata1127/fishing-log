// Inspection aid only: renders public product photographs in browser memory.
// Writes no image files. This script is not imported by the application/build.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
const rows = JSON.parse(await readFile('docs/noa-retailer-product-links/CASTING_PRODUCTS.json', 'utf8'))
const start = Number(process.argv[2] ?? 0), count = Number(process.argv[3] ?? 25)
const items = rows.slice(start, start+count).filter(r => r.images?.[0])
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1250, height: 1150 }, deviceScaleFactor: 1 })
  await page.goto('https://store.castingnet.jp/shop/g/g4573151242095/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
  await page.setContent('<html lang="ja"><style>body{margin:0;font:13px sans-serif;background:#ddd}main{display:grid;grid-template-columns:repeat(5,250px)}figure{margin:2px;padding:3px;background:white;height:213px;overflow:hidden}b{display:block;height:20px}p{margin:0;height:32px}img{width:220px;height:153px;object-fit:contain}</style><main>'+items.map((r,i)=>`<figure><b>${start+i}: ${esc(r.productCode)}</b><p>${esc(r.modelName)} / ${esc(r.colorName)}</p><img src="https://store.castingnet.jp${esc(r.images[0].file)}"></figure>`).join('')+'</main></html>')
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete), { timeout: 15000 })
  const shot = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: true })
  process.stdout.write(JSON.stringify({ items: items.map((r,i)=>({ index:start+i, code:r.productCode, model:r.modelName, color:r.colorName, weights:r.weightMentions })), image:'data:image/jpeg;base64,'+shot.toString('base64') }))
} finally { await browser.close() }
