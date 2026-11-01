import { expect, test, type Page } from '@playwright/test'

export async function openMaster(page: Page) {
  const screen = page.getByRole('region', { name: 'ルアーマスター管理', exact: true })
  if (!await screen.isVisible()) await page.getByRole('button', { name: 'ルアーマスター管理', exact: true }).click()
  else if (await screen.getByRole('button', { name: '← マスター管理に戻る', exact: true }).isVisible()) await screen.getByRole('button', { name: '← マスター管理に戻る', exact: true }).click()
  return screen
}
export async function checkMaster(page: Page, purchases = false) {
  const screen = await openMaster(page)
  const option = screen.getByLabel('RC33の購入指定もマイルアーへ登録する', { exact: true })
  await option.setChecked(purchases)
  await expect(screen.getByRole('button', { name: '最新版との差分を確認', exact: true })).toBeEnabled()
  await screen.getByRole('button', { name: '最新版との差分を確認', exact: true }).click()
  const preview = screen.getByRole('region', { name: '統一マスターの差分プレビュー', exact: true })
  await expect(preview).toBeVisible()
  return preview
}
export async function prepareMaster(page: Page) {
  const preview = page.getByRole('region', { name: '統一マスターの差分プレビュー', exact: true })
  const [download] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: '更新前のバックアップを保存', exact: true }).click()])
  await download.saveAs(test.info().outputPath(`before-master-${Date.now()}.json`))
  await expect(preview.getByRole('heading', { name: '更新の最終確認', exact: true })).toBeVisible()
  await expect(preview.getByRole('button', { name: '確認して更新を実行', exact: true })).toBeDisabled()
  return preview
}
export async function applyMaster(page: Page) {
  const preview = await prepareMaster(page)
  await preview.getByLabel('バックアップファイルが保存されていることを確認しました', { exact: true }).check()
  await preview.getByRole('button', { name: '確認して更新を実行', exact: true }).click()
  const result = page.getByRole('region', { name: 'マスター更新結果', exact: true })
  await expect(result).toBeVisible()
  return result
}
export async function masterHome(page: Page) {
  await page.getByRole('region', { name: 'ルアーマスター管理', exact: true }).getByRole('button', { name: '← ホーム', exact: true }).click()
}
