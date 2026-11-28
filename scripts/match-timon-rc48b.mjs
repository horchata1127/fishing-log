import { readFile, writeFile } from 'node:fs/promises'
const docs = 'docs/lure-external-links/'
const read = async name => JSON.parse(await readFile(docs + name))
const rc48 = await read('TIMON_REVIEW.json')
const listings = await read('TIMON_RETAILER_LISTINGS.json')
const policy = await read('SOURCE_POLICIES.json')
const slug = value => value.normalize('NFKC').toLowerCase().replace(/[\s‐‑–—−]/g,c=>/\s/.test(c)?'':'-').replace(/(\d+)\.0g/g,'$1g')
const models = new Map(Object.entries({
 'TCレイゲンDR':'TCレイゲンDR','TCレイゲンMR':'TCレイゲンMR','SLIDON60F':'スライドン60F',
 'Prikkey':'プリッキー','Pepino DR-SS':'ペピーノDR-SS','PaniCra DR Rattle':'パニクラDRラトル',
 'PaniCra DR':'パニクラDR','PaniCra MR':'パニクラMR','PaniCra SR':'パニクラSR','PaniCra DR-HF':'パニクラDR-HF',
 'MITTS DRY 2Hook':'ミッツドライ2Hook','MITTS DRY RATTLE 2Hook':'ミッツドライラトル2Hook',
 'MICRO PANICRA MR-F Rattle':'マイクロパニクラMR-Fラトル','MICRO PANICRA MR-SS':'マイクロパニクラMR-SS',
 'KIBIpani MR':'キビパニMR','KIBIpani MR-SS':'キビパニMR-SS','Futten FS':'フッテンFS',
 'DEKA Mitts DRY':'デカミッツドライ','DEKA Mitts DRY Rattle':'デカミッツドライラトル',
 'Chibi Pepino MR':'ちびペピーノMR','Chibi PaniCra DR':'ちびパニクラDR','Chibi PaniCra DR-SS':'ちびパニクラDR-SS',
 'Chibi PaniCra SR':'ちびパニクラSR','Chibi PaniCra SR-SS':'ちびパニクラSR-SS',
}))
const seriesNames=new Map(Object.entries({
  Tearo:'ティアロ','Chibi Tearo':'ちびティアロ',REKUZE:'リクーゼ','Apeed!':'アピード！',Rhomy:'ロミー',
  'Chibi Quattro Spoon':'ちびクワトロスプーン',KUROBALL:'クロボール',
  'KUROBALL γ':'クロボールガンマ','METAL KUROBALL':'メタルクロボール',
}))
const modelsByName = new Map(rc48.models.map(row=>[row.model,row]))
function labels(row){
 const labels=[row.model,models.get(row.model)]
 const series=seriesNames.get(row.series)
 if(series&&row.weightG)labels.push(series+row.weightG+'g')
 return labels.filter(Boolean).map(slug)
}
function color(value, code){
 const n=value.normalize('NFKC').trim().replace(/^#\s*/,''), m=n.match(/^#?(\d+)\s+(.+)$/)
 return {name:slug(m?.[2]??n),code:code||m?.[1]}
}
function title(value){
 return value.normalize('NFKC').split(' - 城峰釣具店')[0].split(': トラウト')[0].replace(/【(?:ネコポス対象品|即日発送)】/g,'').trim()
}
function exactColor(row, name){
 const a=color(row.color,row.colorCode), b=color(name)
 return a.name===b.name&&!(a.code&&b.code&&Number(a.code)!==Number(b.code))
}
function matchesJH(row,value){
 const m=title(value).match(/^(?:TIMON|ティモン)\s+(.+?)\s*#\s*(.+)$/i)
 return !!m && labels(row).includes(slug(m[1])) && exactColor(row,m[2])
}
function matchesCasting(row,value,code){
 const n=title(value).replace(/^ジャッカル\s*/,'')
 if(!/^(?:TIMON|ティモン|(?:チビ|ちび)パニクラ)/i.test(n))return false
 const name=n.replace(/^(?:TIMON\s*)?(?:ティモン\s*)?(?:トラウト(?:プラグ|ルアー)|スプーン)?\s*/i,'')
 const full=slug(name)
 const expected=color(row.color,row.colorCode)
 const matches=labels(row).some(label=>{
   if(!full.startsWith(label))return false
   const tail=full.slice(label.length).replace(/^#/,'')
   return tail===expected.name || tail===expected.code+expected.name
 })
 return matches && (row.officialJan===code||row.catalogJan===code)
}
function specConflict(row,facts){
 return facts.some(line=>{
  const spec=line.normalize('NFKC').match(/^(?:【(?:Weight|Length|重量|全長|自重)】|(?:重量|全長|自重)(?:\([^)]*\))?\s*:)\s*([\d.]+)\s*(g|mm)(?:\s+(?:スローシンキング|フローティング|シンキング))?\s*$/i)
  return spec && Number(spec[1]) !== (spec[2].toLowerCase()==='g'?row.weightG:row.lengthMm)
 })
}
const jhNames = new Map()
for(const entry of listings.filter(page=>page.store==='jh'))for(const [target,name] of entry.links??[]){
 const p=new URL(target), pid=p.searchParams.get('pid')
 if(!pid||!/(^|\.)fishing-shop-jh\.com$/.test(p.hostname)||!/^TIMON\s/i.test(name))continue
 const url='https://fishing-shop-jh.com/?pid='+pid
 const names=jhNames.get(url)??new Set()
 names.add(name)
 jhNames.set(url,names)
}
const priority=row=>['Tearo','Chibi Tearo','KUROBALL','KUROBALL γ','METAL KUROBALL','REKUZE','Apeed!','Chibi Quattro Spoon','Rhomy'].includes(row.series)?1:0
const eligible=rc48.rows.filter(row=>row.weightG && row.lengthMm && row.reason!=='collaboration-model-not-on-official-product-page')
const jhCandidates = new Map()
for(const [url,names] of jhNames){
 const matching = eligible.filter(row=>[...names].some(name=>matchesJH(row,name)))
 if(matching.length===1)jhCandidates.set(url,matching[0])
}
const jhRanked=[...jhCandidates].sort((a,b)=>priority(a[1])-priority(b[1]))
const castingCandidates = new Map()
for(const row of eligible){
 const jan=row.officialJan||row.catalogJan
 if(/^\d{13}$/.test(jan??''))castingCandidates.set('https://store.castingnet.jp/shop/g/g'+jan+'/',row)
}
const inspected = (await Promise.all(['TIMON_RETAILER_PRODUCTS.json','TIMON_CASTING_PRODUCTS.json'].map(name=>read(name).catch(error=>{
 if(error.code==='ENOENT')return []; throw error
})))).flat()
const attempted=new Set(inspected.map(p=>p.url))
for(const page of inspected){
 if(!page.url.startsWith('https://fishing-shop-jh.com/?pid=')||jhCandidates.has(page.url))continue
 const matches=eligible.filter(row=>matchesJH(row,page.title??''))
 if(matches.length===1)jhCandidates.set(page.url,matches[0])
}
const products=[]
const pages=[]
const imageCandidates=[]
for(const page of inspected){
 const jh=jhCandidates.has(page.url)
 const store=jh?'jh':'casting'
 const row=jh?jhCandidates.get(page.url):castingCandidates.get(page.url)
 const urlCode=/\/g(\d{13})\/$/.exec(page.url)?.[1]
 const statedCodes=(page.facts??[]).flatMap(line=>[...line.normalize('NFKC').matchAll(/(?:JAN(?:コード)?|商品コード)[\s:】]*(\d{13})/gi)].map(m=>m[1]))
 const expected=row?.officialJan||row?.catalogJan
 const headings=page.headings??[]
 const sameTitle=jh?row&&headings.some(h=>matchesJH(row,h))&&matchesJH(row,page.title??''):
   row&&headings.some(h=>matchesCasting(row,h,urlCode))&&matchesCasting(row,page.title??'',urlCode)
 const codeConfirmed=jh ? !expected||!statedCodes.length||statedCodes.includes(expected) : statedCodes.includes(urlCode)
 const accepted=!!(row&&policy.sources[store].product==='plain-link'&&page.status===200&&page.finalUrl===page.url&&sameTitle&&
   codeConfirmed&&!specConflict(row,page.facts??[]))
 const status=accepted?'matched':'held'
 pages.push({url:page.url,store,model:row?.model,color:row?.color,variantId:row?.variantId,checkedAt:page.checkedAt,
   httpStatus:page.status,status,reason:accepted?undefined:page.error??(!codeConfirmed?'retailer-jan-missing-or-conflicting':'page unavailable or exact title and specification not corroborated')})
 if(!accepted)continue
 const basis=jh?'城峰の個別商品名と見出しでメーカー、型または重量、色名と記載仕様を照合。':
   'キャスティングの個別商品名・見出し・商品コードと既存公式照合JANを照合。'
 products.push({variantId:row.variantId,manufacturer:'TIMON',series:row.series,model:row.model,weightG:row.weightG,lengthMm:row.lengthMm,
   color:row.color,colorCode:row.colorCode,officialJan:expected,retailerJan:statedCodes[0],url:page.url,checkedAt:page.checkedAt,
   sourceName:policy.sources[store].name,store,basis,kind:'individual-color',status:'app-eligible'})
 for(const candidate of [...new Map((page.images??[]).filter(img=>img.url?.startsWith('https:')).map(img=>[img.url,img])).values()].slice(0,1)){
   imageCandidates.push({variantId:row.variantId,series:row.series,model:row.model,color:row.color,pageUrl:page.url,
     url:candidate.url,checkedAt:page.checkedAt,sourceName:policy.sources[store].name,
     type:'individual-product-image-candidate',presentation:'held',permission:'not-confirmed',decodeStatus:'not-tested'})
 }
}
const variantPages = await read('TIMON_RETAILER_VARIANT_PAGES.json').catch(error=>{
 if(error.code==='ENOENT')return []; throw error
})
const linkedRows=new Set(products.map(row=>row.variantId))
const variantInspections=new Map()
const oldPaniCraPages=new Map([
 ['https://www.area-island.com/?pid=170903425',{model:'PaniCra DR-HF',title:'ティモン パニクラPaniCra DR-HF',option:'DR 【HF】',weightG:2.8}],
 ['https://troutisland.shop-pro.jp/?pid=86566861',{model:'PaniCra SR',title:'ティモン パニクラ【SR】 - トラウトアイランド',option:'パニクラＳＲ',weightG:3}],
])
const multiProduct = new Map([
 ['179966940',{label:'TCレイゲン',models:new Map([['TCレイゲンMR','MR'],['TCレイゲンDR','DR']])}],
 ['179971524',{label:'ロミー',series:'Rhomy'}],
])
const collabModel = 'PaniCra DR-F Rodio Ver.'
const extraLabels = new Map([
 ['REKUZE 0.6g','リクーゼ(Rekuze)0.6g'], ['REKUZE 1g','リクーゼ(Rekuze)1.0g'],
 ['REKUZE 1.7g','リクーゼ(Rekuze)1.7g'], ['Chibi PaniCra DR-SS','Chibi PaniCra DR-SS(ちびパニクラ)'],
])
function retailerLabels(row){
 return [...labels(row),extraLabels.has(row.model)?slug(extraLabels.get(row.model)):''].filter(Boolean)
}
const kitiyaTitle = value => slug(value.replace(/^(?:新色入荷|新入荷|再入荷)?(?:ティモン|TIMON)\s*/i,''))
for(const page of variantPages){
 const store=page.store, retailer=policy.sources[store]
 const pid=new URL(page.url).searchParams.get('pid')
 const proof=page.verifiedSpecifications
 const collab=pid==='182978155'&&slug(page.title)===slug('ロデオクラフト×ティモン パニクラ【ロデオクラフトVer.】')&&
   proof?.model==='DR(F)'&&proof.weightG===3&&proof.buoyancy==='フローティング'
 const multi=collab?{label:page.title,models:new Map([[collabModel,'パニクラDR(F)']])}:multiProduct.get(pid)
 const acceptedPage=page.httpStatus===200&&page.finalUrl===page.url&&retailer?.product==='plain-link'
 const examined=new Set(), linked=new Set()
 if(acceptedPage&&store==='kitiya'&&(collab||/^ティモン\s+/.test(page.title))&&
    page.headings?.some(h=>kitiyaTitle(h)===kitiyaTitle(page.title))){
   const name=kitiyaTitle(page.title)
   const candidateRows=collab?rc48.rows.filter(row=>row.model===collabModel&&row.weightG===3&&row.lengthMm===32):eligible
   for(const row of candidateRows){
     let combinations
     if(multi&&name===slug(multi.label)){
       const subtype=multi.models?.get(row.model) ?? (multi.series===row.series?row.weightG+'g':undefined)
       if(!subtype)continue
       combinations=page.tables.flatMap(table=>{
         const [header,...cells]=table
         if(!header[0].includes('カラー'))return []
         const c=header.findIndex((name,i)=>i>0&&slug(name)===slug(subtype))
         return c<1?[]:cells.filter(line=>line[c]===true).map(line=>line[0])
       })
     }else{
       if(!retailerLabels(row).includes(name))continue
       combinations=page.options.map(option=>option.replace(/\s[×〇○]$/,''))
     }
     if(linkedRows.has(row.variantId))continue
     examined.add(row.variantId)
     // For this specific DR(F) page the retailer's stock table also lists three variants as sold out.
     if(collab)combinations.push(...(page.reviewedSoldOutDRFColors??[]))
     if(!combinations.some(name=>exactColor(row,name)))continue
     products.push({variantId:row.variantId,manufacturer:'TIMON',series:row.series,model:row.model,weightG:row.weightG,lengthMm:row.lengthMm,
       color:row.color,colorCode:row.colorCode,officialJan:row.officialJan||row.catalogJan,url:page.url,checkedAt:page.checkedAt,
       sourceName:retailer.name,store,kind:'model-color-list',status:'app-eligible',
       basis:collab?'吉やのロデオクラフト版 DR(F) の3.0g・浮力と発売色の表を照合。別モデルMR列を除外。':multi?'吉やの商品表で対象の型・重量と色が交差する明示セルを照合。':'吉やの個別モデル名・見出しと販売色選択欄を照合。'})
     linkedRows.add(row.variantId)
     linked.add(row.variantId)
   }
 }
 if(acceptedPage&&store==='troute'&&page.vendor==='TIMON'&&page.variants?.length){
   const headingNames=(page.headings??[]).slice(0,2).map(slug)
   for(const row of eligible.filter(row=>!linkedRows.has(row.variantId)&&retailerLabels(row).some(name=>headingNames.includes(name)))){
     examined.add(row.variantId)
     const variants=page.variants.filter(variant=>exactColor(row,variant.title)&&
       (!variant.sku||!(row.officialJan||row.catalogJan)||variant.sku===(row.officialJan||row.catalogJan)))
     if(variants.length!==1)continue
     const variant=variants[0]
     products.push({variantId:row.variantId,manufacturer:'TIMON',series:row.series,model:row.model,weightG:row.weightG,lengthMm:row.lengthMm,
       color:row.color,colorCode:row.colorCode,officialJan:row.officialJan||row.catalogJan,retailerJan:variant.sku,
       url:page.url+'?variant='+variant.id,checkedAt:page.checkedAt,sourceName:retailer.name,store,kind:'individual-color',status:'app-eligible',
       basis:'t-Routeの同一製品ページのティモン表記・型と、販売色データのvariant IDを照合。'})
     linkedRows.add(row.variantId)
     linked.add(row.variantId)
   }
 }
 const oldModel=oldPaniCraPages.get(page.url)
 if(acceptedPage&&oldModel&&slug(page.title)===slug(oldModel.title)&&page.shopOptions?.some(option=>slug(option)===slug(oldModel.option))){
   for(const row of eligible.filter(row=>row.model===oldModel.model&&row.weightG===oldModel.weightG&&row.lengthMm===32&&!linkedRows.has(row.variantId))){
     examined.add(row.variantId)
     if(!page.shopOptions.some(option=>exactColor(row,option)))continue
     products.push({variantId:row.variantId,manufacturer:'TIMON',series:row.series,model:row.model,weightG:row.weightG,lengthMm:row.lengthMm,
       color:row.color,colorCode:row.colorCode,officialJan:row.officialJan||row.catalogJan,url:page.url,checkedAt:page.checkedAt,
       sourceName:retailer.name,store,kind:'model-color-list',status:'app-eligible',
       basis:'旧パニクラの個別商品名、型の選択肢、カラー選択肢と、既存の公式仕様表を照合。'})
     linkedRows.add(row.variantId)
     linked.add(row.variantId)
   }
 }
 for(const id of examined)variantInspections.set(id,{url:page.url,checkedAt:page.checkedAt})
 pages.push({url:page.url,store,kind:store==='kitiya-index'?'listing':'product',checkedAt:page.checkedAt,httpStatus:page.httpStatus,
   status:store==='kitiya-index'?'listing-inspected':linked.size?'matched':'held',matchedVariantIds:[...linked],
   reason:linked.size||store==='kitiya-index'?undefined:page.error??'no eligible uncovered model-color combination verified'})
}
const adopted = [...new Map(products.map(row=>[row.variantId,row])).values()]
const covered = new Set(adopted.map(row=>row.variantId))
if(process.argv[2]==='propose'){
 const count=Number(process.argv[3]??120)
 const jh=jhRanked.filter(([url,row])=>!attempted.has(url)&&!covered.has(row.variantId))
 const jhFirst=[...new Map(jh.reverse().map(x=>[x[1].variantId,x])).values()].reverse()
 const listedIds=new Set([...jhCandidates.values()].map(row=>row.variantId))
 const casting=[...castingCandidates].filter(([url,row])=>!attempted.has(url)&&!covered.has(row.variantId)&&!listedIds.has(row.variantId))
   .sort((a,b)=>priority(a[1])-priority(b[1]))
 const proposals=(process.argv[4]==='casting'?casting:jhFirst).slice(0,count).map(([url])=>url)
 await writeFile(process.argv[4]==='casting'?'.rc48b-casting-selected.local':'.rc48b-selected.local',JSON.stringify(proposals))
 console.log('new candidate URLs',proposals.length,'JH remaining',jhFirst.length,'Casting remaining',casting.length)
}else{
 const attemptedByVariant=Map.groupBy(pages.filter(page=>!!page.variantId),page=>page.variantId)
 const rows=rc48.rows.map(row=>{
   const sources=[...(attemptedByVariant.get(row.variantId)??[]), ...variantInspections.has(row.variantId)?[variantInspections.get(row.variantId)]:[]]
   return {variantId:row.variantId,series:row.series,model:row.model,weightG:row.weightG,lengthMm:row.lengthMm,color:row.color,
     status:covered.has(row.variantId)?'registered':sources.length?'held':'unreviewed',
     inspectedUrls:sources.map(source=>source.url),
     checkedAt:sources.map(source=>source.checkedAt).filter(Boolean).sort().at(-1)}
 })
 await writeFile(docs+'TIMON_RETAILER_REVIEW.json',JSON.stringify({products:adopted,pages,imageCandidates,rows,
   queue:{jhCandidates:jhCandidates.size,castingJanCandidates:castingCandidates.size}},null,2)+'\n')
 const generated=[
   "import type { LureExternalReference } from './lureExternalReferences'",'',
   '// Generated by scripts/match-timon-rc48b.mjs from retailer product evidence.',
   'export const timonRetailerExternalReferences: readonly LureExternalReference[] = [',
   ...adopted.map(row=>'  '+JSON.stringify({manufacturerName:'TIMON',seriesName:row.series,modelName:row.model,
     modelDetails:{weightG:row.weightG,lengthMm:row.lengthMm},colorName:row.color,colorCode:row.colorCode,
     sourceName:row.sourceName,sourceType:'retailer',checkedAt:row.checkedAt,evidenceUrl:row.url,
     verificationBasis:row.basis,product:{url:row.url,verified:true,kind:row.kind,conditionsEvidence:policy.sources[row.store].termsUrls[0]}})+','),
   ']','',
 ].join('\n')
 const runtimeFile='src/data/timonRetailerExternalReferences.ts'
 const current=await readFile(runtimeFile,'utf8').catch(error=>{
   if(error.code==='ENOENT')return undefined
   throw error
 })
 if(current!==generated)await writeFile(runtimeFile,generated)
 console.log('products',adopted.length,'reviewed pages',pages.length,'image holds',imageCandidates.length)
}
