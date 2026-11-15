import { expect, type Locator, type Page } from '@playwright/test'

export async function tapMap(svg:Locator,x:number,y:number){const box=await svg.boundingBox();await svg.click({position:{x:box!.width*x,y:box!.height*y}})}
export async function dragMap(page:Page,svg:Locator,from:[number,number],to:[number,number]){
  await svg.scrollIntoViewIfNeeded();const box=(await svg.boundingBox())!
  await page.mouse.move(box.x+box.width*from[0],box.y+box.height*from[1]);await page.mouse.down()
  await page.mouse.move(box.x+box.width*to[0],box.y+box.height*to[1],{steps:8});await page.mouse.up()
}
export async function createRc41Map(page:Page,name:string,template='P01',features=true){
  await page.getByRole('button',{name:'エリアマップ管理',exact:true}).click()
  const manager=page.getByRole('dialog',{name:'エリアマップ管理',exact:true})
  await manager.getByRole('button',{name:'＋エリアを追加',exact:true}).click()
  await manager.getByLabel('エリアマップ名（必須）',{exact:true}).fill(name)
  await manager.getByLabel('新規エリア名（必須）',{exact:true}).fill(name)
  if(template.startsWith('R'))await manager.getByLabel('水域種別',{exact:true}).selectOption('river')
  await manager.getByLabel('形状テンプレート',{exact:true}).selectOption(template)
  const svg=manager.getByRole('img',{name:`${name}のエリアマップ`,exact:true})
  if(features){
    await manager.getByRole('button',{name:'インレット追加',exact:true}).click();await tapMap(svg,.3,.23)
    await manager.getByRole('button',{name:'アウトレット追加',exact:true}).click();await tapMap(svg,.7,.77)
    await expect(svg.locator('[data-feature-id]')).toHaveCount(2)
    await manager.getByLabel('特徴物を選択',{exact:true}).selectOption({index:1})
    await manager.getByLabel('特徴物の名称',{exact:true}).fill('流れ込み')
    await manager.getByLabel('特徴物のメモ',{exact:true}).fill('青い水流')
  }
  await manager.getByRole('button',{name:'マップを保存',exact:true}).click()
  await expect(manager.getByRole('button',{name:`編集：${name}`,exact:true})).toBeVisible()
  await manager.getByRole('button',{name:'閉じる',exact:true}).click()
  await expect(manager).not.toBeVisible()
}
export async function recordRc41Position(page:Page,name:string){
  await page.getByRole('button',{name:'釣り座を記録',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'イベント追加',exact:true})
  await editor.getByLabel('釣り座のエリアマップ',{exact:true}).selectOption({label:name})
  const svg=editor.getByRole('img',{name:`${name}のエリアマップ`,exact:true})
  await tapMap(svg,.33,.22)
  await expect(svg.getByTestId('fishing-position-marker')).toBeVisible()
  await editor.getByLabel('キャスト方向（マップ上の相対角度・任意）',{exact:true}).selectOption('90')
  await editor.getByLabel('メモ',{exact:true}).fill('岸の釣り座')
  await editor.getByRole('button',{name:'保存',exact:true}).click()
  await expect(editor).not.toBeVisible()
}
