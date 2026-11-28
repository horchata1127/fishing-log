import 'fake-indexeddb/auto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { assertReviewedCatalog, backupFingerprints, sha256 as digest } from './catalog-audit-fingerprint.mjs'
import { localTypeScript } from './load-local-typescript.mjs'

const backupPath = process.argv[2]
if (!backupPath) throw new Error('Pass the path to the device backup')
const output = 'docs/lure-external-links/'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const raw = await readFile(backupPath)
const backup = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
const { data } = backup
const fingerprints = backupFingerprints(raw, backup)
const historical = await json('docs/noa-retailer-product-links/IMAGE_RESTORATION_CHECKS.json')
const health = await json('docs/noa-retailer-product-links/AUDIT.json')
const review = await json(output+'RODIO_REVIEW.json')
const prior = await json('docs/rodio-driftspin-bf/ACCEPTED.json')
const priorHolds = await json('docs/rodio-driftspin-bf/HELD.json')
const imageSpotChecks = new Map((await json(output+'RODIO_IMAGE_SPOT_CHECKS.json')).map(check=>[check.url,check]))
const timon = await json(output+'TIMON_REVIEW.json').catch(error=>{
  if (error.code === 'ENOENT') return undefined
  throw error
})
if (timon) assertReviewedCatalog(timon.stats, fingerprints, 'TIMON')
const timonRetailer = await json(output+'TIMON_RETAILER_REVIEW.json').catch(error=>{
  if(error.code==='ENOENT')return undefined
  throw error
})
const timonRetailerStatuses = new Map(timonRetailer?.rows?.map(row=>[row.variantId,row]))
const timonRetailerProducts = new Map(timonRetailer?.products.map(row=>[row.variantId,row]))
const timonRetailerImages = new Map(timonRetailer?.imageCandidates.map(row=>[row.variantId,row]))
const timonRows = new Map(timon?.rows.map(row=>[row.variantId,row]))
const timonPages = timon ? await Promise.all((await readdir(output+'timon-pages')).filter(file=>file.endsWith('.json'))
  .map(file=>json(output+'timon-pages/'+file))) : []
const timonChecks = new Map(timon ? (await json(output+'TIMON_IMAGE_SPOT_CHECKS.json').catch(error=>{
  if(error.code === 'ENOENT')return []
  throw error
})).map(check=>[check.url,check]) : [])
const priorAudit = await json('docs/rodio-driftspin-bf/AUDIT.json')
const optionalJson = (name,fallback) => json(output+name).catch(error=>{
  if (error.code === 'ENOENT') return fallback
  throw error
})
const manufacturerReviews = await Promise.all(['SMITH','PALMS','ROB LURE'].map(async maker=>{
  const name = maker.replaceAll(' ','_')
  const report = await optionalJson(name+'_REVIEW.json')
  if (report) assertReviewedCatalog(report.stats, fingerprints, maker)
  const checks = report ? await optionalJson(name+'_IMAGE_SPOT_CHECKS.json',[]) : []
  return { maker, report, rows: new Map(report?.rows.map(row=>[row.variantId,row])), checks }
}))
const [smith,palms,robLure] = manufacturerReviews.map(review=>review.report)
const byMaker = new Map(manufacturerReviews.map(review=>[review.maker,review]))
const manufacturerChecks = new Map(manufacturerReviews.flatMap(review=>review.checks.map(check=>[check.url,check])))
const knownProducts = new Set(health.rows.flatMap(row => [row.productUrl, ...row.retainedOtherUrls.split(' | ')]).filter(Boolean))
const historicalChecks = new Map(historical.definitions.map(ref => [ref.imageUrl, ref]))
const loader = await localTypeScript()
const { db } = await loader.load('src/db/database.ts')
try {
  const { externalManufacturer } = await loader.load('src/utils/lureExternalCatalog.ts')
  const { imageReferenceForOption, isNoaOption } = await loader.load('src/utils/noaPhotoCatalog.ts')
  const { externalImageHoldReason } = await loader.load('src/data/noaExternalImagePolicy.ts')
  const { resolveColorPhoto, currentPhotoCatalog } = await loader.load('src/utils/lurePhotos.ts')
  const { lureMasterManifest } = await loader.load('src/data/lureMasterManifest.ts')
  const { createLureMasterUpdater } = await loader.load('src/utils/lureMasterApply.ts')
  const { rodioExternalReferences } = await loader.load('src/data/rodioExternalReferences.ts')
  const key = option => JSON.stringify([option.seriesName, option.modelName, option.colorName])
  const reviewed = new Map(rodioExternalReferences.map(r => [key(r),r]))
  const makers = data.lureManufacturers.filter(m => externalManufacturer(m.name))
  const series = data.lureSeries.filter(s => makers.some(m => m.id === s.manufacturerId))
  const originalModels = data.lureModels.filter(m => series.some(s => s.id === m.seriesId))
  const originalVariants = data.lureVariants.filter(v => originalModels.some(m => m.id === v.modelId))
  await db.open()
  await db.lureManufacturers.bulkAdd(makers)
  await db.lureSeries.bulkAdd(series)
  await db.lureModels.bulkAdd(originalModels)
  await db.lureVariants.bulkAdd(originalVariants)
  const initial = new Map()
  for (const option of await currentPhotoCatalog()) {
    if (!isNoaOption(option)) continue
    const resolved = await resolveColorPhoto({ ...option, modelDetails: undefined })
    initial.set(option.variantId, { hasProduct: !!resolved?.externalProductUrl, image: resolved?.imageReference })
  }

  const targets = lureMasterManifest.targets.filter(t => t.revisions.includes('RC45'))
  const updater = createLureMasterUpdater(db,{...lureMasterManifest,targets,pending:[]})
  const preview = await updater.preview()
  await updater.apply(preview.comparisonToken)
  const repeat = await updater.preview()
  if (repeat.addedColors || repeat.addedModels || preview.heldColors) throw new Error('RC45 is not fully recognized or idempotent')
  const models = await db.lureModels.toArray(), variants = await db.lureVariants.toArray()
  const modelById = new Map(models.map(m=>[m.id,m]))
  const variantById = new Map(variants.map(v=>[v.id,v]))
  if(originalModels.some(m=>JSON.stringify(m)!==JSON.stringify(modelById.get(m.id))) ||
    originalVariants.some(v=>JSON.stringify(v)!==JSON.stringify(variantById.get(v.id)))) throw new Error('Original catalog ID or value changed')

  const rows = []
  for (const option of await currentPhotoCatalog()) {
    const variant = variantById.get(option.variantId)
    const model = modelById.get(option.modelId)
    const resolved = await resolveColorPhoto(option)
    const historicalImage = imageReferenceForOption(option)
    const checkedImage = historicalImage && historicalChecks.get(historicalImage.imageUrl)
    const retailer = externalManufacturer(option.manufacturerName)==='TIMON' ? timonRetailerProducts.get(option.variantId) : undefined
    const retailImage = retailer && timonRetailerImages.get(option.variantId)
    const evidence = reviewed.get(key(option)) ?? rodioExternalReferences.find(r => r.modelName===option.modelName &&
      r.seriesName===option.seriesName && r.colorAliases?.includes(option.colorName))
    const canonicalModel = /^(DRIFT SPIN) (0.7|1.3)g$/.test(model.name) ? (model.weightG===0.7?'DRIFT SPIN 27 0.7g':'DRIFT SPIN 37 1.3g') : model.name
    const precedent = evidence && prior.find(r=>r.model===canonicalModel && r.label===evidence.colorName && r.sourceUrl===evidence.evidenceUrl)
    const page = evidence && review.pages.find(r=>r.url===evidence.evidenceUrl)
    const official = externalManufacturer(option.manufacturerName) === 'TIMON' ? timonRows.get(option.variantId) : undefined
    const makerReview = byMaker.get(externalManufacturer(option.manufacturerName))
    const makerRow = makerReview?.rows.get(option.variantId)
    const candidate = precedent?.imageCandidateUrl || page?.images?.[0]?.url || official?.image?.candidateUrl || makerRow?.image?.url
    const image = historicalImage || resolved?.imageReference
    const imageStatus = image ? !resolved?.imageReference ? 'held' :
      historicalImage ? checkedImage?.status === 'success' ? 'historically-decoded' : 'decode-unverified' : 'decoded' :
      candidate || official?.image?.candidateUrls?.length ? 'held' : 'unreviewed'
    const urls = [resolved?.externalProductUrl, ...resolved?.additionalProductLinks.map(link => link.url) ?? []].filter(Boolean)
    const existing = initial.get(option.variantId)
    const newProduct = !!urls.length && !existing?.hasProduct
    if (makerReview?.report && (!makerRow || makerRow.productUrl !== urls[0])) {
      throw new Error(makerReview.maker+' resolution does not match the reviewed row: '+option.variantId)
    }
    rows.push({ manufacturer: externalManufacturer(option.manufacturerName), series: option.seriesName, model: option.modelName,
      weightG: model.weightG ?? '', lengthMm: model.lengthMm ?? '', actionType: model.actionType ?? '',
      buoyancy: variant.catalogEvidence?.buoyancy ?? '', rattle: variant.catalogEvidence?.rattle ?? '',
      variantId: option.variantId, modelId: option.modelId, color: option.colorName,
      colorCode: variant.catalogEvidence?.colorCode || resolved?.shared?.colorCode || makerRow?.colorCode || '',
      catalogStatus: originalVariants.some(v=>v.id===option.variantId) ? 'existing' : 'added-by-rc45-import',
      productUrl: urls[0] ?? '', additionalProductUrls: urls.slice(1).join(' | '),
      productKind: newProduct ? makerRow?.kind ?? retailer?.kind ?? evidence?.product?.kind ?? '' : '',
      productStatus: !urls.length ? (official?.productStatus ?? 'held-unmatched') : newProduct ? 'new-reviewed' :
        urls.every(url => knownProducts.has(url)) ? 'existing-reviewed' : 'existing-health-unverified',
      productEvidenceDate: newProduct ? makerRow?.checkedAt ?? retailer?.checkedAt ?? evidence?.checkedAt ?? '' : urls.length && urls.every(url => knownProducts.has(url)) ? health.summary.checkedAt : '',
      productBasis: newProduct ? makerRow?.basis ?? retailer?.basis ?? evidence?.verificationBasis ?? '' : '',
      imageUrl: image?.imageUrl ?? candidate ?? '', imageStatus, imageKind: image?.imageKind ?? official?.image?.kind ?? makerRow?.image?.kind ?? '',
      officialProductCandidate: official?.officialUrl ?? makerRow?.candidateUrl ?? '', officialProductClass: official?.productCandidateKind ?? makerRow?.kind ?? '',
      officialEvidenceDate: official?.checkedAt ?? makerRow?.checkedAt ?? '', officialJan: official?.officialJan ?? '',
      officialProductStatus: official?.productStatus ?? makerRow?.status ?? '',
      retailerProductCandidate: retailer?.url ?? (makerRow?.sourceType==='retailer' ? makerRow.productUrl : ''),
      retailerImageCandidate: retailImage?.url ?? (makerRow?.sourceType==='retailer' ? makerRow.image?.url ?? '' : ''),
      retailerProductStatus: official ? timonRetailerStatuses.get(option.variantId)?.status ?? '' :
        makerRow?.sourceType==='retailer' ? makerRow.status : '',
      imageDecodeStatus: checkedImage?.status==='success' || imageSpotChecks.get(candidate)?.status==='decoded' || timonChecks.get(candidate)?.decoded
        ? 'decoded' : manufacturerChecks.get(candidate)?.status ?? checkedImage?.status ?? 'not-tested',
      officialImageAlternatives: official?.image?.candidateUrls?.join(' | ') ?? '',
      imageEvidenceDate: checkedImage?.checkedAt ?? evidence?.checkedAt ?? official?.checkedAt ?? '', imageSourceName: image?.sourceName ?? (official?.image ? 'JACKALL / TIMON' : candidate ? evidence?.sourceName : '') ?? '',
      imageHoldReason: imageStatus === 'held' ? (historicalImage && externalImageHoldReason(historicalImage.sourceName)) ||
        official?.image?.status || checkedImage?.reason || (candidate ? 'アプリ内表示の許諾と画像の個別対応が未確認。' : '既存NOAポリシーによる保留') : '',
      ...(makerRow ? { imageSourceName: makerRow.sourceName ?? '', imageEvidenceDate: makerRow.checkedAt,
        imageHoldReason: makerRow.image?.reason ?? '' } : {}),
      sourceName: resolved?.sourceName ?? '',
      evidenceProductCandidate: variant.catalogEvidence?.productUrl ?? '',
      evidenceManufacturerCandidate: variant.catalogEvidence?.manufacturerUrl ?? '',
      evidenceRetailerCandidate: variant.catalogEvidence?.retailerUrl ?? '',
      beforeProduct: !!existing?.hasProduct, beforeImageKind: existing?.image && historicalChecks.get(existing.image.imageUrl)?.status==='success' ? existing.image.imageKind : '',
      holdReason: urls.length ? '' : makerRow?.reason ?? official?.reason ?? (option.manufacturerName==='RODIO CRAFT' ? '調査済みの公開資料でモデル仕様と色が一意に一致する個別商品ページを確定できず' : 'RC48以降の対象') })
  }
  if (rows.some(row=>row.productStatus==='new-reviewed' && (!row.productBasis||!row.productEvidenceDate))) throw new Error('New product has no evidence')
  if (rows.filter(r=>r.series==='BF'||r.series==='DRIFT SPIN').filter(r=>r.productUrl).length!==priorAudit.summary.totalColorRows) {
    throw new Error('Integrated BF / DRIFT SPIN links do not cover all reviewed rows')
  }

  const rollup = (label,list,modelCount,oldModelCount,zeroColorModels) => {
    const before = list.filter(row => row.catalogStatus === 'existing')
    const product = list.filter(row => row.productUrl)
    const urls = product.flatMap(row => [row.productUrl, ...row.additionalProductUrls.split(' | ').filter(Boolean)])
    const image = list.filter(row => row.imageUrl)
    const display = list.filter(row => ['historically-decoded','decoded'].includes(row.imageStatus))
    const coverage = (items, productRows, individual, sample, heldProduct, heldImage) => {
      const rate = count => items.length ? Number((100*count/items.length).toFixed(2)) : null
      return { colorRows: items.length, productRows, productCoveragePercent: rate(productRows),
        individualPhotoRows: individual, individualPhotoPercent: rate(individual),
        commonColorSampleRows: sample, commonColorSamplePercent: rate(sample), heldProductRows: heldProduct, heldImageRows: heldImage }
    }
    const beforeProducts = before.filter(r=>r.beforeProduct).length
    const officialRows = list.filter(row=>timonRows.has(row.variantId))
    const makerSummaries = manufacturerReviews.flatMap(review=>{
      const matches = list.filter(row=>row.manufacturer===review.maker && review.rows.has(row.variantId))
      if (!matches.length) return []
      return [[review.maker==='ROB LURE' ? 'robLureReview' : review.maker.toLowerCase()+'Review', {
        matchedProductRows: matches.filter(row=>row.productUrl).length,
        individualColorProductRows: matches.filter(row=>row.productKind==='individual-color').length,
        modelColorListRows: matches.filter(row=>row.productKind==='model-color-list').length,
        candidatePhotos: matches.filter(row=>row.imageKind==='product-photo').length,
        candidateModelColorSamples: matches.filter(row=>row.imageKind==='official-color-sample').length,
        candidateSharedColorSamples: matches.filter(row=>row.imageKind==='weight-common-color-sample').length,
        productHoldsByReason: Object.fromEntries([...Map.groupBy(matches.filter(row=>!row.productUrl),row=>review.rows.get(row.variantId).reason)].map(([reason,items])=>[reason,items.length])),
        imageHoldsByReason: Object.fromEntries([...Map.groupBy(matches.filter(row=>row.imageHoldReason),row=>row.imageHoldReason)].map(([reason,items])=>[reason,items.length])),
      }]]
    })
    const matchedOfficial = officialRows.filter(row=>row.officialProductStatus==='verified-activation-held')
    const candidateRate = count => officialRows.length ? Number((100*count/officialRows.length).toFixed(2)) : null
    const retailerRows = officialRows.filter(row=>row.retailerProductCandidate)
    const individual = matchedOfficial.filter(row=>row.imageKind==='product-photo').length
    const common = matchedOfficial.filter(row=>['official-color-sample','weight-common-color-sample'].includes(row.imageKind)).length
    return { label, models: modelCount, priorModels: oldModelCount, zeroColorModels, rows: list.length,
      existingProductRows: product.filter(r=>r.beforeProduct).length, newProductRows: product.filter(r=>!r.beforeProduct).length,
      productOnlyRows: product.filter(row => !display.includes(row)).length, uniqueProductUrls: new Set(urls).size,
      repeatedProductUrlOccurrences: urls.length - new Set(urls).size, imageReferenceRows: image.length,
      uniqueImageUrls: new Set(image.map(row => row.imageUrl)).size, repeatedImageUrlOccurrences: image.length - new Set(image.map(row=>row.imageUrl)).size,
      ...(officialRows.length ? { officialReview: {
        rows:officialRows.length, matchedProductRows:matchedOfficial.length,
        matchedProductRate:candidateRate(matchedOfficial.length),
        uniqueMatchedProductUrls:new Set(matchedOfficial.map(row=>row.officialProductCandidate)).size,
        individualImageCandidates:individual, individualCandidateRate:candidateRate(individual),
        commonImageCandidates:common, commonCandidateRate:candidateRate(common),
        productHoldsByReason:Object.fromEntries([...Map.groupBy(officialRows,r=>timonRows.get(r.variantId).reason)].map(([reason,items])=>[reason,items.length])),
        imageHoldsByReason:Object.fromEntries([...Map.groupBy(officialRows.filter(r=>r.imageHoldReason),r=>r.imageHoldReason)]
          .map(([reason,items])=>[reason,items.length])),
      } } : {}),
      ...(officialRows.length && timonRetailer ? { retailerReview: {
        matchedProductRows:retailerRows.length, registeredProductRows:retailerRows.filter(r=>r.productUrl).length,
        registeredProductRate:candidateRate(retailerRows.filter(r=>r.productUrl).length),
        uniqueProductUrls:new Set(retailerRows.map(r=>r.retailerProductCandidate)).size,
        heldImageRows:retailerRows.filter(r=>r.retailerImageCandidate).length,
        productStatuses:Object.fromEntries([...Map.groupBy(officialRows,r=>r.retailerProductStatus)].map(([status,items])=>[status,items.length])),
      }} : {}),
      ...Object.fromEntries(makerSummaries),
      before: coverage(before,beforeProducts,before.filter(r=>r.beforeImageKind==='product-photo').length,
        before.filter(r=>r.beforeImageKind&&r.beforeImageKind!=='product-photo').length,before.length-beforeProducts,
        before.filter(r=>r.imageStatus==='held'&&historicalChecks.has(r.imageUrl)).length),
      after: coverage(list,product.length,display.filter(r=>r.imageKind==='product-photo').length,
        display.filter(r=>r.imageKind!=='product-photo').length,list.length-product.length,list.filter(r=>r.imageStatus==='held').length) }
  }
  const grouped = (label,list,models) => rollup(label,list,models.length,
    models.filter(m=>originalModels.some(om=>om.id===m.id)).length,models.filter(m=>!list.some(r=>r.modelId===m.id)).length)
  const inventory = makers.map(maker => {
    const name = externalManufacturer(maker.name)
    const parents = series.filter(s => s.manufacturerId === maker.id)
    const modelRows = models.filter(m => parents.some(s => s.id === m.seriesId))
    return { ...grouped(name,rows.filter(r=>r.manufacturer===name),modelRows), series: parents.map(s=>{
      const children=modelRows.filter(m=>m.seriesId===s.id)
      return { ...grouped(s.name,rows.filter(r=>children.some(m=>m.id===r.modelId)),children),
        modelDetails: children.map(m=>({modelId:m.id,weightG:m.weightG??null,lengthMm:m.lengthMm??null,
          ...grouped(m.name,rows.filter(r=>r.modelId===m.id),[m])})) }
    }) }
  })

  const pages = new Map(), checkedPages = new Map(review.pages.map(record=>[record.url,record]))
  function candidate(manufacturer,series,model,kind,url,origin,evidence) {
    if(!url)return
    const key=JSON.stringify([manufacturer,series,model,kind,url])
    const checked = manufacturer==='RODIO CRAFT' && checkedPages.get(url)
    if (manufacturer==='TIMON' && timon && new URL(url).hostname!=='www.jackall.co.jp' && !evidence) {
      evidence = {status:timonRetailer && new URL(url).hostname==='www.fishing-otsuka.co.jp' ? 'queued-access-limited' : 'excluded-nonofficial-source'}
    }
    if(!pages.has(key))pages.set(key,{manufacturer,series,model,kind,url,origins:[],status:evidence?.status??(checked?checked.status:'unreviewed'),
      checkedAt:evidence?.checkedAt??(checked?checked.checkedAt:undefined), ...(evidence ?? {}), ...(checked ? {review:checked}: {})})
    const entry=pages.get(key)
    const reviewPrefix = {TIMON:'rc48',SMITH:'rc49',PALMS:'rc50','ROB LURE':'rc51'}[manufacturer]
    if (reviewPrefix && origin.startsWith(reviewPrefix) && evidence) Object.assign(entry,evidence)
    if(!entry.origins.includes(origin))entry.origins.push(origin)
  }
  for(const row of rows){
    candidate(row.manufacturer,row.series,row.model,'product',row.evidenceProductCandidate,'backup-product')
    candidate(row.manufacturer,row.series,row.model,'product',row.evidenceManufacturerCandidate,'backup-manufacturer')
    candidate(row.manufacturer,row.series,row.model,'product',row.evidenceRetailerCandidate,'backup-retailer')
  }
  for(const target of lureMasterManifest.targets){
    const manufacturer=externalManufacturer(target.manufacturer)
    if(!manufacturer)continue
    for(const color of target.colors){
      candidate(manufacturer,target.series,target.model,'product',color.sourceUrl,'manifest-source')
      candidate(manufacturer,target.series,target.model,'product',color.manufacturerUrl,'manifest-manufacturer')
      candidate(manufacturer,target.series,target.model,'product',color.retailerUrl,'manifest-retailer')
      candidate(manufacturer,target.series,target.model,'image',color.imageUrl,'manifest-appearance-evidence')
    }
  }
  for(const r of prior){
    for (const item of [r,...r.otherSources??[]]) candidate('RODIO CRAFT',item.series,item.model,'product',item.sourceUrl,'prior-bf-drift',
      {status:'matched',checkedAt:item.checkedAt,basis:item.basis})
  }
  for(const r of priorHolds)candidate('RODIO CRAFT',r.series,r.model,'product',r.sourceUrl,'prior-bf-drift-held',
    {status:'held',checkedAt:'2026-11-23',reason:r.reason})
  for(const r of review.pages){
    for(const model of r.models?.length?r.models:['']) {
      const owner=rows.find(row=>row.manufacturer==='RODIO CRAFT'&&row.model===model)
      candidate('RODIO CRAFT',owner?.series??'',model,'product',r.url,'rc47-b-retailer')
    }
  }

  for(const page of timonPages)candidate('TIMON','','',page.originType==='terms'?'terms':'product',page.url,'rc48-official-page',
    {status:page.httpStatus===200?'official-page-reviewed':'official-page-held',checkedAt:page.checkedAt,httpStatus:page.httpStatus})
  for(const model of timon?.models ?? [])candidate('TIMON',model.series,model.model,'product',model.officialUrl,'rc48-official-model',
    {status:model.status,checkedAt:model.checkedAt,modelColorRows:model.rows,activation:'held-link-permission'})

  for(const page of timonRetailer?.pages ?? []){
    const row=timonRows.get(page.variantId)
    candidate('TIMON',row?.series??'',page.model??'','product',page.url,'rc48b-retailer',
      {status:page.status,checkedAt:page.checkedAt,httpStatus:page.httpStatus,reason:page.reason})
  }
  for (const page of smith?.pages ?? []) candidate('SMITH','','',
    page.url===smith.termsUrl ? 'terms' : page.url.endsWith('03-trouttacle.html') ? 'index' : 'product',page.url,'rc49-page',
    {status:page.httpStatus===200?'page-reviewed':'page-held',checkedAt:page.checkedAt,httpStatus:page.httpStatus})
  for (const model of smith?.models ?? []) candidate('SMITH',model.series,model.model,'product',model.candidateUrl,'rc49-model',
    {status:model.modelStatus,checkedAt:smith.checkedAt,modelColorRows:model.colorRows})
  for (const row of smith?.rows ?? []) {
    if (row.kind==='individual-color') candidate('SMITH',row.series,row.model,'product',row.productUrl,'rc49-color',
      {status:'matched',checkedAt:row.checkedAt,basis:row.basis})
  }
  for (const page of palms?.pages ?? []) candidate('PALMS','','','product',page.url,'rc50-page',
    {status:page.httpStatus===200?'page-reviewed':'page-held',checkedAt:page.checkedAt,httpStatus:page.httpStatus})
  for (const model of palms?.models ?? []) candidate('PALMS',model.series,model.model,'product',model.candidateUrl,'rc50-model',
    {status:model.modelStatus,checkedAt:palms.checkedAt,modelColorRows:model.colorRows})
  for (const url of palms?.policyReviewUrls ?? []) candidate('PALMS','','','policy-review',url,'rc50-policy',
    {status:'reviewed',checkedAt:palms.checkedAt})
  const palmsImages = new Map(palms?.rows.filter(row=>row.image).map(row=>[JSON.stringify([row.series,row.model,row.image.url]),row]))
  for (const entry of pages.values()) {
    if (entry.manufacturer!=='PALMS' || entry.kind!=='image') continue
    const row = palmsImages.get(JSON.stringify([entry.series,entry.model,entry.url]))
    if (row) candidate('PALMS',entry.series,entry.model,'image',entry.url,'rc50-image',
      {status:'held',checkedAt:row.checkedAt,reason:row.image.reason})
  }
  for (const page of robLure?.pages ?? []) candidate('ROB LURE','','',
    page.url.endsWith('/work/') || new URL(page.url).searchParams.has('gid') ? 'index' : 'product',
    page.url,'rc51-page',{status:page.httpStatus===200?'page-reviewed':'page-held',
      checkedAt:page.checkedAt,httpStatus:page.httpStatus,reason:page.reason})
  for (const model of robLure?.models ?? []) candidate('ROB LURE',model.series,model.model,'product',model.candidateUrl,'rc51-model',
    {status:model.modelStatus,checkedAt:robLure.checkedAt,modelColorRows:model.colorRows})
  for (const url of robLure?.policyReviewUrls ?? []) candidate('ROB LURE','','','policy-review',url,'rc51-policy',
    {status:'reviewed',checkedAt:robLure.checkedAt})
  for (const row of robLure?.rows ?? []) {
    if (row.sourceType==='retailer') candidate('ROB LURE',row.series,row.model,'product',row.productUrl,'rc51-retailer',
      {status:'matched',checkedAt:row.checkedAt})
    if (row.image) candidate('ROB LURE',row.series,row.model,'image',row.image.url,'rc51-image',
      {status:'held',checkedAt:row.checkedAt,reason:row.image.reason})
  }
  const csv = list => {
    const keys=Object.keys(list[0])
    return '\uFEFF'+[keys,...list.map(row=>keys.map(k=>row[k]))].map(line=>
      line.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n'
  }
  if(rows.length!==variants.length || digest(await readFile(backupPath))!==digest(raw))throw new Error('Inventory or backup integrity check failed')
  await mkdir(output,{recursive:true})
  const write=(name,value)=>writeFile(output+name,JSON.stringify(value,null,2)+'\n')
  await write('INVENTORY.json',{...fingerprints,imageEvidenceDate:historical.checkedAt,total:grouped('all',rows,models),manufacturers:inventory})
  await writeFile(output+'ALL_COLORS.csv',csv(rows))
  await write('SOURCE_PAGES.json',[...pages.values()])
  const identity=({manufacturer,series,model,weightG,lengthMm,variantId,color,colorCode})=>({manufacturer,series,model,weightG,lengthMm,variantId,color,colorCode})
  await write('VERIFIED_LINKS.json',rows.flatMap(row=>[row.productUrl && ['existing-reviewed','new-reviewed'].includes(row.productStatus)?({
    ...identity(row),url:row.productUrl || row.officialProductCandidate,additionalUrls:row.additionalProductUrls.split(' | ').filter(Boolean),
        sourceName:row.sourceName || (row.officialProductCandidate?'JACKALL / TIMON':''),checkedAt:row.productEvidenceDate || row.officialEvidenceDate,
    basis:row.productBasis || (row.officialProductCandidate?'公式商品仕様表とカラー欄の重量別または型別掲載を照合。':''),
    kind:row.productKind || row.officialProductClass,status:row.productStatus,
    ...(row.officialJan ? {officialJan:row.officialJan} : {}),
    ...(row.manufacturer==='SMITH' ? {
      conditionsEvidence:byMaker.get('SMITH').rows.get(row.variantId)?.conditionsEvidence,
      specEvidenceUrl:byMaker.get('SMITH').rows.get(row.variantId)?.specEvidenceUrl,
    } : {}),
    ...(row.manufacturer==='PALMS' ? {policyReviewUrls:palms?.policyReviewUrls} : {}),
    ...(row.manufacturer==='ROB LURE' ? {
      sourceType:byMaker.get('ROB LURE').rows.get(row.variantId)?.sourceType,
      conditionsEvidence:byMaker.get('ROB LURE').rows.get(row.variantId)?.conditionsEvidence,
      policyReviewUrls:robLure?.policyReviewUrls,
    } : {}),
  }):null,row.officialProductStatus==='verified-activation-held'?{
    ...identity(row),url:row.officialProductCandidate,additionalUrls:[],sourceName:'JACKALL / TIMON',
    checkedAt:row.officialEvidenceDate,basis:'公式商品仕様表とカラー欄の重量別または型別掲載を照合。',
    kind:row.officialProductClass,status:'verified-activation-held',
    ...(row.officialJan ? {officialJan:row.officialJan} : {}),
  }:null].filter(Boolean)))
  const imageRows=rows.filter(row=>row.imageUrl || row.officialImageAlternatives).map(row=>({...identity(row),url:row.imageUrl,
    status:row.imageStatus,kind:row.imageKind,sourceName:row.imageSourceName,checkedAt:row.imageEvidenceDate,
        sourceProductUrl:row.manufacturer==='ROB LURE' ? row.productUrl : row.officialProductCandidate || row.productUrl,
    holdReason:row.imageHoldReason,
    browserCheck:imageSpotChecks.get(row.imageUrl) ?? timonChecks.get(row.imageUrl) ?? manufacturerChecks.get(row.imageUrl),
    technicalDecodeStatus:row.imageDecodeStatus,
    ...(row.manufacturer==='SMITH' ? {conditionsEvidence:byMaker.get('SMITH').rows.get(row.variantId)?.conditionsEvidence,
      permissionStatus:'held'} : {}),
    ...(row.manufacturer==='PALMS' ? {policyReviewUrls:palms?.policyReviewUrls,permissionStatus:'held'} : {}),
    ...(row.manufacturer==='ROB LURE' ? {policyReviewUrls:robLure?.policyReviewUrls,
      conditionsEvidence:byMaker.get('ROB LURE').rows.get(row.variantId)?.conditionsEvidence,permissionStatus:'held'} : {}),
    ...(row.manufacturer==='TIMON' ? {conditionsEvidence:timon.termsUrl,
      candidateUrls:row.officialImageAlternatives.split(' | ').filter(Boolean)} : {}),
  }))
  const retailerImageRows=(timonRetailer?.imageCandidates ?? []).map(item=>({
    ...identity({...item,manufacturer:'TIMON'}),url:item.url,status:'held',kind:item.type,
    sourceName:item.sourceName,checkedAt:item.checkedAt,sourceProductUrl:item.pageUrl,
    holdReason:'retailer-image-permission-not-confirmed',technicalDecodeStatus:item.decodeStatus,
  }))
  await write('IMAGE_CHECKS.json',[...imageRows,...retailerImageRows])
  await write('HELD.json',[
    ...[...imageRows,...retailerImageRows].filter(row=>row.status==='held').map(row=>({...row,kind:'image'})),
    ...rows.filter(r=>!r.productUrl&&r.manufacturer==='RODIO CRAFT').map(r=>({...identity(r),kind:'product',holdReason:r.holdReason,
      candidateUrls:[r.evidenceProductCandidate,r.evidenceRetailerCandidate,r.evidenceManufacturerCandidate].filter(Boolean)})),
    ...rows.filter(row=>byMaker.get(row.manufacturer)?.rows.has(row.variantId)&&!row.productUrl).map(row=>({...identity(row),kind:'product',scope:'official',
      holdReason:byMaker.get(row.manufacturer).rows.get(row.variantId).reason,
      candidateUrls:byMaker.get(row.manufacturer).rows.get(row.variantId).candidateUrls ?? [row.officialProductCandidate].filter(Boolean),
      checkedAt:row.officialEvidenceDate})),
    ...rows.filter(row=>timonRows.has(row.variantId)).map(row=>({...identity(row),kind:'product',scope:'official',
      holdReason:timonRows.get(row.variantId).reason,candidateUrls:[row.officialProductCandidate].filter(Boolean),
      checkedAt:row.officialEvidenceDate || timon.checkedAt})),
    ...(timonRetailer?.pages ?? []).filter(page=>page.status==='held').map(page=>({
      manufacturer:'TIMON',model:page.model,color:page.color,variantId:page.variantId,kind:'source-page',scope:'retailer',
      url:page.url,httpStatus:page.httpStatus,holdReason:page.reason,checkedAt:page.checkedAt,
    })),
    ...review.pages.filter(p=>p.status==='held').map(p=>({manufacturer:'RODIO CRAFT',models:p.models,kind:'source-page',
      url:p.url,httpStatus:p.httpStatus,holdReason:p.reason,checkedAt:p.checkedAt})),
    ...priorHolds.map(r=>({manufacturer:'RODIO CRAFT',series:r.series,model:r.model,weightG:r.weight,lengthMm:r.length,color:r.name,
      kind:'prior-catalog-candidate',url:r.sourceUrl,holdReason:r.reason,checkedAt:'2026-11-23'})),
  ])
  console.log(inventory.map(({label,models,zeroColorModels,before,after})=>({label,models,zeroColorModels,before,after})))
} finally {
  db.close()
  await db.delete()
  await loader.close()
}
