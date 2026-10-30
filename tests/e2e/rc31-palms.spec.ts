import { test, expect, readState, restoreViaUI } from './fixtures'
import { rc31Fixture } from '../rc31Fixture'
import { readFile } from 'node:fs/promises'

test('RC31 PALMS preview, cancel, apply, repeat, reload and v7 restore', async ({ page }, info) => {
  await restoreViaUI(page, rc31Fixture())
  const before = await readState(page)
  const check = page.getByRole('button', { name: 'RC31 PALMSの追加予定を確認', exact: true })
  const preview = page.getByRole('region', { name: 'RC31カタログの事前確認', exact: true })
  await check.click()
  await expect(preview).toContainText('追加 83色・登録済み 0色・保留 0件')
  expect(await readState(page)).toEqual(before)
  await preview.getByRole('button', { name: 'RC31の追加をキャンセル', exact: true }).click()
  expect(await readState(page)).toEqual(before)
  await check.click()
  await preview.getByRole('button', { name: 'RC31の確認済みカタログを追加', exact: true }).click()
  await expect(preview).toHaveCount(0)
  const saved = await readState(page)
  expect(saved.lureVariants).toHaveLength(2899)
  expect(saved.lureModels).toHaveLength(362)
  for (const table of Object.keys(before) as (keyof typeof before)[]) {
    if (!['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants'].includes(table)) expect(saved[table]).toEqual(before[table])
  }
  await check.click()
  await expect(preview).toContainText('追加 0色・登録済み 83色・保留 0件')
  await expect(preview.getByRole('button', { name: 'RC31の確認済みカタログを追加', exact: true })).toBeDisabled()
  await preview.getByRole('button', { name: 'RC31の追加をキャンセル', exact: true }).click()
  await page.reload()
  expect(await readState(page)).toEqual(saved)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
  const path = info.outputPath('synthetic-rc31-v7.json'); await download.saveAs(path)
  const backup = JSON.parse(await readFile(path, 'utf8')); expect(backup.version).toBe(7)
  await restoreViaUI(page, backup)
  expect(await readState(page)).toEqual(saved)
  await check.click()
  await expect(preview).toContainText('追加 0色・登録済み 83色・保留 0件')
})
