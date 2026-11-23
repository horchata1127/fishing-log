import { test, expect, restoreViaUI, readAllState } from './fixtures'
import { rc43Fixture } from '../rc43Fixture'
import { openRc43Manager, uploadRc43Photo, openRc43CatchPicker } from '../rc43UiHelpers'

test('RC43 unavailable external page cannot lose input or block a normal color selection', async ({ page, context }) => {
  await restoreViaUI(page, rc43Fixture())
  const before = await readAllState(page), { modal, picker, card } = await openRc43CatchPicker(page)
  await context.route('https://fishing-shop-jh.com/**', route => route.abort('failed'))
  const [popup] = await Promise.all([page.waitForEvent('popup'), card.getByRole('link', { name: '写真を見る' }).click()])
  await popup.close()
  await expect(modal.getByLabel('メモ（任意）')).toHaveValue('入力中のメモを保持')
  await card.getByRole('button', { name: /NOA 1\.8g/ }).click()
  await expect(picker).not.toBeVisible()
  expect(await readAllState(page)).toEqual(before)
})

test('RC43 unreadable local photo falls back to existing SVG/external reference and still permits selection', async ({ page }) => {
  await restoreViaUI(page, rc43Fixture())
  const before = await readAllState(page), manager = await openRc43Manager(page)
  await uploadRc43Photo(page)
  await manager.getByRole('button', { name: '写真管理を閉じる' }).click()
  await page.getByRole('button', { name: '辞書を閉じる' }).click()
  await page.evaluate(() => { URL.createObjectURL = () => `blob:${location.origin}/missing-color-photo` })
  const { modal, picker, card } = await openRc43CatchPicker(page)
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByRole('link', { name: '写真を見る' })).toBeVisible()
  await expect(card.getByRole('img', { name: '配色プレビュー', exact: true })).toBeVisible()
  await card.getByRole('button', { name: /NOA 1\.8g/ }).click()
  await expect(picker).not.toBeVisible()
  await expect(modal.getByLabel('メモ（任意）')).toHaveValue('入力中のメモを保持')
  expect(await readAllState(page)).toEqual(before)
})

test('RC43 a back-only shared photo is displayed first across NOA models instead of yielding to an external link', async ({ page }) => {
  await restoreViaUI(page, rc43Fixture())
  const manager = await openRc43Manager(page)
  await uploadRc43Photo(page, { back: true })
  await manager.getByRole('button', { name: '写真管理を閉じる' }).click()
  await page.getByRole('button', { name: '辞書を閉じる' }).click()
  const { card } = await openRc43CatchPicker(page, 136)
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByRole('img', { name: /裏面写真/ })).toBeVisible()
  await expect(card.getByRole('link', { name: '写真を見る' })).toBeVisible()
})
