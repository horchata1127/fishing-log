import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
const cache='.rc52c-timon.local/'
await mkdir(cache,{recursive:true})
const file=cache+'TIMON_RETAILER_VARIANT_PAGES.json'
const checkedAt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())
const rows=await readFile(file).then(JSON.parse,e=>{if(e.code==='ENOENT')return [];throw e})
const saved=new Map(rows.map(r=>[r.url,r]))
const tRoute='https://t-route.net/products/'
const kitiya='https://www.kitiya.jp/?pid='
const targets=new Map([
 [tRoute+encodeURIComponent('ちびパニクラ')+'dr-ss','troute'],
 [tRoute+encodeURIComponent('ちびパニクラ')+'sr','troute'],
 ...['179966940','179971524','186467650','186468024','183128179','190232183','190232635','190232688','171992699','189668742','173961534','183577932','185126466','165044001','93707773','182978155','190508313','82811491','160046041'].map(pid=>[kitiya+pid,'kitiya']),
 ['https://www.kitiya.jp/?cbid=382616&csid=0&mode=cate&page=2','kitiya-index'],
 ['https://www.kitiya.jp/?cbid=382616&csid=10&mode=cate&sort=n','kitiya-index'],
 ['https://www.area-island.com/?pid=170903425','area-island'],
 ['https://troutisland.shop-pro.jp/?pid=86566861','troutisland'],
])
function addListingTargets(record){
 for(const [target,label] of record.links??[]){
  if(!/ちびペピーノ|デカミッツ|クロボール|ティアロ|アピード|ちびパニクラ/.test(label)||
    /ダッシュ|1091|有頂天|Tコネクション|ちびティアロ 0.5/.test(label))continue
  if(new URL(target).origin==='https://www.kitiya.jp')targets.set(target,'kitiya')
 }
}
for(const record of saved.values())if(record.store==='kitiya-index')addListingTargets(record)
const b=await chromium.launch()
try{
 const p=await b.newPage()
 await p.route('**/*',r=>r.request().isNavigationRequest()&&['t-route.net','www.kitiya.jp','www.area-island.com','troutisland.shop-pro.jp'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort())
 const blocked=new Set(rows.filter(row=>[403,429,503].includes(row.httpStatus)).map(row=>new URL(row.url).hostname))
 for(const [url,store] of targets){
  const host=new URL(url).hostname
  if(saved.has(url)||blocked.has(host))continue
  await new Promise(r=>setTimeout(r,450))
  let record={url,store,checkedAt}
  try{
   const response=await p.goto(url,{waitUntil:'domcontentloaded',timeout:12000})
   Object.assign(record,{httpStatus:response.status(),finalUrl:p.url()},await p.evaluate(()=>{
     const clean=e=>e?.textContent.replace(/\s+/g,' ').trim()??''
     const map=new Map()
     for(const table of document.querySelectorAll('table')) {
       const rows=[...table.rows].map(row=>[...row.cells].map(clean))
       if(rows.length<3||rows.length>150||rows.some(r=>r.length<2))continue
       map.set(JSON.stringify(rows),rows)
     }
     const options=[...new Set([...document.querySelectorAll('select')].flatMap(select=>[...select.options].map(clean).filter(x=>/\s[×〇○]$/.test(x))))]
     const shopOptions=[...new Set([...document.querySelectorAll('select[name*="option"]')].flatMap(select=>
       [...select.options].filter(option=>option.value).map(clean)))]
     const meta=window.ShopifyAnalytics?.meta?.product ?? window.meta?.product
     const variants=meta?.variants?.filter(v=>Number.isSafeInteger(v.id)&&typeof v.public_title==='string')
       .map(v=>({id:v.id,title:v.public_title,sku:/^\d{13}$/.test(v.sku??'')?v.sku:undefined}))
     const links=[...new Map([...document.querySelectorAll('a[href*="pid="]')]
       .map(a=>[a.href,clean(a)]).filter(([,t])=>t&&/ティモン|TIMON/.test(t))).entries()]
     const facts=document.body.innerText.split('\n').map(x=>x.trim())
       .filter(x=>/^(?:■|◆|【|●)?(?:サイズ|全長|自重|重量|Weight|Length|タイプ)\b/i.test(x)||/^(?:■|◆|【|●)(?:サイズ|全長|自重|重量|タイプ)/.test(x)).slice(0,25)
     const headings=[...document.querySelectorAll('h1,h2')].map(clean).filter(Boolean).slice(0,8)
     return {title:document.title,headings,options,shopOptions,variants,tables:[...map.values()],links,facts,
       vendor:typeof meta?.vendor==='string'?meta.vendor:undefined,
       ogImage:document.querySelector('meta[property="og:image"]')?.content}
   }))
   if([403,429,503].includes(record.httpStatus))blocked.add(host)
  }catch(error){record.error=String(error).split('\n')[0]}
  if(store==='kitiya-index') addListingTargets(record)
  else delete record.links
  saved.set(url,record)
  await writeFile(file,JSON.stringify([...saved.values()],null,2)+'\n')
 }
 console.log([...saved.values()].map(p=>[p.store,p.httpStatus,p.title,p.options?.length,p.variants?.length]))
}finally{await b.close()}
