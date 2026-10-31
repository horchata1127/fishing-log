import { test, expect, chromium, type Page } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc28Fixture } from '../rc28Fixture'
import { rc28Catalog } from '../../src/data/rc28Catalog'

const origin='http://127.0.0.1:4188',url=origin+'/fishing-log/'
async function state(page: Page) {
  return page.evaluate(async()=>{
    const database=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('FishingLogDatabase')
      request.onupgradeneeded=()=>{request.transaction?.abort();reject(new Error('App DB missing'))}
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
    })
    try{
      const names=Array.from(database.objectStoreNames)
      return await new Promise<Record<string,Record<string,any>[]>>((resolve,reject)=>{
        const transaction=database.transaction(names,'readonly'),data:Record<string,Record<string,any>[]>={}
        for(const name of names){const request=transaction.objectStore(name).getAll();request.onsuccess=()=>{data[name]=request.result}}
        transaction.oncomplete=()=>resolve(JSON.parse(JSON.stringify(data)))
        transaction.onabort=()=>reject(transaction.error)
      })
    }finally{database.close()}
  })
}
test('RC28 precached catalog applies after offline cold start; references and v7 export survive restart',async({},info)=>{
  await fetch(origin+'/__test/version?v=A',{method:'POST'})
  const profile=await mkdtemp(join(tmpdir(),'fishing-rc28-offline-')),mobile=info.project.name.includes('mobile')
  const launch=(offline=false)=>chromium.launchPersistentContext(profile,{serviceWorkers:'allow',offline,
    viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,locale:'ja-JP',timezoneId:'Asia/Tokyo'})
  let context=await launch()
  try{
    let page=context.pages()[0]!
    await page.goto(url)
    await expect(page.getByText('準備を完了するにはホームで再読み込みしてください。',{exact:true})).toBeVisible()
    await page.getByRole('button',{name:/(?:準備を完了して|更新して)再読み込み/}).click()
    await expect(page.getByText('圏外利用の準備完了',{exact:true})).toBeVisible()
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true)
    page.on('dialog',d=>d.accept())
    await page.getByTestId('restore-backup').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rc28Fixture()))})
    await expect.poll(async()=>(await state(page)).myLures!.length).toBe(1)
    const before=await state(page)
    await context.close();context=await launch(true);page=context.pages()[0]!
    await page.goto(url)
    expect(await state(page)).toEqual(before)
    await page.getByRole('button',{name:'RC28の追加予定を確認',exact:true}).click()
    const preview=page.getByRole('region',{name:'RC28カタログの事前確認',exact:true})
    const colors=rc28Catalog.reduce((n,t)=>n+t.colors.length,0)
    await expect(preview).toContainText(`追加 ${colors}色`)
    await preview.getByRole('button',{name:'RC28の確認済みカタログを追加',exact:true}).click()
    await expect(preview).not.toBeVisible()
    const saved=await state(page)
    expect(saved.lureVariants!.length-before.lureVariants!.length).toBe(colors)
    for(const table of Object.keys(before)) if(!['lureSeries','lureModels','lureVariants'].includes(table)) expect(saved[table]).toEqual(before[table])
    await context.close();context=await launch(true);page=context.pages()[0]!
    await page.goto(url);expect(await state(page)).toEqual(saved)
    const download=page.waitForEvent('download')
    await page.getByRole('button',{name:'📦 データをバックアップ',exact:true}).click()
    const path=info.outputPath('synthetic-rc28-offline-v7.json');await(await download).saveAs(path)
    const backup=JSON.parse(await readFile(path,'utf8'))
    // Empty RC32 stores are deliberately omitted from legacy v7 exports.
    const { lureVisualProfiles, temporaryLureColors, ...legacyData } = saved
    expect(lureVisualProfiles).toEqual([]);expect(temporaryLureColors).toEqual([])
    expect(backup.version).toBe(7);expect(backup.data).toEqual(legacyData)
  }finally{await context.close()}
})
