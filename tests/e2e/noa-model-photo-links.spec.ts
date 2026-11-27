import { test, expect, restoreViaUI, readAllState } from './fixtures'
import { rc43Catalog, rc43Fixture } from '../rc43Fixture'
import { openRc43CatchPicker } from '../rc43UiHelpers'
import { readFileSync } from 'node:fs'

test('new model photo link appears in dictionary and catch registration without changing records', async ({ page }) => {
  await restoreViaUI(page, rc43Fixture())
  const before = await readAllState(page)
  const variant = rc43Catalog.variants.find((v: any) => v.modelId === 136 && v.colorName === 'カステラ')
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
  await dictionary.getByLabel('辞書モデル').selectOption('136')
  await dictionary.getByLabel('辞書検索').fill('カステラ')
  const row = dictionary.locator(`article[data-variant-id="${variant.id}"]`)
  await expect(row.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', 'https://fishing-shop-jh.com/?pid=167608634')
  await dictionary.getByLabel('辞書モデル').selectOption('134')
  await expect(dictionary.getByRole('link', { name: '写真を見る' })).toHaveCount(0)
  await dictionary.getByRole('button', { name: '辞書を閉じる' }).click()
  const { picker, modal } = await openRc43CatchPicker(page, 136)
  await picker.getByPlaceholder('ルアー名・カラー・メーカーで検索').fill('カステラ')
  const card = picker.locator(`[data-variant-id="${variant.id}"]`)
  await expect(card.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', 'https://fishing-shop-jh.com/?pid=167608634')
  await card.locator('button.picker-lure-button').click()
  await expect(picker).not.toBeVisible()
  await expect(modal.getByLabel('メモ（任意）')).toHaveValue('入力中のメモを保持')
  expect(await readAllState(page)).toEqual(before)
})

test('latest 713-color catalog keeps Eldorado and FORODOX product pages without direct image navigation', async ({ page }) => {
  const latest = JSON.parse(readFileSync('docs/noa-color-photos/CATALOG.json', 'utf8'))
  const fixture = rc43Fixture()
  Object.assign(fixture.data, { lureManufacturers: latest.manufacturers, lureSeries: latest.series,
    lureModels: latest.models, lureVariants: latest.variants })
  await restoreViaUI(page, fixture)
  const before = await readAllState(page)
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
  await dictionary.getByLabel('辞書モデル').selectOption('134')
  await dictionary.getByLabel('辞書検索').fill('エルドラド')
  const eldorado = dictionary.locator('article[data-variant-id="9987"]')
  await expect(eldorado.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', 'https://fishing-shop-jh.com/?pid=176993639')
  for (const name of ['ゲンちゃんブラウニー', 'キャンタの飛沫', 'ソルティマジョーラ改', '茶ッキン', 'SHOW', 'クズブルー']) {
    await dictionary.getByLabel('辞書検索').fill(name)
    const variant = latest.variants.find((v: any) => v.modelId === 134 && v.colorName === name)
    const row = dictionary.locator(`article[data-variant-id="${variant.id}"]`)
    await expect(row).toBeVisible()
    await expect(row.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', 'https://store.shopping.yahoo.co.jp/openwater/noa-18-forodox.html')
    await expect(row.getByRole('link', { name: '重量共通の色見本を開く' })).toHaveCount(0)
    await expect(row.getByRole('img', { name: '汎用ルアーアイコン', exact: true })).toBeVisible()
  }
  expect(await readAllState(page)).toEqual(before)
})
