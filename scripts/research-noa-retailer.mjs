// Public browsing only. Standard Chromium/JavaScript; no challenge solving or stealth.
// Records product facts and photo identifiers, never image files or personal backups.
import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const folder = 'docs/noa-retailer-product-links/'
await mkdir(folder, { recursive: true })
const listing = 'https://store.castingnet.jp/shop/goods/search.aspx?category=0802&keyword=&filtercode13=&style=&sort=&ps=&search.x=0&jnr=108410'
const browser = await chromium.launch()
const context = await browser.newContext({ locale: 'ja-JP' })
const page = await context.newPage()
const sha = s => createHash('sha256').update(s).digest('hex')
const save = (name, data) => writeFile(folder+name+'.json', JSON.stringify(data, null, 2)+'\n')
try {
  if (process.argv.includes('--discover')) {
    const found = new Map(), pages = []
    let url = listing, number = 1
    while (url && number <= 30) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.locator('a[href*="/shop/g/g"]').first().waitFor({ timeout: 20000 })
      const data = await page.evaluate(() => ({ title: document.title,
        count: document.body.innerText.match(/(\d+)件あります/)?.[1],
        products: [...document.querySelectorAll('a[href*="/shop/g/g"]')].map(a => ({ url: a.href, title: a.textContent.trim() || a.querySelector('img')?.alt || '' })),
        pages: [...document.querySelectorAll('a[href*="search.aspx"]')].map(a => a.href) }))
      for (const product of data.products) if (/NOA|ノア/i.test(product.title.normalize('NFKC'))) found.set(product.url, product)
      pages.push({ url, title: data.title, total: data.count, checkedAt: '2026-11-23' })
      await save('CASTING_DISCOVERY', { pages, candidates: [...found.values()] })
      number++
      url = data.pages.find(u => new URL(u).searchParams.get('p') === String(number))
      if (url) await page.waitForTimeout(1000)
      console.log('listing', number-1, 'NOA candidates', found.size)
    }
    // The supplied listing includes stock-outs. Also search missing/limited names internally.
    for (const keyword of ['ノア エルドラド', 'ノア FORODOX', 'ノア シルバーエンド', 'ノア 2018松本', 'ノア 青雲', 'ノア グロー', 'ノア 狩野', 'ノア バステト']) {
      const search = new URL(listing); search.searchParams.set('keyword', keyword)
      try {
        await page.goto(search.href, { waitUntil: 'domcontentloaded', timeout: 25000 })
        await page.waitForTimeout(1000)
        const products = await page.locator('a[href*="/shop/g/g"]').evaluateAll(as => as.map(a => ({ url: a.href, title: a.textContent.trim() || a.querySelector('img')?.alt || '' })))
        for (const product of products) if (/NOA|ノア/i.test(product.title.normalize('NFKC'))) found.set(product.url, product)
        pages.push({ url: search.href, title: await page.title(), keyword, checkedAt: '2026-11-23' })
      } catch (e) { pages.push({ url: search.href, keyword, error: String(e) }) }
      await save('CASTING_DISCOVERY', { pages, candidates: [...found.values()] })
    }
  }
  if (process.argv.includes('--inspect')) {
    const proposals = JSON.parse(await readFile(folder+'PROPOSALS.json', 'utf8'))
    let result = []
    try { result = JSON.parse(await readFile(folder+'CASTING_PRODUCTS.json', 'utf8')) } catch {}
    for (const product of proposals) {
      if (result.some(r => r.url === product.url)) continue
      try {
        await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 25000 })
        const code = product.url.match(/\/g(\d+)\//)[1]
        await page.locator(`img[src*="/goods/L/${code}"]`).first().waitFor({ timeout: 15000 })
        await page.waitForFunction(c => [...document.images].some(i => i.src.includes('/goods/L/'+c) && i.naturalWidth > 50), code, { timeout: 15000 })
        const facts = await page.evaluate(code => {
          const text = document.body.innerText
          const end = text.indexOf('ユーザーレビュー')
          const images = [...document.images].filter(i => i.src.includes('/img/goods/') && i.src.includes(code)).map(i => ({
            file: new URL(i.src).pathname, alt: i.alt, width: i.naturalWidth, height: i.naturalHeight }))
          const detail = text.slice(0, end > 0 ? end : 3500).normalize('NFKC')
          return { title: document.title, weightMentions: [...new Set(detail.match(/\d+(?:\.\d+)?\s*g/g) ?? [])],
            images: images.filter((i, n, a) => a.findIndex(j => j.file === i.file) === n), codePresent: text.includes(code) }
        }, code)
        result.push({ ...product, checkedAt: '2026-11-23', productCode: code, ...facts, pageSha256: sha(await page.content()),
          visualReview: 'pending', imagesSaved: false })
      } catch (e) { result.push({ ...product, error: String(e), visualReview: 'held', imagesSaved: false }) }
      await save('CASTING_PRODUCTS', result)
      console.log('products', result.length, '/', proposals.length, product.modelName, product.colorName)
      await page.waitForTimeout(1000)
    }
  }
} finally { await context.close(); await browser.close() }
