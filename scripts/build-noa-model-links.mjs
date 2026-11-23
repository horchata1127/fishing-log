import { readFile, writeFile } from 'node:fs/promises'
const read = async p => JSON.parse(await readFile(p, 'utf8'))
const folder = 'docs/noa-color-photos/'
const reviewed = await read(folder + 'REVIEWED_LINKS.json')
const catalog = await read(folder + 'CATALOG.json')
const baseline = await read('docs/rc43/NOA_COLOR_AUDIT.json')
const fold = s => s.normalize('NFKC').replace(/\s/g, '').toLowerCase()
const links = reviewed.map(r => {
  if (!r.approved || r.localAssetAdded || !r.imageSha256 || !r.pageSha256) throw new Error('Unreviewed product')
  const group = baseline.groups.find(g => fold(g.colorName) === fold(r.colorName))
  const names = catalog.variants.filter(v => v.modelId === r.catalogModelId &&
    group?.variants.some(old => old.variantId === v.id)).map(v => v.colorName)
  return { modelName: r.modelName, colorNames: [...new Set([...names, r.colorName])], externalProductUrl: r.url,
    sourceName: r.sourceName, lastCheckedAt: r.checkedAt }
})
const keys = links.flatMap(l => l.colorNames.map(c => JSON.stringify([fold(l.modelName), fold(c)])))
if (new Set(keys).size !== keys.length) throw new Error('Duplicate scoped identity')
const header = `/** Visually reviewed individual product pages. No retailer image assets.\n * Scope is the photographed model/weight; similar labels and editions stay separate.\n * Evidence: docs/noa-color-photos/REVIEWED_LINKS.json\n */\nexport interface NoaModelExternalLink {\n  modelName: string\n  colorNames: readonly string[]\n  externalProductUrl: string\n  sourceName: string\n  lastCheckedAt: string\n}\n\n`
await writeFile('src/data/noaModelExternalLinks.ts', header + 'export const noaModelExternalLinks: readonly NoaModelExternalLink[] = ' + JSON.stringify(links, null, 2) + '\n')
console.log({ links: links.length, aliases: keys.length })
