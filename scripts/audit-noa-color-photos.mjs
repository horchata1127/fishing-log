import { readFile, writeFile } from 'node:fs/promises'
import { localTypeScript } from './load-local-typescript.mjs'
const loader = await localTypeScript()
try {
  const { sharedColorForOption, modelProductLinkForOption } = await loader.load('src/utils/noaPhotoCatalog.ts')
  const folder = 'docs/noa-color-photos/'
  const catalog = JSON.parse(await readFile(folder + 'CATALOG.json', 'utf8'))
  const old = JSON.parse(await readFile('docs/rc43/NOA_COLOR_AUDIT.json', 'utf8'))
  // Refuse to silently apply RC43 IDs to a newer, changed catalog.
  const baselineIds = new Map(old.groups.flatMap(g => g.variants.map(v => [v.variantId, v])))
  const models = new Map(catalog.models.map(m => [m.id, m]))
  const series = new Map(catalog.series.map(s => [s.id, s]))
  const rows = [], groups = new Map()
  for (const variant of catalog.variants) {
    const model = models.get(variant.modelId), parent = series.get(model.seriesId)
    const option = { variantId: variant.id, modelId: model.id, manufacturerName: 'RODIO CRAFT', seriesName: parent.name, modelName: model.name, colorName: variant.colorName }
    const shared = sharedColorForOption(option)
    if (!shared) throw new Error(`NOA scope missing: ${model.name}`)
    const baseline = baselineIds.get(variant.id)
    if (baseline && (baseline.modelId !== variant.modelId || baseline.originalName !== variant.colorName)) throw new Error('RC43 identity changed')
    const current = modelProductLinkForOption(option)
    const priorUrl = shared.externalProductUrl ?? ''
    const url = priorUrl || current?.externalProductUrl || ''
    const action = priorUrl ? '既存リンク維持' : current ? 'リンクを追加' : '保留'
    const reissue = /2017松本|2021井野|2021早乙女|2022早乙女|2022松本|^T\.S II$/.test(shared.colorName)
    const similar = /K\.F[246]$|N\.O2|表蛍光R|2020井野カラー$|マンゴー\/ブラック/.test(shared.colorName)
    const joint = /^(放流枝豆|腹黒|腹黒II|栃おとめ|レモン牛乳|ヤドク|背面グリーングロー)$/.test(shared.colorName)
    const forodox = ['ゲンちゃんブラウニー', 'キャンタの飛沫', 'ソルティマジョーラ改', '茶ッキン', 'SHOW', 'クズブルー'].includes(shared.colorName)
    const reason = url ? '写真のアプリ保存・バックアップ・再配布の許可を確認できず。配布写真は未登録。'
      : forodox ? '2026 FORODOX（RODIO CRAFT×FOCUS×Deep Paradox）。1.8g集合実物写真は色名ラベルなし、色名付き画像は複数モデルの共通見本。対象色/重量を一意に照合できず保留。'
      : reissue ? '2025セレクト再販などの候補あり。旧版との同塗装・面/UV/グローの一致未確認。'
      : similar ? '類似名・略称・同番号だけでは同色と確定できない。既存名/IDを保持して現物ラベル確認待ち。'
      : joint ? 'JOINTER等の別モデル/重量の候補のみ。対象重量の写真と限定区分の一致未確認。'
      : '対象モデル・重量・色名に一致する個別実物写真ページを確保できず。他重量/集合・代表画像は採用しない。'
    const row = { modelId: model.id, modelName: model.name, weightG: model.weightG, variantId: variant.id,
      originalName: variant.colorName, sharedColorId: shared.id, colorName: shared.colorName, colorCode: shared.colorCode,
      baselineState: priorUrl ? '商品ページリンクのみ' : 'どちらもなし',
      currentState: url ? '商品ページリンクのみ' : 'どちらもなし', action, externalProductUrl: url,
      devicePhotoStatus: 'RC45釣行バックアップは写真を含まない。端末内の既存写真は未確認。',
      photoAdded: false, reason, shootingRequest: `${model.name} / ${variant.colorName}${forodox ? '（2026 FORODOX）' : ''}：ラベルを含めて表裏2面。UV・グロー色は発光状態も撮影。` }
    rows.push(row)
    const group = groups.get(shared.id) ?? { colorName: shared.colorName, colorCode: shared.colorCode, rows: [] }
    group.rows.push(row); groups.set(shared.id, group)
  }
  const count = action => rows.filter(r => r.action === action).length
  const audit = { checkedAt: catalog.checkedAt, backupSha256: catalog.backupSha256,
    models: catalog.models.map(m => ({ ...m, colorCount: rows.filter(r => r.modelId === m.id).length })),
    counts: { modelsWithColors: new Set(rows.map(r => r.modelId)).size, variants: rows.length, groups: groups.size,
      actualPhotosAdded: 0, linksAdded: count('リンクを追加'), held: count('保留'), existingLinksKept: count('既存リンク維持') },
    groups: [...groups.values()].map(g => ({ ...g, newLinks: g.rows.filter(r => r.action === 'リンクを追加').length,
      held: g.rows.filter(r => r.action === '保留').length, existingLinks: g.rows.filter(r => r.action === '既存リンク維持').length })), rows }
  await writeFile(folder + 'AUDIT.json', JSON.stringify(audit, null, 2)+'\n')
  const columns = Object.keys(rows[0])
  const csv = values => values.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')
  await writeFile(folder + 'ALL_COLORS.csv', '\ufeff' + [csv(columns), ...rows.map(r => csv(columns.map(c => r[c])))].join('\r\n')+'\r\n')
  await writeFile(folder + 'SHOOTING_LIST.csv', '\ufeff' + [csv(columns), ...rows.filter(r => r.action === '保留').map(r => csv(columns.map(c => r[c])))].join('\r\n')+'\r\n')
  const lines = ['# NOA 全色棚卸し', '', '基準日：2026-11-23。最新RC45バックアップの公開カタログ項目のみを抽出。', '',
    '件数はモデル×カラー行で集計。1色のリンクが1重量にあっても、他重量の完了には数えない。写真追加0件、リンク追加'+audit.counts.linksAdded+'件、保留'+audit.counts.held+'件、既存リンク維持'+audit.counts.existingLinksKept+'件。合計'+rows.length+'行。', '',
    '| モデル | 重量(g) | 色数 | リンク追加 | 保留 | 既存リンク維持 |', '| --- | ---: | ---: | ---: | ---: | ---: |']
  for (const model of audit.models) {
    const items = rows.filter(r => r.modelId === model.id)
    lines.push(`| ${model.name} | ${model.weightG ?? '未確定（汎用）'} | ${items.length} | ${items.filter(r => r.action === 'リンクを追加').length} | ${items.filter(r => r.action === '保留').length} | ${items.filter(r => r.action === '既存リンク維持').length} |`)
  }
  lines.push('', `## 全${groups.size}照合グループの明細`, '', `「保留モデル」には対象重量も含めて記載。旧版/再販版・略称は自動統合しない。全${rows.length}行の元の色名・ID・URL・理由は [ALL_COLORS.csv](ALL_COLORS.csv)、撮影待ち一覧は [SHOOTING_LIST.csv](SHOOTING_LIST.csv) を参照。端末内の既存写真は別の写真バックアップが未提供のため未確認。状態は配布マスターの写真/リンクで判定。`, '',
    '| 番号 | 色名 | リンク追加モデル | 既存リンク行数 | 保留モデル | 保留理由 |', '| --- | --- | --- | ---: | --- | --- |')
  for (const group of audit.groups) lines.push(`| ${group.colorCode} | ${group.colorName} | ${group.rows.filter(r => r.action === 'リンクを追加').map(r => `[${r.modelName}](${r.externalProductUrl})`).join('、')} | ${group.existingLinks} | ${group.rows.filter(r => r.action === '保留').map(r => r.modelName).join('、')} | ${group.rows.find(r => r.action === '保留')?.reason ?? '全モデルにリンクあり。写真の利用許可・撮影提供待ち。'} |`)
  await writeFile(folder + 'INVENTORY.md', lines.join('\n')+'\n')
  console.log(audit.counts)
  console.log('Groups with added links:', audit.groups.filter(g => g.newLinks).length, 'with holds:', audit.groups.filter(g => g.held).length)
} finally { await loader.close() }
