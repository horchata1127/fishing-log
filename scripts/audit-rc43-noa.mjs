import { readFile, writeFile } from 'node:fs/promises'
import { localTypeScript } from './load-local-typescript.mjs'
const loader = await localTypeScript()
try {
  const { sharedColorForOption } = await loader.load('src/utils/noaPhotoCatalog.ts')
  const source = JSON.parse(await readFile('docs/rc43/NOA_CATALOG.json', 'utf8'))
  const models = new Map(source.models.map(m => [m.id, m])), series = new Map(source.series.map(s => [s.id, s]))
  const groups = new Map(), rows = []
  for (const variant of source.variants) {
    const model = models.get(variant.modelId), parent = series.get(model.seriesId)
    const option = { variantId: variant.id, modelId: model.id, manufacturerName: 'RODIO CRAFT', seriesName: parent.name, modelName: model.name, colorName: variant.colorName }
    const shared = sharedColorForOption(option)
    if (!shared) throw new Error(`Scope missing: ${model.name}`)
    const group = groups.get(shared.id) ?? { ...shared, variants: [] }
    group.variants.push({ variantId: variant.id, modelId: model.id, modelName: model.name, originalName: variant.colorName })
    groups.set(shared.id, group)
    rows.push([model.id, model.name, variant.id, variant.colorName, shared.id, shared.colorCode, shared.colorName, shared.colorVerificationStatus, shared.externalProductUrl ?? '', shared.sourceName])
  }
  const csv = values => values.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')
  await writeFile('docs/rc43/NOA_COLOR_CROSSWALK.csv', '\ufeff' + [csv(['modelId','modelName','variantId','originalName','sharedColorId','colorCode','colorName','verificationStatus','externalProductUrl','sourceName']), ...rows.map(csv)].join('\r\n')+'\r\n')
  const audit = { checkedAt: source.checkedAt, backupSha256: source.backupSha256,
    models: source.models.map(m => ({ ...m, colorCount: source.variants.filter(v => v.modelId === m.id).length })),
    sharedColorCount: groups.size, variants: rows.length,
    externalColorCount: [...groups.values()].filter(g => g.externalProductUrl).length,
    unresolvedSpellingCount: [...groups.values()].filter(g => g.colorVerificationStatus === 'review-needed').length,
    localPhotoCount: 0, modelSpecificPhotoRequirements: '未確認。画像を取得・比較していないため必要件数を推測しない。',
    groups: [...groups.values()],
  }
  await writeFile('docs/rc43/NOA_COLOR_AUDIT.json', JSON.stringify(audit, null, 2)+'\n')
  console.log(JSON.stringify({ models: audit.models.length, variants: audit.variants, shared: audit.sharedColorCount, external: audit.externalColorCount, unresolvedSpelling: audit.unresolvedSpellingCount }))
} finally { await loader.close() }
