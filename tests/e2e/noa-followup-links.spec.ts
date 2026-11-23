import { readFileSync } from 'node:fs'
import { test, expect, restoreViaUI, readAllState } from './fixtures'
import { rc43Fixture } from '../rc43Fixture'
import { openRc43CatchPicker } from '../rc43UiHelpers'
const latest = JSON.parse(readFileSync('docs/noa-photo-coverage-followup/CATALOG.json', 'utf8'))
const fixture = () => {
  const data = rc43Fixture()
  Object.assign(data.data, { lureManufacturers: latest.manufacturers, lureSeries: latest.series, lureModels: latest.models, lureVariants: latest.variants })
  return data
}

test('all four FORODOX weights link to the selected product and open common samples without embedding or fetching images', async ({ page, context }) => {
  await restoreViaUI(page, fixture())
  const before = await readAllState(page), requests: string[] = []
  context.on('request', r => { if (/yimg\.jp|shop-pro\.jp|jointer\.jp|t-route\.net/.test(r.url())) requests.push(r.url()) })
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
  await dictionary.getByLabel('辞書検索').fill('SHOW')
  for (const [modelId, slug] of [[133, 'noa-15'], [134, 'noa-18'], [138, 'noa-s10'], [304, 'noa-s14']] as const) {
    await dictionary.getByLabel('辞書モデル').selectOption(String(modelId))
    const variant = latest.variants.find((v: any) => v.modelId === modelId && v.colorName === 'SHOW')
    const row = dictionary.locator(`article[data-variant-id="${variant.id}"]`)
    await expect(row.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', `https://store.shopping.yahoo.co.jp/openwater/${slug}-forodox.html`)
    await expect(row.getByRole('link', { name: '重量共通の色見本を開く' })).toHaveAttribute('rel', 'noopener noreferrer')
  }
  expect(requests).toEqual([])
  await expect(dictionary.locator('img[src^="http"]')).toHaveCount(0)
  expect(await readAllState(page)).toEqual(before)
})

test('image link failure opens separately and preserves catch input; product provenance remains available', async ({ page, context }) => {
  await restoreViaUI(page, fixture())
  const before = await readAllState(page)
  const { modal, picker } = await openRc43CatchPicker(page)
  await picker.getByPlaceholder('ルアー名・カラー・メーカーで検索').fill('エルドラド')
  const card = picker.locator('[data-variant-id="9987"]')
  await expect(card.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', 'https://fishing-shop-jh.com/?pid=176993639')
  await context.route('https://img07.shop-pro.jp/**', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<title>Synthetic unavailable source</title>' }))
  const [popup] = await Promise.all([context.waitForEvent('page'), card.getByRole('link', { name: '商品写真を開く' }).click()])
  await expect(popup).toHaveTitle('Synthetic unavailable source'); await popup.close()
  await expect(modal.getByLabel('メモ（任意）')).toHaveValue('入力中のメモを保持')
  await expect(card.getByRole('link', { name: '写真を見る' })).toBeVisible()
  await card.getByRole('button', { name: /NOA 1\.8g/ }).click()
  await expect(picker).not.toBeVisible()
  expect(await readAllState(page)).toEqual(before)
})
