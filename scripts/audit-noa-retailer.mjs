import 'fake-indexeddb/auto'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { localTypeScript } from './load-local-typescript.mjs'
const folder='docs/noa-retailer-product-links/'
const prior=JSON.parse(await readFile('docs/noa-photo-coverage-followup/AUDIT.json','utf8'))
const publicCatalog=JSON.parse(await readFile('docs/noa-photo-coverage-followup/CATALOG.json','utf8'))
const verified=JSON.parse(await readFile(folder+'VERIFIED_PRODUCTS.json','utf8'))
const candidates=JSON.parse(await readFile(folder+'CASTING_PRODUCTS.json','utf8'))
const health=JSON.parse(await readFile(folder+'CURRENT_LINK_HEALTH.json','utf8'))
const unavailable=health.filter(row=>row.httpStatus===404||row.error?.includes('404')).map(row=>row.url)
let catalog=publicCatalog
if(process.env.NOA_DEVICE_BACKUP){
  const raw=await readFile(process.env.NOA_DEVICE_BACKUP), data=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,'' )).data
  const makers=data.lureManufacturers.filter(m=>m.name==='RODIO CRAFT')
  const series=data.lureSeries.filter(s=>makers.some(m=>m.id===s.manufacturerId)&&s.name.startsWith('NOA'))
  const models=data.lureModels.filter(m=>series.some(s=>s.id===m.seriesId))
  const variants=data.lureVariants.filter(v=>models.some(m=>m.id===v.modelId))
  catalog={checkedAt:'2026-11-23',backupSha256:createHash('sha256').update(raw).digest('hex'),manufacturers:makers,series,models,variants}
}
await writeFile(folder+'CURRENT_CATALOG.json',JSON.stringify(catalog,null,2)+'\n')
const loader=await localTypeScript()
const {db}=await loader.load('src/db/database.ts')
try{
  await db.delete();await db.open()
  await db.lureManufacturers.bulkAdd(catalog.manufacturers);await db.lureSeries.bulkAdd(catalog.series)
  await db.lureModels.bulkAdd(catalog.models);await db.lureVariants.bulkAdd(catalog.variants)
  const {currentPhotoCatalog,resolveColorPhoto}=await loader.load('src/utils/lurePhotos.ts')
  const rows=[]
  for(const option of await currentPhotoCatalog()){
    const before=prior.rows.find(r=>r.variantId===option.variantId)
    if(!before||before.modelName!==option.modelName||before.colorName!==option.colorName)throw new Error('Catalog identity changed; review new row')
    const current=await resolveColorPhoto(option), source=verified.find(v=>v.variantId===option.variantId)
    const previousUrl=before.productUrl, validBefore=!!previousUrl&&!unavailable.includes(previousUrl)
    const urls=[current.externalProductUrl,...current.additionalProductLinks.map(l=>l.url)].filter(Boolean)
    if(validBefore&&!urls.includes(previousUrl))throw new Error('Valid prior URL lost')
    const oldPhoto=validBefore&&(before.imageKind==='product-photo'||before.modelName==='NOA 1.8g'&&!before.imageKind)
    const photoVerified=!!source||!!oldPhoto
    const hasPage=!!current.externalProductUrl&&!unavailable.includes(current.externalProductUrl)
    const action=source ? unavailable.includes(previousUrl)?'代替':'追加' : validBefore?'維持':'保留'
    const failed=candidates.find(p=>p.matchedVariantIds?.includes(option.variantId)&&!verified.some(v=>v.externalProductUrl===p.url))
    const mismatch=failed?.url.endsWith('/g4571385600599/')||failed?.error
    const reason=photoVerified?'商品名・重量・色名/番号・コードと個別実物写真を確認。'
      : mismatch?'キャスティングの商品名の重量と掲載画像が不一致。ゴールドエンド/Mr.御殿場の写真はNOA1.8gの表記・刻印。他重量へ割り当てない。'
      : before.imageKind==='weight-common-color-sample'?'既存商品ページは有効。重量共通の色見本なので個別重量の写真確認件数に含めない。'
      : hasPage?'既存商品ページを維持。対象重量の個別写真は未確認（共通リンクには他重量参照を含む）。'
      : before.reason
    rows.push({manufacturer:'RODIO CRAFT',family:option.seriesName,modelName:option.modelName,weightG:catalog.models.find(m=>m.id===option.modelId).weightG,
      modelId:option.modelId,variantId:option.variantId,colorName:option.colorName,colorCode:before.colorCode,
      action,additionType:action==='追加'?(validBefore?'既存有効URLを残して個別写真を補完':'未登録から追加'):'',
      previousUrl,productUrl:current.externalProductUrl??'',retainedOtherUrls:current.additionalProductLinks.map(l=>l.url).join(' | '),
      sourceName:current.sourceName,productCode:source?.productCode??'',jan:source?.jan??'',
      coverage:photoVerified?'個別写真確認済み':hasPage?'その他有効な商品ページ':'未確認',
      photoEvidence:source?.verificationBasis??(oldPhoto?'PR45以前の重量別写真確認・商品URLを維持。':'未確認'),
      candidateUrl:failed?.url??'',reason,checkedAt:'2026-11-23',devicePhotos:'写真バックアップ未提供。端末の既存写真を削除・更新しない。'})
  }
  const familyNames=['NOA','NOA Jr.','NOA S']
  const families=familyNames.map(f=>{const list=rows.filter(r=>r.family===f);return {family:f,rows:list.length,
    individualRows:list.filter(r=>r.coverage==='個別写真確認済み').length,individualUrls:new Set(list.filter(r=>r.coverage==='個別写真確認済み').map(r=>r.productUrl)).size,
    otherValidRows:list.filter(r=>r.coverage==='その他有効な商品ページ').length,otherValidUrls:new Set(list.filter(r=>r.coverage==='その他有効な商品ページ').map(r=>r.productUrl)).size,
    unconfirmedRows:list.filter(r=>r.coverage==='未確認').length,allValidUrls:new Set(list.map(r=>r.productUrl).filter(Boolean)).size}})
  const count=a=>rows.filter(r=>r.action===a).length
  const summary={checkedAt:'2026-11-23',startCommit:'5b55924',backupSha256:catalog.backupSha256,rows:rows.length,
    added:count('追加'),newlyLinked:rows.filter(r=>r.additionType==='未登録から追加').length,supplemented:rows.filter(r=>r.additionType==='既存有効URLを残して個別写真を補完').length,
    replaced:count('代替'),kept:count('維持'),held:count('保留'),newUrls:new Set(verified.map(r=>r.externalProductUrl)).size,
    uniqueValidProductUrls:new Set(rows.map(r=>r.productUrl).filter(Boolean)).size,directImageLinks:0,families}
  const columns=Object.keys(rows[0]),csv=vs=>vs.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')
  for(const [name,list]of[['ALL_COLORS',rows],['ADDED',rows.filter(r=>r.action==='追加')],['REPLACEMENTS',rows.filter(r=>r.action==='代替')],['HELD',rows.filter(r=>r.action==='保留')],['PHOTO_UNCONFIRMED',rows.filter(r=>r.coverage!=='個別写真確認済み')]])
    await writeFile(folder+name+'.csv','\ufeff'+[csv(columns),...list.map(r=>csv(columns.map(c=>r[c])))].join('\r\n')+'\r\n')
  await writeFile(folder+'AUDIT.json',JSON.stringify({summary,rows},null,2)+'\n')
  const md=['# NOA系販売店商品ページリンク棚卸し','','確認日2026-11-23。実モデル8件、713色行。カウント単位はモデル・重量・カラー。','',
    `追加${summary.added}行（未登録から${summary.newlyLinked}、既存URLを残す補完${summary.supplemented}）、404代替${summary.replaced}行、維持${summary.kept}行、保留${summary.held}行。新規URL${summary.newUrls}件、有効URL総数${summary.uniqueValidProductUrls}件。画像ファイル直リンクは0。`,
    '','| 系列 | 分母 | 個別写真確認済み行 | 同URL数 | その他有効ページ行 | 同URL数 | 未確認行 | 系列内有効URL数 |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
  for(const f of families)md.push(`| ${f.family} | ${f.rows} | ${f.individualRows} | ${f.individualUrls} | ${f.otherValidRows} | ${f.otherValidUrls} | ${f.unconfirmedRows} | ${f.allValidUrls} |`)
  md.push('','個別写真は写真そのもののアプリ追加を意味しない。共通ポスター・他重量参照は「その他有効」に分離。系列間・区分間で同じURLが重なるためURL数は加算しない。',
    '',`[全${rows.length}行・根拠](ALL_COLORS.csv)／[追加明細](ADDED.csv)／[404旧新URL・${summary.replaced}行](REPLACEMENTS.csv)／[保留全行・理由](HELD.csv)／[個別写真不足の全${rows.filter(r=>r.coverage!=='個別写真確認済み').length}行（維持リンクありも含む）](PHOTO_UNCONFIRMED.csv)`,'','## 保留の色名と重量','','| 色名 | 保留モデル・重量 | 理由 |','| --- | --- | --- |')
  const groups=new Map()
  for(const r of rows.filter(r=>r.action==='保留')){const key=r.colorName.normalize('NFKC').replace(/^#\d+\s+/,'');const g=groups.get(key)??[];g.push(r);groups.set(key,g)}
  for(const[name,list]of groups)md.push(`| ${name} | ${list.map(r=>r.modelName).join('、')} | ${list[0].reason} |`)
  await writeFile(folder+'INVENTORY.md',md.join('\n')+'\n')
  console.log(summary)
}finally{db.close();await db.delete();await loader.close()}
