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
 const n=value.normalize('NFKC').trim(), m=n.match(/^#?(\d+)\s+(.+)$/)
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
   const sources=attemptedByVariant.get(row.variantId)??[]
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
