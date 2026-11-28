import {chromium} from 'playwright'
import {readFile,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const browser=await chromium.launch()
const base='https://fishing-shop-jh.com/'
const initial=JSON.parse(await readFile('docs/lure-external-links/SOURCE_PAGES.json'))
const sleep=()=>new Promise(r=>setTimeout(r,350))
const output=process.argv[2]
if(!output)throw new Error('Pass an output path for the structured page metadata')
const checkedAt = process.env.RODIO_REVIEW_DATE ?? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())
const reviewed=JSON.parse(await readFile('docs/lure-external-links/RODIO_REVIEW.json'))
const completed=new Map(reviewed.pages.map(page=>[page.url,page]))
const entries= new Map()
let previous=[]
try {previous=JSON.parse(await readFile(output))} catch(e) {if(e.code!=='ENOENT')throw e}
for(const x of previous)entries.set(x.url,x)
const context=await browser.newContext()
await context.route('**/*',r=>['image','font','media'].includes(r.request().resourceType())?r.abort():r.continue())
async function visit(page,url){
 if(entries.has(url))return entries.get(url)
 await sleep()
 let data
 try {
   const res=await page.goto(url,{waitUntil:'domcontentloaded',timeout:18000})
   data={url,finalUrl:page.url(),status:res.status(),checkedAt,...await page.evaluate(()=>({
     title:document.title, headings:[...document.querySelectorAll('h1,h2,h3')].map(x=>x.textContent.trim()).filter(Boolean).slice(0,25),
     facts:document.body.innerText.split('\n').map(x=>x.trim()).filter(x=>/JAN|商品コード|全長|自重|ウェイト|重量|ラトル|タイプ|フック|Length|Weight|フローティング|シンキング/.test(x)).slice(-24),
     images:[...document.querySelectorAll('meta[property="og:image"],img[itemprop="image"],.goods-img img')].map(x=>({url:x.content||x.src,alt:x.alt||''})).filter(x=>x.url).slice(0,8),
     links:[...document.querySelectorAll('a[href]')].map(a=>[a.href,a.textContent.trim()||a.querySelector('img')?.alt||'']).filter(([u,t])=>t&&(/(?:gid=|pid=|\/shop\/g\/g|\/shop\/goods\/search\.aspx)/.test(u)))
   })) }
 }catch(e){data={url,checkedAt,error:String(e).split('\n')[0]}}
 if (process.argv[3]==='products') delete data.links
 entries.set(url,data)
 await writeFile(output,JSON.stringify([...entries.values()]))
 return data
}
function jhUrl(u) {
 const source=new URL(u)
 const pid=source.searchParams.get('pid')
 if(pid)return base+'?pid='+pid
 const gid=source.searchParams.get('gid')
 return gid?base+'?mode=grp&gid='+gid+'&sort=n'+(source.searchParams.get('page')>1?'&page='+source.searchParams.get('page'):''):''
}
async function jh(){
 const page=await context.newPage()
 const queue=new Set([base+'?mode=grp&gid=1269246&sort=n',base+'?mode=grp&gid=1264442&sort=n'])
 const eligible=/モカ|ウッサ|ジキル|キューム|QM|NOA|ノア|ロデオクラフト|レギュラーカラー|問屋|オリカラ|次のページ/i
 for(const url of queue){
   if(queue.size>205)break
   const result=await visit(page,url)
   for(const [u,t] of result.links||[]){
     const next=jhUrl(u)
     if(!next.includes('gid=')||!eligible.test(t))continue
     if(t==='ロデオクラフト/RODIO CRAFT'||t==='ロデオクラフト')continue
     const same=new URL(u).searchParams.get('gid')===new URL(url).searchParams.get('gid')
     if(same&&new URL(u).searchParams.get('page')>12)continue
     if(!same && (url.includes('gid=1264442')||url.includes('gid=1269246')) && /レギュラーカラー|問屋|オリカラ/.test(t))continue
     queue.add(next)
   }
 }
 await page.close()
}
async function casting(){
 const page=await context.newPage()
 for(const keyword of ['モカ','ウッサ','ノア','ジキル','キューム']){
   const encoded=execFileSync('python',['-c','import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1].encode("cp932")))',keyword],{encoding:'utf8'}).trim()
   const search='https://store.castingnet.jp/shop/goods/search.aspx?category=0802&filtercode13=&style=&sort=&ps=&search.x=0&mkr=457116908&keyword='+encoded
   const queue=new Set([search])
   for(const url of queue){
     if(queue.size>30)break
     const result=await visit(page,url)
     for(const [u,t] of result.links||[]) if(u.includes('search.aspx?')&&u.includes(encoded)&&/^\d+$|次|＞|>/u.test(t)) queue.add(u)
   }
 }
 await page.close()
}
try {
 if(process.argv[3]==='products'){
   const page=await context.newPage()
   const selected=JSON.parse(await readFile(process.argv[4]))
   for(const url of selected){
     const saved=completed.get(url)
     if(saved?.status==='matched' && saved.headings?.length && saved.finalUrl){
       entries.set(url,{...saved,status:saved.httpStatus})
     } else if (!saved || process.env.RODIO_RECHECK_HELD==='1'){
       const result=await visit(page,url)
       if(process.argv[5]==='stop-on-access-limit' && [403,429,503].includes(result.status))break
     } else {
       entries.set(url,{...saved,status:saved.httpStatus})
     }
   }
   await writeFile(output,JSON.stringify([...entries.values()]))
 } else {
   await jh()
   await casting()
   const page=await context.newPage()
   const urls=new Set(initial.filter(x=>x.manufacturer==='RODIO CRAFT'&&x.kind==='product'&&x.status==='unreviewed'&&!completed.has(x.url)).map(x=>x.url))
   for(const url of urls)await visit(page,url)
 }
}finally{await browser.close()}
