import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { timelineState } from './timelineFixture'
import { weatherTripName, weatherTripId } from './weatherFixture'

export async function editEndedTrip(page: Page) {
  const before = await timelineState(page)
  await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
  await page.getByRole('button', { name: '釣行情報を編集', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '釣行情報を編集', exact: true })
  await dialog.getByLabel('釣行日', { exact: true }).fill('2026-10-17')
  await dialog.getByRole('button', { name: '変更内容を確認', exact: true }).click()
  await expect(dialog).toContainText('2026-10-16 → 2026-10-17')
  expect(await timelineState(page)).toEqual(before)
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
  expect(await timelineState(page)).toEqual(before)
  await page.getByRole('button', { name: '釣行情報を編集', exact: true }).click()
  await dialog.getByLabel('釣行日', { exact: true }).fill('2026-10-17')
  await dialog.getByLabel('釣りスタイル', { exact: true }).selectOption('NATIVE_TROUT')
  await dialog.getByLabel('天気', { exact: true }).selectOption('雨')
  await dialog.getByRole('button', { name: '変更内容を確認', exact: true }).click()
  await dialog.getByRole('button', { name: '入力に戻る', exact: true }).click()
  await expect(dialog.getByLabel('釣行日', { exact: true })).toHaveValue('2026-10-17')
  await dialog.getByRole('button', { name: '変更内容を確認', exact: true }).click()
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await dialog.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const after = await timelineState(page)
  for (const table of Object.keys(before)) {
    if (table !== 'trips') expect(after[table], table).toEqual(before[table])
  }
  expect(after.trips).toEqual(before.trips!.map(t => t.id === weatherTripId ? { ...t, fishingDate: '2026-10-17', fishingStyle: 'NATIVE_TROUT', weather: '雨' } : t))
  await page.getByRole('button', { name: '← ホーム', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
  await expect(page.locator('.trip-card')).toContainText('2026/10/17')
  await expect(page.locator('.trip-card')).toContainText('ネイティブトラウト')
  await page.getByRole('button', { name: '← ホーム', exact: true }).click()
  return after
}
