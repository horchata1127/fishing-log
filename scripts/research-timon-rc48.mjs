import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'

const docs = 'docs/lure-external-links/'
const cache = '.rc52c-timon.local/timon-pages/'
const origin = 'https://www.jackall.co.jp'
const checkedAt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
const officialProduct = url => url.origin === origin && /^\/timon\/products\/lure\/[^/]+\/[^/]+\/$/.test(url.pathname)
const normalize = value => {
  try {
    const url = new URL(value, origin)
    if (url.origin !== origin) return
    return url.origin + url.pathname.replace(/\/?$/, '/')
  } catch { return undefined }
}
const queue = new Map([
  [origin + '/timon/products/', 'product-index'],
  [origin + '/terms-of-service/', 'terms'],
])
const seeds = JSON.parse(await readFile(docs + 'SOURCE_PAGES.json'))
for (const item of seeds) {
  if (item.manufacturer !== 'TIMON' || item.kind !== 'product') continue
  const url = normalize(item.url)
  if (url && officialProduct(new URL(url))) queue.set(url, 'rc47-identifier')
}
await mkdir(cache, { recursive: true })
const browser = await chromium.launch()
let network = 0
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*', route => route.abort())
  const page = await context.newPage()
  for (const [url, originType] of queue) {
    if (queue.size > 120) throw new Error('Official queue expanded beyond expected size')
    const urlKey = new URL(url).pathname.split('/').filter(Boolean).join('_')
    const file = cache + urlKey + '.json'
    let record
    try { record = JSON.parse(await readFile(file)) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const completeCaptions = new Set(['tearo','chibi_panicra','pepino','rhomy','kibipani','tc-reigen','2026-02-26-8768'])
    const slug = new URL(url).pathname.split('/').at(-2)
    const needsFullCaption = completeCaptions.has(slug) && !record?.fullColorCaptions &&
      record?.images?.some(card=>card.group==='product-color-list__item' && card.label.length===100 && card.label.includes('JAN'))
    if (!record || needsFullCaption) {
      if (network && network % 15 === 0) console.log('Fetched', network, 'official pages')
      await new Promise(resolve => setTimeout(resolve, 400))
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
      network++
      const html = await response.text()
      record = { url, checkedAt, originType, fullColorCaptions: true, httpStatus: response.status,
        redirect: response.headers.get('location') ?? undefined,
        sha256: createHash('sha256').update(html).digest('hex') }
      if (response.ok) Object.assign(record, await page.evaluate(({ html, url }) => {
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const read = el => el?.textContent.replace(/\s+/g, ' ').trim() ?? ''
        const href = value => { try { return new URL(value, url).href } catch { return '' } }
        const links = [...new Map([...doc.querySelectorAll('a[href]')].flatMap(el => {
          const link = href(el.getAttribute('href'))
          return link.includes('jackall.co.jp/timon/products/') ? [[link, { url: link, label: read(el).slice(0, 100) }]] : []
        })).values()]
        const tables = [...doc.querySelectorAll('table')].map(table => ({ name: table.className,
          rows: [...table.rows].map(row => [...row.cells].map(read)) }))
        const heading = [...doc.querySelectorAll('h1,h2,h3')].map(el => ({ text: read(el), name: el.className })).filter(x => x.text)
        const title = doc.title.replace(/\s+/g, ' ').trim()
        const images = [...doc.querySelectorAll('main img, article img, .product img, section img')].flatMap(el => {
          const file = el.getAttribute('data-src') || el.getAttribute('src')
          if (!file || !/uploads|cdn|shopify/.test(file)) return []
          const figure = el.closest('figure')
          const parent = el.parentElement
          const alt = el.alt.trim()
          const label = read(figure?.querySelector('figcaption')) || read(parent.querySelector('figcaption')) ||
            read(parent.nextElementSibling).slice(0, 1200) || read(parent).slice(0, 1200)
          const group = el.closest('[class*=color], [class*=Color], [id*=color]')
          const groupChain = []
          for (let e = el.parentElement; e && groupChain.length < 5; e = e.parentElement)
            groupChain.push([e.tagName, e.className])
          return [{ url: href(file), alt, label, group: group?.className || group?.id, groupChain }]
        })
        const specifications = [...doc.querySelectorAll('main p,article p, main li,article li')].map(read)
          .filter(t => t.length < 180 && /ラトル|浮力|カラー共通|全サイズ|全ウエイト|全ウェイト/.test(t)).slice(0, 60)
        return { title, heading, tables, images, specifications, links }
      }, { html, url }))
      await writeFile(file, JSON.stringify(record, null, 2) + '\n')
      if (response.status === 429 || response.status === 403) throw new Error('Official site returned ' + response.status + '; stop and keep saved evidence')
    }
    if (record.redirect) {
      const next = normalize(record.redirect)
      if (next && officialProduct(new URL(next)) && !queue.has(next)) queue.set(next, 'official-redirect')
    }
    if (record.originType === 'terms') continue
    for (const item of record.links ?? []) {
      const next = normalize(item.url)
      if (!next || queue.has(next)) continue
      const path = new URL(next).pathname
      const category = /^\/timon\/products\/category\/(?:lure|spoon|crank|vibration|minnow|topwater|other|all)\/$/.test(path)
      if (category || officialProduct(new URL(next))) queue.set(next, category ? 'official-category' : 'official-index-link')
    }
  }
  console.log('Official page checkpoints', queue.size, 'new network fetches', network)
} finally {
  await browser.close()
}
