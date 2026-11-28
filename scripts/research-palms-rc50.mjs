import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const directory = '.rc50-palms.local/'
const output = 'docs/lure-external-links/'
const checkedAt = process.argv[2] ?? '2026-11-28'
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
if ((await readJson(output + 'SOURCE_POLICIES.json')).sources.palms?.product !== 'plain-link') {
  throw new Error('Record the official policy review before collecting product pages')
}
const candidates = (await readJson(output + 'SOURCE_PAGES.json')).filter(row => row.manufacturer === 'PALMS' &&
  row.kind === 'product' && row.origins.includes('backup-manufacturer'))
const urls = [...new Set(candidates.map(row => row.url))]
await mkdir(directory, { recursive: true })
const browser = await chromium.launch()
try {
  const parser = await browser.newPage()
  await parser.route('**/*', route => route.abort())
  for (const url of urls) {
    const target = new URL(url)
    const slug = target.searchParams.get('name')
    if (target.origin !== 'https://www.palmsjapan.com' || target.pathname !== '/lures/product/' || !/^[a-z0-9-]+$/.test(slug ?? '')) {
      throw new Error('Unexpected manufacturer product URL: ' + url)
    }
    const checkpoint = directory + slug + '.json'
    const htmlPath = directory + slug + '.html'
    let saved = await readJson(checkpoint).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
    if (!saved) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
      const bytes = Buffer.from(await response.arrayBuffer())
      saved = { url, checkedAt, httpStatus: response.status, sha256: createHash('sha256').update(bytes).digest('hex') }
      if (response.ok) {
        const html = bytes.toString('utf8')
        const extracted = await parser.evaluate(({ html, url }) => {
          const doc = new DOMParser().parseFromString(html, 'text/html')
          const clean = element => element?.textContent.replace(/\s+/g, ' ').trim() ?? ''
          const images = [...doc.querySelectorAll('img[src], img[data-src]')].flatMap(image => {
            const src = new URL(image.getAttribute('data-src') ?? image.getAttribute('src'), url)
            if (!src.pathname.includes('/lures/product/')) return []
            return [{ url: src.href,
              labels: [image.parentElement, image.parentElement?.parentElement, image.closest('li,figure,td')].map(clean) }]
          })
          const tables = [...doc.querySelectorAll('table')].map(table => ({
            headings: [...table.querySelectorAll('th')].map(clean),
            rows: [...table.rows].map(row => [...row.cells].map(clean)),
          }))
          return { title: doc.title, images, tables, colorAnchor: !!doc.getElementById('color') }
        }, { html, url })
        Object.assign(saved, extracted)
        await writeFile(htmlPath, html)
      }
      await writeFile(checkpoint, JSON.stringify(saved, null, 2) + '\n')
    }
    if (saved.httpStatus === 200 && saved.colorAnchor === undefined) {
      saved.colorAnchor = /\bid=["']color["']/.test(await readFile(htmlPath, 'utf8'))
      await writeFile(checkpoint, JSON.stringify(saved, null, 2) + '\n')
    }
    if ([401, 403, 429, 503].includes(saved.httpStatus)) throw new Error('Access restricted: ' + url)
    console.log(slug, saved.httpStatus)
  }
} finally {
  await browser.close()
}
