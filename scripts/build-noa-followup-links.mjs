import { readFile, writeFile } from 'node:fs/promises'
import { localTypeScript } from './load-local-typescript.mjs'
const loader = await localTypeScript()
try {
  const { noaModelExternalLinks } = await loader.load('src/data/noaModelExternalLinks.ts')
  const previous = JSON.parse(await readFile('docs/noa-color-photos/REVIEWED_LINKS.json', 'utf8'))
  const forodox = JSON.parse(await readFile('docs/noa-photo-coverage-followup/FORODOX_SOURCES.json', 'utf8'))
  const colors = ['ゲンちゃんブラウニー', 'キャンタの飛沫', 'ソルティマジョーラ改', '茶ッキン', 'SHOW', 'クズブルー']
  const additional = []
  for (const source of forodox) {
    if (source.httpStatus !== 200 || source.images.length !== 2) throw new Error('Missing reviewed FORODOX page')
    for (const color of colors) additional.push({ modelName: source.modelName, colorNames: [color],
      externalProductUrl: source.url, imageUrl: source.images[1].url, imageKind: 'weight-common-color-sample',
      sourceName: 'オープンウォーター', lastCheckedAt: '2026-11-23', collaboration: '2026 FORODOX',
      verificationBasis: '4重量の商品名・2026 FORODOX・全6色を照合。色名付き表裏見本を目視。重量別の実物写真ではなく重量共通見本として参照。' })
  }
  const jointer = 'https://www.jointer.jp/product/detail/rodio_craft_noa_noa_jr/'
  for (const weight of ['0.9', '1.2', '1.4']) for (const [color, image] of [['放流枝豆', '02'], ['腹黒', '04'], ['栃おとめ', '06'], ['レモン牛乳', '08'], ['ヤドク', '11'], ['腹黒II', '13']]) {
    additional.push({ modelName: `NOA Jr. ${weight}g`, colorNames: [color], externalProductUrl: jointer,
      imageUrl: `${jointer}images/${image}.jpg`, imageKind: 'weight-common-color-sample', sourceName: 'JOINTER / WILD-1',
      lastCheckedAt: '2026-11-23', collaboration: 'JOINTER別注',
      verificationBasis: '公式個別製品ページでJr.0.9/1.2/1.4gの仕様と色名・表裏写真を確認。写真に重量表示がないためJr.重量共通見本。腹黒と腹黒IIを分離。「背面グリーングロー」は別色と認定しない。' })
  }
  const route = 'https://t-route.net/products/rodio-craft-spoon-t-route-original-color-' + encodeURIComponent('ロデオクラフトスプーンt-routeオリカラ')
  for (const color of ['Route21', 'Liberty']) additional.push({ modelName: 'NOA 1.8g', colorNames: [color],
    externalProductUrl: route + '?variant=' + (color === 'Route21' ? '44183026598102' : '44183026630870'), imageUrl: 'https://t-route.net/cdn/shop/files/Rodio_6ddec791-3639-44d0-b93f-4282796bb343.png?v=1683348996',
    imageKind: 'product-photo', sourceName: 't-Route', lastCheckedAt: '2026-11-23', collaboration: 't-Routeオリジナル',
    verificationBasis: '販売元の個別商品とNOA1.8g選択肢、写真内のRoute21/Libertyラベル・NOA1.8g刻印・表裏を確認。他重量やBF写真へ拡張しない。' })
  additional.push({ modelName: 'NOA 1.8g', colorNames: ['復刻 T.SIV'],
    externalProductUrl: 'https://store.shopping.yahoo.co.jp/windsweb2/rodeo-noa18-1091.html',
    imageUrl: 'https://item-shopping.c.yimg.jp/i/n/windsweb2_rodeo-noa18-1091_1_d_20251206182001', imageKind: 'product-photo',
    sourceName: 'ウインズ', lastCheckedAt: '2026-11-23', collaboration: '1091 復刻',
    verificationBasis: 'NOA1.8g/1091販売ページ、画像内の「復刻T.SIV」ラベル・1.8g台紙・実物写真を照合。通常T.SIIや旧版T.SIVとは統合しない。' })
  const references = noaModelExternalLinks.map(link => {
    const source = previous.find(r => r.url === link.externalProductUrl)
    if (!source) throw new Error('Prior review missing')
    return { ...link, imageUrl: source.imageUrl, imageKind: 'product-photo' }
  }).concat(additional.map(({ collaboration, verificationBasis, ...source }) => source))
  await writeFile('docs/noa-photo-coverage-followup/ADDED_LINKS.json', JSON.stringify(additional, null, 2)+'\n')
  const header = `/** Reviewed external links. Images open at their source in another tab.\n * No image is fetched, embedded, cached or imported by the application.\n */\nimport type { NoaModelExternalLink } from './noaModelExternalLinks'\nexport interface NoaExternalReference extends NoaModelExternalLink {\n  imageUrl: string\n  imageKind: 'product-photo' | 'weight-common-color-sample'\n}\n\n`
  await writeFile('src/data/noaExternalReferences.ts', header + 'export const noaImageReferences: readonly NoaExternalReference[] = '+JSON.stringify(references, null, 2)+'\n\nexport const noaAdditionalExternalLinks: readonly NoaExternalReference[] = noaImageReferences.slice('+noaModelExternalLinks.length+')\n')
  console.log({ retainedModelLinks: noaModelExternalLinks.length, additionalLinks: additional.length, directImageReferences: references.length })
} finally { await loader.close() }
