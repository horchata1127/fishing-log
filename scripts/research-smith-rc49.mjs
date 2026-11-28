import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const directory = '.rc49-smith.local/'
const checkedAt = process.argv[2] ?? '2026-11-28'
const origin = 'https://www.smith.jp'
const terms = origin + '/html/201308-attetion.html'
const index = origin + '/html/03-trouttacle.html'
const collaborationUrl = 'https://velvetarts.co.jp/products/va_puppetsurface'
const relevantSeries = /パペット|スティル|パニッシュ|カディス|ヒキナミ|コイカちゃん|チクタク|カルモ|ズルビー|くるん|AR-S|ドロップダイヤ|ダンゴウオ|シボクラ|美蝉|ボトムノックスイマー/i
const restrictedStatuses = new Set([401, 403, 429, 503])
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const writeJson = (name, data) => writeFile(directory + name, JSON.stringify(data, null, 2) + '\n')

const policies = await readJson('docs/lure-external-links/SOURCE_POLICIES.json')
if (policies.sources.smith?.product !== 'plain-link' || policies.sources['velvet-arts']?.product !== 'plain-link') {
  throw new Error('Review and record the official source policies before collection')
}
await mkdir(directory, { recursive: true })
const saved = new Map()
for (const name of (await readdir(directory)).filter(name => name.endsWith('.json'))) {
  const entry = await readJson(directory + name)
  if (restrictedStatuses.has(entry.httpStatus)) throw new Error('Access restriction recorded at ' + entry.url)
  saved.set(entry.url, entry)
}

const sources = await readJson('docs/lure-external-links/SOURCE_PAGES.json')
const queue = new Set([terms, index, ...sources.filter(entry => entry.manufacturer === 'SMITH' &&
  entry.kind === 'product' && entry.url.startsWith(origin + '/product/')).map(entry => entry.url)])

const browser = await chromium.launch()
try {
  const parser = await browser.newPage()
  await parser.route('**/*', route => route.abort())
  for (const url of queue) {
    let entry = saved.get(url)
    if (!entry) {
      const filename = new URL(url).pathname.split('/').at(-1)
      await new Promise(resolve => setTimeout(resolve, 500))
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
      const bytes = Buffer.from(await response.arrayBuffer())
      entry = { url, httpStatus: response.status, checkedAt, sha256: createHash('sha256').update(bytes).digest('hex') }
      if (response.ok) {
        const sample = bytes.subarray(0, 4000).toString('latin1')
        const encoding = /shift.?jis|windows-31j/i.test(sample) ? 'shift_jis' : /euc-jp/i.test(sample) ? 'euc-jp' : 'utf-8'
        const html = new TextDecoder(encoding).decode(bytes)
        const page = await parser.evaluate(({ html, url }) => {
          const doc = new DOMParser().parseFromString(html, 'text/html')
          const clean = element => element?.textContent.replace(/\s+/g, ' ').trim() ?? ''
          const absolute = value => { try { return new URL(value, url).href } catch { return '' } }
          const links = [...doc.querySelectorAll('a[href]')].map(link =>
            [absolute(link.getAttribute('href')), clean(link) || link.querySelector('img')?.alt || ''])
            .filter(([href, label]) => label && href.includes('/product/trout/'))
          const tables = [...doc.querySelectorAll('table')].map(table =>
            [...table.rows].map(row => [...row.cells].map(clean))).filter(table => table.length < 90)
          const images = [...doc.querySelectorAll('img[src]')].flatMap(image => {
            const src = absolute(image.getAttribute('src'))
            if (!src.includes('/product/trout/')) return []
            const containers = [image.parentElement, image.parentElement?.parentElement, image.closest('li,figure,td')]
            return [{ url: src, near: containers.map(clean).filter(label => label.length < 110),
              parents: containers.slice(0, 2).map(element => element?.className) }]
          })
          return { title: doc.title, links, tables, images }
        }, { html, url })
        Object.assign(entry, page)
        await writeFile(directory + filename + '.raw.html', html)
      }
      await writeJson(filename + '.json', entry)
      if (restrictedStatuses.has(response.status)) throw new Error('Access restriction recorded at ' + url)
    }
    for (const [href, label] of entry.links ?? []) {
      const target = new URL(href)
      if (target.origin === origin && /^\/product\/trout\/[^/]+\/[^/]+\.html$/.test(target.pathname) && relevantSeries.test(label)) {
        queue.add(target.origin + target.pathname)
      }
    }
  }
} finally {
  await browser.close()
}

if (!saved.has(collaborationUrl)) {
  const response = await fetch(collaborationUrl + '.js', { redirect: 'manual', signal: AbortSignal.timeout(15000) })
  const entry = { url: collaborationUrl, checkedAt, httpStatus: response.status }
  if (response.ok) {
    const product = await response.json()
    entry.title = product.title
    entry.variants = product.variants.map(({ id, title, featured_image }) => ({ id, title, imageUrl: featured_image?.src }))
  }
  await writeJson('va-product.local.json', entry)
  if (!response.ok) throw new Error('VA collaboration checkpoint: HTTP ' + response.status)
}
console.log('Official checkpoints:', queue.size + 1)
