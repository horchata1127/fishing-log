import { readFile, writeFile } from 'node:fs/promises'
import { localTypeScript } from './load-local-typescript.mjs'
const loader = await localTypeScript()
try {
  const folder = 'docs/noa-photo-coverage-followup/'
  const catalog = JSON.parse(await readFile(folder+'CATALOG.json', 'utf8'))
  const baseline = JSON.parse(await readFile('docs/noa-color-photos/AUDIT.json', 'utf8'))
  const checks = JSON.parse(await readFile(folder+'EXISTING_LINK_RECHECK.json', 'utf8'))
  const { sharedColorForOption, modelProductLinkForOption } = await loader.load('src/utils/noaPhotoCatalog.ts')
  // PR45's historical inspection metadata is not application image-link data.
  const { noaModelExternalLinks } = await loader.load('src/data/noaModelExternalLinks.ts')
  const reviews = JSON.parse(await readFile('docs/noa-color-photos/REVIEWED_LINKS.json', 'utf8'))
  const inspected = noaModelExternalLinks.map(link => ({ ...link, imageUrl: reviews.find(r => r.url === link.externalProductUrl)?.imageUrl, imageKind: 'product-photo' }))
    .concat(JSON.parse(await readFile(folder+'ADDED_LINKS.json', 'utf8')))
  const fold = s => s.normalize('NFKC').replace(/\s/g, '').toLowerCase()
  const rows = [], groups = new Map()
  for (const variant of catalog.variants) {
    const model = catalog.models.find(m => m.id === variant.modelId), series = catalog.series.find(s => s.id === model.seriesId)
    const option = { variantId: variant.id, modelId: model.id, manufacturerName: 'RODIO CRAFT', seriesName: series.name, modelName: model.name, colorName: variant.colorName }
    const shared = sharedColorForOption(option), old = baseline.rows.find(r => r.variantId === variant.id)
    if (old && (old.modelId !== model.id || old.originalName !== variant.colorName)) throw new Error('Catalog identity changed')
    const supplied = modelProductLinkForOption(option)
    const url = shared.externalProductUrl || supplied?.externalProductUrl || ''
    if (old?.externalProductUrl && old.externalProductUrl !== url) throw new Error('Existing URL changed')
    const image = inspected.find(r => fold(r.modelName) === fold(option.modelName) && r.colorNames.some(name => fold(name) === fold(option.colorName)))
    const exactImage = image?.externalProductUrl === url ? image : undefined
    const action = old?.externalProductUrl ? '既存リンク維持' : url ? 'リンク追加' : '保留'
    const note = url ? exactImage?.imageKind === 'weight-common-color-sample' ? '色名と対象モデル/重量を確認。画像は重量共通見本。別タブの出典参照のみ。'
      : exactImage ? '当該モデル・重量の実物写真を確認。画像は別タブの出典参照のみ。'
      : '既存商品ページを維持。RC43共通参照には他重量の写真を含むため、重量別写真の追加件数には含めない。'
      : /^(モンブラン|落ち葉|苔|ピンチクイーン|木の葉)$/.test(shared.colorName) ? '吉やの商品見本はジキル刻印。他モデルの写真をNOAに割り当てない。'
      : shared.colorName === '背面グリーングロー' ? 'JOINTER公式では複数色の裏面説明。単独の正式色と写真の対応が未確定。'
      : old?.reason ?? 'モデル・重量・色名を一意に照合できる写真ページが未確認。'
    const check = checks.find(c => c.url === url)
    const broken = check?.error?.includes('404') ?? false
    const row = { manufacturer: 'RODIO CRAFT', series: series.name, modelName: model.name, weightG: model.weightG,
      modelId: model.id, variantId: variant.id, colorName: variant.colorName, sharedColorName: shared.colorName, colorCode: shared.colorCode,
      baselineProductUrl: old?.externalProductUrl ?? '', productUrl: url, imageDirectUrl: exactImage?.imageUrl ?? '',
      imageKind: exactImage?.imageKind ?? '', sourceName: exactImage?.sourceName ?? supplied?.sourceName ?? shared.sourceName,
      action, linkHealth: broken ? '404・既存URL維持' : check?.httpStatus === 200 || action === 'リンク追加' ? '200・ページ確認済み' : '未確認/URLなし', appPhotoFilesAdded: 0, appImagePreviewsAdded: 0,
      devicePhotoStatus: 'RC45釣行バックアップは写真本体を含まないため、端末内写真は未確認。既存の写真機能を維持。', reason: broken ? '既存URLを維持したが現在404。対象重量・色に適合する代替写真ページは未確定。' : note }
    rows.push(row)
    const group = groups.get(shared.id) ?? { id: shared.id, name: shared.colorName, code: shared.colorCode, rows: [] }
    group.rows.push(row); groups.set(shared.id, group)
  }
  const counts = { realModels: new Set(rows.map(r => r.modelId)).size, rows: rows.length, groups: groups.size,
    priorLinksKept: rows.filter(r => r.action === '既存リンク維持').length,
    prior73Kept: baseline.rows.filter(r => r.action === 'リンクを追加').filter(old => rows.some(r => r.variantId === old.variantId && r.productUrl === old.externalProductUrl)).length,
    newProductLinks: rows.filter(r => r.action === 'リンク追加').length, remaining: rows.filter(r => r.action === '保留').length,
    imageDirectLinks: rows.filter(r => r.imageDirectUrl).length,
    weightSpecificPhotoReferences: rows.filter(r => r.imageKind === 'product-photo').length,
    commonSampleReferences: rows.filter(r => r.imageKind === 'weight-common-color-sample').length,
    existing404Rows: rows.filter(r => r.linkHealth.startsWith('404')).length,
    localPhotoFilesAdded: 0, appImagePreviewsAdded: 0 }
  const csv = values => values.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')
  const columns = Object.keys(rows[0])
  for (const [name, items] of [['ALL_COLORS', rows], ['ADDED', rows.filter(r => r.action === 'リンク追加')], ['HELD', rows.filter(r => r.action === '保留')], ['BROKEN_LINKS', rows.filter(r => r.linkHealth.startsWith('404'))]])
    await writeFile(folder+name+'.csv', '\ufeff'+[csv(columns), ...items.map(r => csv(columns.map(c => r[c])))].join('\r\n')+'\r\n')
  await writeFile(folder+'AUDIT.json', JSON.stringify({ checkedAt: catalog.checkedAt, backupSha256: catalog.backupSha256, counts, models: catalog.models, rows }, null, 2)+'\n')
  const md = ['# NOAリンク追加・全色再棚卸し', '', '基準日2026-11-23。最新RC45原本を読み取り専用で照合。分母は実モデル8件、713色行、101照合グループ。', '',
    `商品ページリンク：既存${counts.priorLinksKept}行維持（前回追加73行をすべて含む）、今回${counts.newProductLinks}行追加、残${counts.remaining}行保留。`, '',
    `画像の直リンク：${counts.imageDirectLinks}行（重量別写真への参照${counts.weightSpecificPhotoReferences}行、重量共通の色見本への参照${counts.commonSampleReferences}行）。画像ファイル保存・同梱・アプリ内プレビューは0件。画像への参照を写真追加件数に含めない。`, '',
    `既存2ページの404は${counts.existing404Rows}行へ影響。[BROKEN_LINKS.csv](BROKEN_LINKS.csv) に別記し、既存URLを削除・置換しない。リンク未登録335行とは別の不足。`, '',
    '| モデル | 重量(g) | 登録行数 | 既存維持 | 今回追加 | 保留 |', '| --- | ---: | ---: | ---: | ---: | ---: |']
  for (const model of catalog.models) {
    const items = rows.filter(r => r.modelId === model.id)
    md.push(`| ${model.name} | ${model.weightG ?? '汎用・未確定'} | ${items.length} | ${items.filter(r => r.action === '既存リンク維持').length} | ${items.filter(r => r.action === 'リンク追加').length} | ${items.filter(r => r.action === '保留').length} |`)
  }
  md.push('', '## 追加した全行', '', '| モデル・重量 | 色 | 商品ページ | 画像の種類 |', '| --- | --- | --- | --- |')
  for (const row of rows.filter(r => r.action === 'リンク追加')) md.push(`| ${row.modelName} | ${row.colorName} | [${row.sourceName}](${row.productUrl}) | ${row.imageKind === 'product-photo' ? '重量別写真（出典直リンク）' : '重量共通見本（出典直リンク）'} |`)
  md.push('', '## 保留グループの全明細', '', '全713行の状態・元の名前・URL・画像参照は [ALL_COLORS.csv](ALL_COLORS.csv)。保留335行は [HELD.csv](HELD.csv)。既存リンクのある色でも、アプリへの写真追加は行っていない。', '',
    '| 色名 | 番号 | 保留モデル・重量 | 理由 |', '| --- | --- | --- | --- |')
  for (const group of groups.values()) {
    const held = group.rows.filter(r => r.action === '保留')
    if (held.length) md.push(`| ${group.name} | ${group.code} | ${held.map(r => r.modelName).join('、')} | ${held[0].reason} |`)
  }
  await writeFile(folder+'INVENTORY.md', md.join('\n')+'\n')
  console.log(counts)
} finally { await loader.close() }
