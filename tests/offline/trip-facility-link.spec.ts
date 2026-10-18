import { test,expect,chromium } from '@playwright/test'
import { mkdtemp,readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { facilityLinkScenario } from '../facilityLinkFixture'
import { timelineState } from '../timelineFixture'

test('RC27 offline linking, area edit, facility change, full restarts and v7 all-table round trip preserve history',async ({},info) => {
  const origin = 'http://127.0.0.1:4188', url = origin+'/fishing-log/'
  await fetch(origin+'/__test/version?v=A',{method:'POST'})
  const profile = await mkdtemp(join(tmpdir(),'fishing-facility-link-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile,{offline,serviceWorkers:'allow',viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,locale:'ja-JP',timezoneId:'Asia/Tokyo'})
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url)
    await expect(page.getByText('準備を完了するにはホームで再読み込みしてください。',{exact:true})).toBeVisible()
    await page.getByRole('button',{name:/(?:準備を完了して|更新して)再読み込み/}).click()
    await expect(page.getByText('圏外利用の準備完了',{exact:true})).toBeVisible()
    page.on('dialog',d=>d.accept())
    await page.getByTestId('restore-backup').setInputFiles({name:'synthetic-legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(facilityLinkScenario()))})
    await expect(page.getByRole('button',{name:/^日本イワナセンター 2026/})).toBeVisible()
    const before = await timelineState(page)
    await context.close();context=await launch(true);page=context.pages()[0]!
    let calls=0;page.on('request',r=>{if(r.url().includes('open-meteo'))calls++})
    await page.goto(url);await page.getByRole('button',{name:/^日本イワナセンター 2026/}).click()
    await page.getByRole('button',{name:'施設を設定・変更',exact:true}).click()
    let dialog=page.getByRole('dialog',{name:'釣り場・施設を編集',exact:true})
    await dialog.getByLabel('紐付ける正式施設').selectOption('official:nihon-iwana-center')
    await dialog.getByRole('button',{name:'施設を保存する',exact:true}).click();await expect(dialog).toHaveCount(0)
    const linked=await timelineState(page)
    for(const key of Object.keys(before))if(key!=='trips')expect(linked[key]).toEqual(before[key])
    await page.getByRole('region',{name:'釣果履歴',exact:true}).getByRole('button',{name:'編集',exact:true}).first().click()
    const catchDialog=page.getByRole('dialog',{name:'釣果を編集',exact:true})
    await expect(catchDialog.getByLabel('釣り場内のエリア',{exact:true}).locator('option')).toHaveCount(10)
    await catchDialog.getByLabel('釣り場内のエリア',{exact:true}).selectOption('official:nihon-iwana-center:pond-9')
    await catchDialog.getByRole('button',{name:'保存する',exact:true}).click();await expect(catchDialog).toHaveCount(0)
    const edited=await timelineState(page)
    expect(edited.catches!.find(c=>c.id===95006).memo).toBe('ゼロ号池');expect(calls).toBe(0)
    await context.close();context=await launch(true);page=context.pages()[0]!;await page.goto(url)
    expect(await timelineState(page)).toEqual(edited)
    await page.getByRole('button',{name:/^日本イワナセンター 2026/}).click()
    await page.getByRole('button',{name:'施設を設定・変更',exact:true}).click()
    dialog=page.getByRole('dialog',{name:'釣り場・施設を編集',exact:true})
    const target=edited.facilities!.find(f=>f.origin==='official'&&f.id!=='official:nihon-iwana-center')!
    await dialog.getByLabel('紐付ける正式施設').selectOption(target.id)
    await dialog.getByLabel('旧エリアを保持し、必要な現在エリアの解除を確認しました').check()
    await dialog.getByRole('button',{name:'施設を保存する',exact:true}).click();await expect(dialog).toHaveCount(0)
    const changed=await timelineState(page)
    for(const key of Object.keys(edited))if(key!=='trips')expect(changed[key]).toEqual(edited[key])
    await page.getByRole('button',{name:'← ホーム',exact:true}).click()
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'📦 データをバックアップ',exact:true}).click()])
    const path=info.outputPath('rc27-v7.json');await download.saveAs(path);const backup=JSON.parse(await readFile(path,'utf8'))
    expect(backup.version).toBe(7);expect(Object.keys(backup.data)).toHaveLength(19)
    page.on('dialog',d=>d.accept());await page.getByTestId('restore-backup').setInputFiles({name:'rc27-v7.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))})
    await expect.poll(async()=>(await timelineState(page)).trips).toEqual(changed.trips)
    expect(await timelineState(page)).toEqual(changed)
    await context.close();context=await launch(true);page=context.pages()[0]!;await page.goto(url)
    expect(await timelineState(page)).toEqual(changed)
  } finally {await context.close()}
})
