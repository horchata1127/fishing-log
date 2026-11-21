import { expect, type Page } from '@playwright/test'
import { rc43Catalog, rc43TestPng } from './rc43Fixture'
export const rc43Gold = (modelId = 134) => rc43Catalog.variants.find((v: any) => v.modelId === modelId && v.colorName.replace(/^#\d+\s+/, '') === 'ゴールド')
export async function openRc43Manager(page: Page, modelId = 134) {
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
  await dictionary.getByLabel('辞書モデル').selectOption(String(modelId))
  await dictionary.getByLabel('辞書検索').fill('#1')
  const row = dictionary.locator(`article[data-variant-id="${rc43Gold(modelId).id}"]`)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'カラー写真を管理', exact: true }).click()
  return page.getByRole('region', { name: 'カラー写真の管理', exact: true })
}
export async function uploadRc43Photo(page: Page, options: { back?: boolean; modelOnly?: boolean; red?: number; verified?: boolean } = {}) {
  const manager = page.getByRole('region', { name: 'カラー写真の管理', exact: true })
  await manager.getByLabel('カラー写真ファイル', { exact: true }).setInputFiles({ name: 'synthetic-test.png', mimeType: 'image/png', buffer: rc43TestPng(options.red) })
  await manager.getByLabel('登録する写真の面').selectOption(options.back ? 'back' : 'front')
  await manager.getByLabel('写真の共有範囲').selectOption(options.modelOnly ? 'true' : 'false')
  await manager.getByRole('checkbox', { name: /自分が撮影した写真/ }).check()
  await manager.getByRole('checkbox', { name: 'このカラーと写真の面が正しいことを確認しました', exact: true }).setChecked(options.verified !== false)
  await manager.getByRole('button', { name: /写真を保存|写真の変更を保存/, exact: true }).click()
  await expect(manager.getByRole('status')).toContainText('写真を保存しました')
}
export async function openRc43CatchPicker(page: Page, modelId = 134) {
  await page.locator('.trip-row[data-trip-id="1"]').click()
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
  await modal.getByLabel('メモ（任意）', { exact: true }).fill('入力中のメモを保持')
  await modal.getByRole('button', { name: /ルアーを選ぶ/ }).click()
  const picker = page.getByRole('dialog', { name: 'ルアーを選択', exact: true })
  await picker.getByRole('button', { name: 'カタログ', exact: true }).click()
  await picker.getByLabel('モデルを選んでからカラーを選択').selectOption(String(modelId))
  await picker.getByPlaceholder('ルアー名・カラー・メーカーで検索').fill('#1')
  return { modal, picker, card: picker.locator(`[data-variant-id="${rc43Gold(modelId).id}"]`) }
}
