import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
const directory = 'docs/lure-external-links/'
const rows = execFileSync('git', ['show', '0a33c87:docs/lure-external-links/ALL_COLORS.csv'], { encoding: 'utf8', maxBuffer: 4000000 }).trim().split(/\r?\n/).map(line =>
  [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m => m[1].replaceAll('""', '"')))
const fields = rows.shift()
const colors = rows.map(row => Object.fromEntries(fields.map((k,i) => [k,row[i]]))).filter(r => r.manufacturer === 'RODIO CRAFT' && !r.productUrl)
const norm = s => s.normalize('NFKC').toLowerCase().replace(/\s/g,'')
const decimals = s => s.replace(/(\d+)\.0g/g,'$1g')
const compact = s => decimals(norm(s)).replace(/[-‐ｰ]/g,'')
const alias = new Map([
  ['mocadrss2hook',['モカdrss2hook']],
  ['mocadrf2hook',['モカdrf2hook']],
  ['mocasrss',['モカsrss','モカsrss2hook']],
  ['mocasrhf2hook',['モカsrhf2hook']],
  ['mocasrfii2hook',['モカsrfii','モカsrfii2hook']],
  ['mocadrfrattle2hook',['モカラトル♪drf2hook','モカラトルdrf2hook','モカdrfラトル2hook']],
  ['mocadrssrattle2hook',['モカラトル♪drss2hook','モカラトルdrss2hook','モカdrssラトル2hook']],
  ['mocasrssrattle',['モカラトル♪srss2hook','モカラトルsrss2hook','モカsrssラトル2hook']],
  ['petitmocasrf',['プチモカsrf']],
  ['petitmocasrfii',['プチモカsrfii']],
  ['petitmocasrss',['プチモカsrss']],
  ['fatmocajr.drf',['ファットモカjrdrf','ファットモカjr.drf']],
  ['fatmocajr.drss',['ファットモカjrdrss','ファットモカjr.drss']],
  ['fatmocajr.srf',['ファットモカjrsrf','ファットモカjr.srf']],
  ['fatmocajr.srss',['ファットモカjrsrss','ファットモカjr.srss']],
  ['fatmocajr.srhfrattle',['ファットモカjrsrhfラトル','ファットモカjr.srhfラトル']],
  ['ussas',['ウッサs','ussaウッサs','ウッサ(ussa)s','ウッサ(s)']],
  ['ussaxs',['ウッサxs','ussaウッサxs','ウッサ(ussa)xs','ウッサ(xs)']],
  ['ussaxsnorattle',['ウッサxsノンラトル','ussaウッサxsノンラトル','ウッサ(ussa)xsノンラトル','ウッサ(xs)ノンラトル']],
  ['ussaxsnonrattle',['ウッサxsノンラトル','ussaウッサxsノンラトル','ウッサ(ussa)xsノンラトル','ウッサ(xs)ノンラトル']],
  ['fatussajr.xs',['ファットウッサjrxs','ファットウッサjr.xs']],
  ['qm2.8g',['キュームqm2.8g','qmキューム2.8g','キューム2.8g']],
  ['jekylljr.1.1g',['ジキルjr1.1g','ジキルjr.1.1g','ジキルジュニア1.1g','jekylljr1.1g']],
])
function modelNames(row) {
  const key=compact(row.model)
  if (row.series.startsWith('NOA')) {
    const suffix=key.slice(3)
    return [key,'ノア'+suffix,'noaノア'+suffix,'ノアnoa'+suffix,'noa(ノア)'+suffix,
      'ノア'+suffix.replace('jr.','jr'),'ノア'+suffix.replace('jr.','ジュニア'),'noa'+suffix.replace('jr.','jr'), 'ノアnoa'+suffix.replace('jr.','jr'), 'noaノア'+suffix.replace('jr.','jr'), 'ノアnoa'+suffix.replace('jr.','ジュニア')]
  }
  return alias.has(key) ? [key,...alias.get(key)] : []
}
function titleParts(title) {
  const line = title.normalize('NFKC').split(' - 城峰釣具店')[0].split(': トラウト')[0].replace(/【即日発送】/g,'').trim()
  const afterMaker = line.match(/(?:ロデオクラフト|RODIO CRAFT)\s+(.+)/i)?.[1]?.replace(/^(?:スプーン|トラウトプラグ)\s+/,'')
  if(!afterMaker)return
  const split = afterMaker.indexOf('#')
  if(split < 0)return
  const model = compact(afterMaker.slice(0,split))
  const color = afterMaker.slice(split+1).trim()
  const prefix = color.match(/^(\d+)\s+(.+)$/)
  return { model, color: prefix?.[2] ?? color, code: prefix?.[1] ?? '' }
}
function colorParts(row) {
  const display = row.color.normalize('NFKC').trim()
  const prefix=display.match(/^#?(\d+)\s+(.+)$/)
  return { color:prefix?.[2] ?? display, code:row.colorCode || prefix?.[1] || '' }
}
function matches(row, value) {
  if(!value || !modelNames(row).includes(value.model))return false
  const color=colorParts(row)
  if (value.code && color.code && Number(value.code)!==Number(color.code))return false
  if(row.series.startsWith('NOA') && color.code && !value.code)return false
  return norm(color.color)===norm(value.color)
}
function canonical(url) {
  const u=new URL(url), pid=u.searchParams.get('pid')
  if (/(^|\.)(fishing-shop-jh\.com|fishing-shop-jh\.shop-pro\.jp)$/.test(u.hostname) && pid) return 'https://fishing-shop-jh.com/?pid='+pid
  if (u.hostname==='store.castingnet.jp' && /^\/shop\/g\/g\d+\/$/.test(u.pathname))return u.origin+u.pathname
}
const listings = JSON.parse(await readFile(process.argv[2]))
const candidates = new Map()
for (const page of listings) for (const [url,title] of page.links ?? []) {
  const product=canonical(url)
  if(!product || !titleParts(title))continue
  const value=candidates.get(product) ?? {url:product,titles:[],listingUrls:[]}
  if(!value.titles.includes(title))value.titles.push(title)
  if(!value.listingUrls.includes(page.url))value.listingUrls.push(page.url)
  candidates.set(product,value)
}
const proposals=[]
for(const candidate of candidates.values()){
  const matchesRows=colors.filter(row=>candidate.titles.some(t=>matches(row,titleParts(t))))
  if(matchesRows.length)proposals.push({...candidate,variantIds:matchesRows.map(row=>row.variantId),models:[...new Set(matchesRows.map(r=>r.model))]})
}
if (process.argv[3]==='propose'){
  await writeFile(process.argv[4],JSON.stringify(proposals.map(p=>p.url)))
  console.log('Proposed pages',proposals.length)
} else {
  const products=JSON.parse(await readFile(process.argv[4]))
  const already = new Map(listings.filter(p=>canonical(p.url)).map(p=>[canonical(p.url),p]))
  for(const p of products)already.set(p.url,p)
  const priorReview = JSON.parse(await readFile(directory+'RODIO_REVIEW.json'))
  const accepted=[]
  const pages=[]
  const entries = new Map(proposals.map(p=>[p.url,p]))
  const byVariant = new Map()
  for(const candidate of proposals){
    const page=already.get(candidate.url)
    if(!page)continue
    const parts=titleParts(page.title ?? '')
    const status = page.status===200 && canonical(page.finalUrl)===candidate.url
    const rows=colors.filter(r=>candidate.variantIds.includes(r.variantId)&&matches(r,parts))
    const stableTitle=page.headings?.some(h=>{const p=titleParts(h);return p&&JSON.stringify(p)===JSON.stringify(parts)})
    const modelFacts=(page.facts??[]).flatMap(t=>/^(?:【(?:Weight|Length|重量|全長|自重)】|(?:重量|全長|自重)(?:\s*[（(][^）)]*[）)])?\s*[：:])\s*([\d.]+)\s*(g|mm)\s*$/i.exec(t.normalize('NFKC'))?.slice(1).join(' ')??[])
    const agrees = rows.length===1 && modelFacts.every(f=>{
      const [n,u]=f.split(' ')
      return u.toLowerCase()==='g' ? !rows[0].weightG||Number(n)===Number(rows[0].weightG) : !rows[0].lengthMm||Number(n)===Number(rows[0].lengthMm)
    })
    const result={...candidate,checkedAt:page.checkedAt,httpStatus:page.status,finalUrl:page.finalUrl,title:page.title,facts:page.facts,headings:page.headings,images:page.images,
      status:status&&agrees&&stableTitle?'matched':'held',reason:!status?'HTTP error or redirected away':!agrees?'Product does not uniquely match model and full color, or specifications conflict':!stableTitle?'Product heading does not independently corroborate listing and title':undefined}
    pages.push(result)
    if(result.status==='matched'){
      const r=rows[0]
      const refs=byVariant.get(r.variantId)??[]
      refs.push({candidate,page,r})
      byVariant.set(r.variantId,refs)
    }
  }
  for(const [variantId,refs] of byVariant){
    refs.sort((a,b)=>Number(b.page.url.includes('castingnet'))-Number(a.page.url.includes('castingnet'))||a.page.url.localeCompare(b.page.url))
    const {page,r}=refs[0]
    const jan=page.facts?.map(t=>/(?:商品コード|JAN)[：:\s]*(\d{13})/.exec(t)?.[1]).find(Boolean)
    const m=r.weightG?Number(r.weightG):undefined,l=r.lengthMm?Number(r.lengthMm):undefined
    accepted.push({variantId:Number(variantId),manufacturer:r.manufacturer,series:r.series,model:r.model,
      modelDetails:{weightG:m,lengthMm:l,actionType:r.actionType||undefined,buoyancy:r.buoyancy||undefined,rattle:r.rattle||undefined},
      color:r.color,colorCode:r.colorCode||colorParts(r).code, url:page.url, checkedAt:page.checkedAt,
      sourceName:page.url.includes('castingnet')?'キャスティング':'城峰釣具店',
      basis:'販売店の一覧、個別ページタイトル、商品見出しでメーカー、仕様を区別したモデル名、色名を照合。記載された番号・重量・全長は競合なし。',
      kind:'individual-color',jan})
  }
  for(const page of listings){
    const key=canonical(page.url)??page.url
    if(entries.has(key))continue
    pages.push({url:key,checkedAt:page.checkedAt,httpStatus:page.status,finalUrl:page.finalUrl,title:page.title,
      status:page.status===200?'surveyed-no-exact-color':'held',reason:page.error??'候補一覧、または現行色との個別・厳密な対応を確認できず'})
  }

  const supplemental = JSON.parse(await readFile(directory+'RODIO_SUPPLEMENTAL_SOURCES.json'))
  const covered = new Set(accepted.map(r=>r.variantId))
  function add(row, page, kind, basis, sourceName, url=page.url) {
    if(!row || covered.has(Number(row.variantId)))return
    const modelDetails = Object.fromEntries(Object.entries({
      weightG:row.weightG?Number(row.weightG):undefined, lengthMm:row.lengthMm?Number(row.lengthMm):undefined,
      actionType:row.actionType||undefined,buoyancy:row.buoyancy||undefined,rattle:row.rattle||undefined,
    }).filter(([,v])=>v!==undefined))
    accepted.push({variantId:Number(row.variantId),manufacturer:row.manufacturer,series:row.series,model:row.model,modelDetails,
      color:row.color,colorCode:row.colorCode||colorParts(row).code,url,checkedAt:page.checkedAt,sourceName,basis,kind})
    covered.add(Number(row.variantId))
  }
  for(const page of supplemental.noaOptions){
    const model=page.label.normalize('NFKC').match(/^ロデオクラフト\s*ノア(Jr|S)?【([\d.]+g)】$/)
    if(!model || page.status!==200 || page.finalUrl!==page.url || !norm(page.title).startsWith(norm(page.label)+'-'))continue
    const modelName='NOA'+(model[1]==='Jr'?' Jr.':model[1]==='S'?' S':'')+' '+model[2]
    const options=page.colors.map(t=>t.normalize('NFKC').match(/^#?(\d+)[.\s]+\s*(.+)$/)).filter(Boolean)
    for(const row of colors.filter(r=>r.model===modelName)){
      const rp=colorParts(row)
      if(!rp.code || !options.some(m=>Number(m[1])===Number(rp.code) && norm(m[2])===norm(rp.color)))continue
      add(row,page,'model-color-list','販売店の個別重量ページと色選択肢で重量・番号・名称が一致。画像の色別対応未確認。','越谷タックルアイランド')
    }
    pages.push({...page,models:[modelName],status:'matched-model-color-list'})
  }
  const custom = supplemental.kitiya
  for(const model of custom.models)for(const color of custom.colors){
    const row=colors.find(r=>r.model===model&&r.color===color)
    add(row,custom,'model-color-list','吉やの別注商品表に重量別の行と色列が明示され、該当セルを確認。見本はジキル1.8g。','吉や')
  }
  pages.push({...custom,status:'matched-model-color-list'})
  const priorOptions=JSON.parse(await readFile('docs/rodio-driftspin-bf/OTHER_PRODUCTS.json'))
  const troute=priorOptions.find(p=>p.url.includes('rodio-craft-spoon-t-route-original-color'))
  for(const model of ['JEKYLL Jr. 1.1g','QM 2.8g','NOA 1.8g'])for(const color of ['Liberty','Route21']){
    const option=troute.variants.find(v=>v.title===model+' '+color)
    if(!option)continue
    const url=troute.url+'?variant='+option.id
    add(colors.find(r=>r.model===model&&r.color===color),troute,'individual-color','t-Routeの公開商品データで重量・モデル・別注色のvariant IDを照合。','t-Route',url)
    pages.push({url,title:option.title,checkedAt:troute.checkedAt,models:[model],status:'matched',listingUrls:[troute.url]})
  }

  const fatUssa = supplemental.fatUssa
  for (const row of colors.filter(r=>r.model==='Fat USSA Jr. XS' && Number(r.weightG)===fatUssa.weightG &&
    Number(r.lengthMm)===fatUssa.lengthMm && r.actionType==='XS' && r.rattle===fatUssa.rattle)) {
    const rp=colorParts(row)
    const exact=fatUssa.options.some(option=>{
      const match=option.match(/^#(\d+)\s+(.+)\s+[〇×]$/)
      return match && Number(match[1])===Number(rp.code) && norm(match[2])===norm(rp.color)
    })
    if(exact)add(row,fatUssa,'model-color-list','吉やのファットウッサJr XSの色選択肢で色番号と名称を確認。River Roadで1.7g・24mm・XS・ガラスラトル1個を照合。','吉や')
    if(row.color==='大人の黒金' && !rp.code && fatUssa.riverRoad.uncodedColors.includes(row.color)){
      add(row,{...fatUssa,url:fatUssa.riverRoad.url},'model-color-list','River Roadの型・重量・全長・浮力・ラトル仕様と色選択欄の同一名称を確認。','PROSHOP River Road')
    }
  }
  pages.push({...fatUssa,status:'matched-model-color-list',models:['Fat USSA Jr. XS']})
  pages.push({...fatUssa.riverRoad,status:'matched-model-color-list',models:['Fat USSA Jr. XS'],checkedAt:fatUssa.checkedAt})
  pages.push(...supplemental.held)
  const recorded = new Set(pages.map(page=>page.url))
  for(const page of priorReview.pages)if(!recorded.has(page.url))pages.push(page)
  const byAcceptedVariant = new Map(accepted.map(row=>[row.variantId,row]))
  for(const row of priorReview.products){
    const page=pages.find(p=>p.url===row.url)
    if(!byAcceptedVariant.has(row.variantId) && page?.status?.startsWith('matched'))accepted.push(row)
  }

  const uniquePages = [...new Map(pages.map(page=>[page.url,page])).values()]
  await writeFile(directory+'RODIO_REVIEW.json',JSON.stringify({products:accepted,pages:uniquePages},null,2)+'\n')
  console.log('Reviewed pages',uniquePages.length,'accepted rows',accepted.length,'matched product pages',pages.filter(x=>x.status==='matched').length)
}
