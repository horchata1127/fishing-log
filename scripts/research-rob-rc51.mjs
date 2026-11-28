import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const directory = '.rc51-rob.local/'
const audit = 'docs/lure-external-links/'
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const policies = (await readJson(audit + 'SOURCE_POLICIES.json')).sources
const reviewedHosts = new Map([['rob-lure.com', 'rob-lure'], ['www.kitiya.jp', 'kitiya'],
  ['www.fishing-shop-jh.com', 'jh'], ['fishing-shop-jh.com', 'jh'], ['wonder-field.shop-pro.jp','wonder-field']])
const candidates = (await readJson(audit + 'SOURCE_PAGES.json')).filter(row => row.manufacturer === 'ROB LURE' &&
  reviewedHosts.has(new URL(row.url).hostname) && (row.origins.includes('rc51-page') ||
    row.kind === 'product' && new URL(row.url).hostname === 'rob-lure.com'))
const urls = new Set([...candidates.map(row => row.url), 'https://rob-lure.com/work/', 'https://rob-lure.com/work/babel/', ...process.argv.slice(2)])
await mkdir(directory, { recursive: true })
const accessRestricted = status => [401, 403, 429, 503].includes(status)
const saved = await Promise.all((await readdir(directory)).filter(file => file.endsWith('.json'))
  .map(file => readJson(directory + file)))
const blocked = new Set(saved.filter(page => accessRestricted(page.httpStatus)).map(page => new URL(page.url).hostname))
const browser = await chromium.launch()
try {
  const parser = await browser.newPage()
  await parser.route('**/*', route => route.abort())
  for (const url of urls) {
    const host = new URL(url).hostname
    if (policies[reviewedHosts.get(host)]?.product !== 'plain-link') throw new Error('Source policy must be recorded: ' + url)
    if (blocked.has(host)) continue
    const prefix = directory + createHash('sha256').update(url).digest('hex').slice(0, 16)
    let page = await readJson(prefix + '.json').catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
    if (!page || (host !== 'rob-lure.com' && page.httpStatus === 200 && !page.encoding)) {
      await new Promise(resolve => setTimeout(resolve, 450))
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
      const bytes = Buffer.from(await response.arrayBuffer())
      page = { url, checkedAt: '2026-11-28', httpStatus: response.status, sha256: createHash('sha256').update(bytes).digest('hex') }
      if (response.ok) {
        const sniff = bytes.subarray(0, 13000).toString('latin1')
        page.encoding = /euc-jp/i.test(sniff) ? 'euc-jp' : /shift.?jis|windows-31j/i.test(sniff) ? 'shift_jis' : 'utf-8'
        await writeFile(prefix + '.html', new TextDecoder(page.encoding).decode(bytes))
      }
      await writeFile(prefix + '.json', JSON.stringify(page, null, 2) + '\n')
    }
    if (page.httpStatus === 200 && !page.optionTableParsed) {
        const html = await readFile(prefix + '.html', 'utf8')
        Object.assign(page, await parser.evaluate(({html, url}) => {
          const doc = new DOMParser().parseFromString(html, 'text/html')
          const clean = element => element?.textContent.replace(/\s+/g, ' ').trim() ?? ''
          const body = doc.querySelector('main') ?? doc.body
          const absolute = value => { try { return new URL(value, url).href } catch { return '' } }
          return {
            title: doc.title,
            specs: [...body.querySelectorAll('div,td,li,p')].map(clean)
              .filter(text => text.length < 320 && /((自重|全長|重量|サイズ).*?(ｇ|g|ｍｍ|mm)|[01]\.\d[gｇ])/i.test(text))
              .filter((text, index, list) => list.indexOf(text) === index),
            sections: [...body.querySelectorAll('h1,h2,h3,h4,p')].map(clean).filter(Boolean),
            links: [...body.querySelectorAll('a[href]')].map(a => [absolute(a.getAttribute('href')), clean(a)]).filter(([, label]) => label),
            options: [...body.querySelectorAll('select option, .prd-opt-table th, table[id^="opt"] th')].map(clean).filter(Boolean),
            images: [...body.querySelectorAll('img[src]')].flatMap(img => {
              const gallery = img.closest('.gallery')
              const anchor = img.closest('a[href]')
              const src = absolute(gallery && anchor ? anchor.getAttribute('href') : img.getAttribute('src'))
              if (!/\/(wp-content\/uploads|img|image)\//.test(src) && !src.includes('shop-pro.jp')) return []
              const caption = doc.getElementById(img.getAttribute('aria-describedby')) ?? img.closest('.gallery-item')?.querySelector('.gallery-caption')
              return [{ url: src, alt: img.alt, caption: clean(caption), gallery: gallery?.id ?? (gallery ? 'gallery' : ''),
                labels: [img.parentElement, img.parentElement?.parentElement, img.closest('figure,li,td')].map(clean),
                containers: [img.parentElement, img.parentElement?.parentElement, img.closest('figure,li,td')].map(el => el?.className ?? '') }]
            }),
          }
        }, { html, url }))
      page.optionTableParsed = true
      await writeFile(prefix + '.json', JSON.stringify(page, null, 2) + '\n')
    }
    if (accessRestricted(page.httpStatus)) blocked.add(host)
    if (host.endsWith('fishing-shop-jh.com') && new URL(url).searchParams.has('gid')) {
      for (const [href, label] of page.links ?? []) {
        if (!/^ロブルアー\s*バービー(?:ガール\s*(?:SS|F)|ロング\s*(?:SS|F)|\s*(?:SS|F))\s*#/.test(label)) continue
        const target = new URL(href)
        if (reviewedHosts.get(target.hostname) === 'jh' && /^[0-9]+$/.test(target.searchParams.get('pid') ?? '')) {
          urls.add(target.origin + '/?pid=' + target.searchParams.get('pid'))
        }
      }
    }
    console.log(page.httpStatus, url)
  }
} finally {
  await browser.close()
}
