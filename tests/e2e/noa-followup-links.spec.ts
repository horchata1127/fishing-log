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

test('all four FORODOX weights retain product pages with no image links, embedding or image fetches', async ({ page, context }) => {
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
    await expect(row.getByRole('link', { name: '重量共通の色見本を開く' })).toHaveCount(0)
    await expect(row.getByRole('link', { name: '写真を見る' })).toHaveAttribute('rel', 'noopener noreferrer')
  }
  expect(requests).toEqual([])
  await expect(dictionary.locator('img[src^="http"]')).toHaveCount(0)
  expect(await readAllState(page)).toEqual(before)
})

test('unavailable product page opens separately and preserves catch input, without direct image links', async ({ page, context }) => {
  await restoreViaUI(page, fixture())
  const before = await readAllState(page)
  const { modal, picker } = await openRc43CatchPicker(page)
  await picker.getByPlaceholder('ルアー名・カラー・メーカーで検索').fill('エルドラド')
  const card = picker.locator('[data-variant-id="9987"]')
  await expect(card.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', 'https://fishing-shop-jh.com/?pid=176993639')
  await expect(card.getByRole('link', { name: '商品写真を開く' })).toHaveCount(0)
  await context.route('https://fishing-shop-jh.com/**', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<title>Synthetic unavailable source</title>' }))
  const [popup] = await Promise.all([context.waitForEvent('page'), card.getByRole('link', { name: '写真を見る' }).click()])
  await expect(popup).toHaveTitle('Synthetic unavailable source'); await popup.close()
  await expect(modal.getByLabel('メモ（任意）')).toHaveValue('入力中のメモを保持')
  await expect(card.getByRole('link', { name: '写真を見る' })).toBeVisible()
  await card.getByRole('button', { name: /NOA 1\.8g/ }).click()
  await expect(picker).not.toBeVisible()
  expect(await readAllState(page)).toEqual(before)
})

test('NOA1.8g N.03 opens the verified Casting SKU in dictionary and catch picker; broken pink default has a replacement', async ({ page, context }) => {
  await restoreViaUI(page, fixture())
  const before = await readAllState(page)
  const source = 'https://store.castingnet.jp/shop/g/g4573151242095/'
  const variant = latest.variants.find((v: any) => v.modelId === 134 && v.colorName === 'N.03')
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
  await dictionary.getByLabel('辞書モデル').selectOption('134')
  await dictionary.getByLabel('辞書検索').fill('N.03')
  await expect(dictionary.locator(`article[data-variant-id="${variant.id}"]`).getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', source)
  await dictionary.getByLabel('辞書検索').fill('蛍光ピンク')
  const pink = latest.variants.find((v: any) => v.modelId === 134 && v.colorName === '蛍光ピンク')
  const pinkCard = dictionary.locator(`article[data-variant-id="${pink.id}"]`)
  await expect(pinkCard.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', 'https://store.castingnet.jp/shop/g/g4571169082726/')
  await expect(pinkCard.locator('a[href="https://fishing-shop-jh.com/?pid=190933920"]')).toHaveCount(0)
  await dictionary.getByRole('button', { name: '辞書を閉じる' }).click()
  const { modal, picker } = await openRc43CatchPicker(page)
  await picker.getByPlaceholder('ルアー名・カラー・メーカーで検索').fill('N.03')
  const card = picker.locator(`[data-variant-id="${variant.id}"]`)
  await context.route(source, route => route.fulfill({ contentType: 'text/html', body: '<title>Synthetic verified NOA1.8g N.03</title>' }))
  const [popup] = await Promise.all([context.waitForEvent('page'), card.getByRole('link', { name: '写真を見る' }).click()])
  await expect(popup).toHaveTitle('Synthetic verified NOA1.8g N.03'); await popup.close()
  await expect(modal.getByLabel('メモ（任意）')).toHaveValue('入力中のメモを保持')
  await expect(picker.locator('a[href*="/img/goods/"]')).toHaveCount(0)
  expect(await readAllState(page)).toEqual(before)
})
