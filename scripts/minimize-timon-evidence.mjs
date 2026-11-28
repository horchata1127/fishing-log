import { readFile, readdir, writeFile } from 'node:fs/promises'

const source = process.argv[2]
if (!source) throw new Error('Pass the local TIMON evidence archive directory')
const output = 'docs/lure-external-links'
const read = file => readFile(`${source}/${file}`, 'utf8').then(JSON.parse)
const write = (file, data) => writeFile(`${output}/${file}`, JSON.stringify(data, null, 2) + '\n')
const pick = (record, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]))
const markers = ['DR-HF', 'MR-SS', 'SR-SS', 'DR-SS', 'MR-Fラトル', 'SR', 'MR', 'DR', 'ミッツドライラトル2hook', 'ミッツドライ2hook']

function skuEvidence(alt, label) {
  const suffix = label.startsWith(alt) ? label.slice(alt.length).normalize('NFKC') : ''
  const caption = suffix.toLowerCase().replace(/[‐‑–—−ｰ]/g, '-')
  return {
    jans: [...suffix.matchAll(/JAN\s*:\s*(\d{13})(?!\d)/gi)].map(match => match[1]),
    weightJans: [...suffix.matchAll(/(\d+(?:\.\d+)?)\s*g\s*JAN\s*:\s*(\d{13})(?!\d)/gi)]
      .map(([, weight, jan]) => [Number(weight), jan]),
    modelJans: markers.flatMap(marker => [...caption.matchAll(new RegExp(`(?<![a-z0-9-])${marker.toLowerCase()}\\s*jan\\s*:\\s*(\\d{13})(?!\\d)`, 'g'))]
      .map(([, jan]) => [marker.toLowerCase(), jan])),
    sharedEyeEvidence: /(?:SR|MR|DR).{0,5}JAN/i.test(suffix.replace(/JAN\s*:\s*\d{13}.*$/i, '')) && /目玉/.test(suffix),
  }
}

for (const name of (await readdir(`${source}/timon-pages`)).filter(file => file.endsWith('.json'))) {
  const page = await read(`timon-pages/${name}`)
  const cards = new Map()
  for (const image of page.images ?? []) {
    if (image.group !== 'product-color-list__item' || !image.alt.trim()) continue
    const key = JSON.stringify([image.alt, image.url])
    if (!cards.has(key) || cards.get(key).label.length < image.label.length) cards.set(key, image)
  }
  const tables = (page.tables ?? []).filter(({ rows }) => rows[0]?.[0] === 'Name' && rows[0].includes('Weight'))
    .map(({ rows }) => {
      const fields = rows[0].flatMap((name, index) => ['Name', 'Weight', 'Length', 'Type'].includes(name) ? [index] : [])
      return { rows: rows.map(row => fields.map(index => row[index])) }
    })
  await write(`timon-pages/${name}`, {
    ...pick(page, ['url', 'originType', 'checkedAt', 'httpStatus', 'finalUrl', 'sha256']),
    tables,
    images: [...cards.values()].map(({ alt, url, label }) => ({ alt, url, sku: skuEvidence(alt, label) })),
  })
}

const listings = await read('TIMON_RETAILER_LISTINGS.json')
await write('TIMON_RETAILER_LISTINGS.json', listings.map(page => ({
  ...pick(page, ['store', 'url', 'status', 'httpStatus', 'checkedAt', 'finalUrl', 'error']),
  links: (page.links ?? []).filter(([url, name]) => {
    const product = new URL(url)
    return /(^|\.)fishing-shop-jh\.com$/.test(product.hostname) && product.searchParams.has('pid') && /^TIMON\s/i.test(name)
  }),
})))

for (const file of ['TIMON_RETAILER_PRODUCTS.json', 'TIMON_CASTING_PRODUCTS.json']) {
  const pages = await read(file)
  await write(file, pages.map(page => {
    const facts = []
    for (const raw of page.facts ?? []) {
      const line = raw.normalize('NFKC')
      for (const [, jan] of line.matchAll(/(?:JAN(?:コード)?|商品コード)[\s:】]*(\d{13})/gi)) facts.push(`JAN: ${jan}`)
      const spec = line.match(/^(?:【(?:Weight|Length|重量|全長|自重)】|(?:重量|全長|自重)(?:\([^)]*\))?\s*:)\s*([\d.]+)\s*(g|mm)(?:\s+(?:スローシンキング|フローティング|シンキング))?\s*$/i)
      if (spec) facts.push(`${spec[2].toLowerCase() === 'g' ? '重量' : '全長'}: ${spec[1]}${spec[2]}`)
    }
    const image = page.images?.find(entry => entry.url?.startsWith('https:'))
    const productName = value => value?.normalize('NFKC').split(' - 城峰釣具店')[0].split(': トラウト')[0]
      .replace(/【(?:ネコポス対象品|即日発送)】/g, '').trim()
    return {
      ...pick(page, ['url', 'finalUrl', 'status', 'checkedAt', 'error']),
      title: productName(page.title),
      headings: [...new Set((page.headings ?? []).map(productName)
        .filter(heading => /^(?:ジャッカル\s*)?(?:TIMON|ティモン|(?:チビ|ちび)パニクラ)/i.test(heading)))],
      facts: [...new Set(facts)],
      images: image ? [{ url: image.url }] : [],
    }
  }))
}

const variantPages = await read('TIMON_RETAILER_VARIANT_PAGES.json')
await write('TIMON_RETAILER_VARIANT_PAGES.json', variantPages.map(page => ({
  ...pick(page, ['url', 'store', 'checkedAt', 'httpStatus', 'finalUrl', 'title', 'options', 'shopOptions', 'error',
    'reviewedSoldOutDRFColors', 'verifiedSpecifications', 'vendor']),
  headings: page.store === 'troute' ? page.headings?.slice(0, 2) : page.headings?.filter(heading =>
    /^(?:新色入荷|新入荷|再入荷)?(?:ティモン|TIMON)|^ロデオクラフト/i.test(heading)),
  variants: page.variants?.map(variant => pick(variant, ['id', 'title', 'sku'])),
  tables: (page.tables ?? []).filter(([header]) => header?.[0]?.includes('カラー')).map(([header, ...rows]) =>
    [header, ...rows.map(([name, ...cells]) => [name, ...cells.map(cell => /円|売り切れ|完売/.test(cell))])]),
})))
