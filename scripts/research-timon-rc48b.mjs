import {readFile,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'
const docs='docs/lure-external-links/'
const file=docs+'TIMON_RETAILER_LISTINGS.json'
const saved=new Map(await readFile(file).then(JSON.parse).then(rows=>rows.map(r=>[r.url,r]),e=>{if(e.code==='ENOENT')return [];throw e}))
const sources=JSON.parse(await readFile(docs+'SOURCE_PAGES.json'))
const otsuka=[...new Set(sources.filter(r=>r.manufacturer==='TIMON'&&r.url.includes('fishing-otsuka.co.jp')).map(r=>r.url))]
const browser=await chromium.launch()
const context=await browser.newContext()
const hosts=new Set(['www.fishing-otsuka.co.jp','fishing-shop-jh.com','www.fishing-shop-jh.com'])
await context.route('**/*',r=>r.request().isNavigationRequest()&&hosts.has(new URL(r.request().url()).hostname)?r.continue():r.abort())
const page=await context.newPage()
const refreshListings=process.argv.includes('--refresh-listings')
const listingLimit=Number(process.argv.find(arg=>arg.startsWith('--listing-limit='))?.split('=')[1]??70)
async function visit(url,store,kind){
 if(saved.has(url)&&!(kind==='listing'&&refreshListings))return saved.get(url)
 await new Promise(r=>setTimeout(r,400))
 let record={url,store,kind,checkedAt:'2026-11-28'}
 try{
  const res=await page.goto(url,{waitUntil:'domcontentloaded',timeout:12000})
  Object.assign(record,{status:res.status(),finalUrl:page.url()},await page.evaluate(()=>({
   title:document.title, headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.textContent.trim()).filter(Boolean).slice(0,10),
   facts:document.body.innerText.split('\n').map(s=>s.trim()).filter(s=>/JAN|商品コード|Weight|TYPE|重量|全長|自重/.test(s)).slice(0,20),
   links:[...new Map([...document.querySelectorAll('a[href]')].filter(a=>/pid=|gid=/.test(a.href)).map(a=>[a.href,[a.href,(a.textContent.trim()||a.querySelector('img')?.alt||'').trim()]])).values()],
  })))
 }catch(error){record.error=String(error).split('\n')[0]}
 if(store==='otsuka')delete record.links
 else record.links = record.links?.filter(([url,name])=>url.includes('gid=') ? relevant.test(name) : /^TIMON\s/i.test(name))
 saved.set(url,record)
 await writeFile(file,JSON.stringify([...saved.values()],null,2)+'\n')
 return record
}
const root='https://fishing-shop-jh.com/'
const queue=new Set([root+'?mode=grp&gid=1264448&sort=n'])
const relevant=/パニクラ|キビパニ|ペピーノ|レイゲン|ミッツ|プリッキー|フッテン|スライドン|ティアロ|クロボール|クワトロ|リクーゼ|アピード|ロミー|レギュラーカラー|次のページ/i
try{
 for(const url of otsuka){
  const result=await visit(url,'otsuka','product')
  if(result.error||[403,429,503].includes(result.status)||/just a moment|attention required|access denied/i.test(result.title??''))break
 }
 let listingsVisited=0
 for(const url of queue){
  if(listingsVisited++>=listingLimit)break
  const result=await visit(url,'jh','listing')
  if([403,429].includes(result.status))break
  for(const [link,label] of result.links??[]){
   const u=new URL(link), gid=u.searchParams.get('gid'), page=u.searchParams.get('page')
   if(!gid||!hosts.has(u.hostname)||!relevant.test(label)||Number(page)>8)continue
   queue.add(root+'?mode=grp&gid='+gid+'&sort=n'+(Number(page)>1?'&page='+page:''))
  }
 }
}finally{await browser.close()}
