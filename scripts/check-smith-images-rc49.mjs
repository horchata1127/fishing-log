import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const directory = 'docs/lure-external-links/'
const [manufacturer = 'SMITH', checkedAt = '2026-11-28'] = process.argv.slice(2)
if (!['SMITH', 'PALMS', 'ROB_LURE'].includes(manufacturer)) throw new Error('Unknown image review manufacturer')
const checkpoint = directory + manufacturer + '_IMAGE_SPOT_CHECKS.json'
const { rows } = JSON.parse(await readFile(directory + manufacturer + '_REVIEW.json', 'utf8'))
const groups = Map.groupBy(rows.filter(row => row.image), row => row.candidateUrl ?? row.productUrl)
const samples = manufacturer === 'ROB_LURE'
  ? [...Map.groupBy(rows.filter(row => row.image), row => row.kind === 'individual-color'
    ? row.sourceName + ':' + row.model : row.candidateUrl + ':' + row.model).values()].map(group => group[0])
  : [...groups.values()].flatMap(group => group[0].kind === 'individual-color' ? group : group.slice(0, 1))
const checks = new Map((await readFile(checkpoint, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return []
  throw error
})).map(check => [check.url, check]))
const restrictedHosts = new Set([...checks.values()].filter(check => [403, 429, 503].includes(check.httpStatus))
  .map(check => new URL(check.url).hostname))
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ serviceWorkers: 'block' })
  for (const { image, productUrl } of samples) {
    const { url } = image
    const host = new URL(url).hostname
    if (checks.has(url) || restrictedHosts.has(host)) continue
    await new Promise(resolve => setTimeout(resolve, 500))
    await page.route('**/*', route => route.request().url() === url ? route.continue() : route.abort())
    const response = page.waitForResponse(response => response.url() === url, { timeout: 7000 }).catch(() => undefined)
    const dimensions = await page.evaluate(async url => {
      const image = new Image()
      image.referrerPolicy = 'no-referrer'
      image.src = url
      try {
        await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(reject, 6500))])
        return { width: image.naturalWidth, height: image.naturalHeight }
      } catch {
        image.removeAttribute('src')
        return {}
      }
    }, url)
    const httpStatus = (await response)?.status()
    await page.unroute('**/*')
    checks.set(url, { url, productUrl, checkedAt, httpStatus, ...dimensions,
      status: dimensions.width && dimensions.height ? 'decoded' : 'failed', displayPermission: 'unconfirmed' })
    if ([403, 429, 503].includes(httpStatus)) restrictedHosts.add(host)
    await writeFile(checkpoint, JSON.stringify([...checks.values()], null, 2) + '\n')
  }
} finally {
  await browser.close()
}
console.log(manufacturer, 'image probes:', checks.size, 'decoded:', [...checks.values()].filter(check => check.status === 'decoded').length)
