import { test, expect, restoreViaUI, catalogFixture, readAllState } from './fixtures'
import { rc43Fixture, rc43TestPng } from '../rc43Fixture'
import type { LureExternalReference } from '../../src/data/lureExternalReferences'

test('non-NOA fixture displays in dictionary and both catch pickers, with retry and independent link', async ({ page, context }) => {
  const ref: LureExternalReference = {
    manufacturerName: 'TIMON', seriesName: 'Synthetic', modelName: 'Synthetic 1.2g',
    modelDetails: { weightG: 1.2 }, colorName: 'Fixture Gold',
    product: { url: 'https://example.test/products/fixture', verified: true },
    image: { url: 'https://example.test/images/fixture.png', kind: 'official-color-sample', verifiedHost: 'example.test',
      conditions: 'permitted', conditionsEvidence: 'Synthetic test grant', decoded: true },
    sourceName: 'Fixture', sourceType: 'manufacturer', evidenceUrl: 'https://example.test/products/fixture',
    checkedAt: '2026-11-28', verificationBasis: 'Synthetic exact product',
  }
  let state: 'success' | 'missing' | 'denied' | 'invalid' = 'success'
  let requests = 0
  await page.route('**/src/data/lureExternalReferences.ts*', route => route.fulfill({
    contentType: 'text/javascript',
    body: 'export const lureExternalReferences = ' + JSON.stringify([{ ...ref, image: { ...ref.image, url: ref.image!.url + '?case=' + state } }]),
  }))
  await page.route('https://example.test/images/fixture.png*', async route => {
    requests++
    if (state === 'denied') return route.abort('accessdenied')
    if (state === 'missing') return route.fulfill({ status: 404 })
    if (state === 'invalid') return route.fulfill({ contentType: 'image/png', body: 'invalid' })
    return route.fulfill({ contentType: 'image/png', body: rc43TestPng() })
  })
  await page.reload()
  const fixture = rc43Fixture()
  const seed = catalogFixture().data
  fixture.data.lureManufacturers.push({ ...seed.lureManufacturers[0], name: 'TIMON' })
  fixture.data.lureSeries.push({ id: 20, manufacturerId: 10, name: 'Synthetic' })
  fixture.data.lureModels.push({ id: 30, seriesId: 20, name: ref.modelName, weightG: 1.2, category: 'スプーン' })
  fixture.data.lureVariants.push({ id: 40, modelId: 30, colorName: ref.colorName })
  fixture.data.myLures.push({ id: 100, variantId: 40, active: true, ownershipStatus: 'owned' })
  await restoreViaUI(page, fixture)
  const before = await readAllState(page)

  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書' })
  await dictionary.getByLabel('辞書検索').fill(ref.colorName)
  const row = dictionary.locator('[data-variant-id="40"]')
  await expect(row.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', ref.product!.url)
  await expect(row.getByRole('button', { name: 'カラー写真を管理' })).toHaveCount(0)
  await row.getByRole('button', { name: /公式カラー見本を拡大/ }).click()
  await expect(page.getByRole('dialog', { name: /写真の拡大/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await dictionary.getByRole('button', { name: 'SVG配色', exact: true }).click()
  await expect(row.locator('img')).toHaveCount(0)
  for (const failure of ['missing', 'denied', 'invalid'] as const) {
    state = failure
    const previousRequests = requests
    await page.reload()
    await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
    await dictionary.getByLabel('辞書検索').fill(ref.colorName)
    await expect.poll(() => requests).toBeGreaterThan(previousRequests)
    await expect(row.locator('img')).toHaveCount(0)
    await expect(row.getByRole('img', { name: '汎用ルアーアイコン' })).toBeVisible()
    await expect(row.getByRole('link', { name: '写真を見る' })).toBeVisible()
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    const offlineRequests = requests
    await dictionary.getByRole('button', { name: 'SVG配色', exact: true }).click()
    await dictionary.getByRole('button', { name: '写真', exact: true }).click()
    await expect(row.locator('img')).toHaveCount(0)
    expect(requests).toBe(offlineRequests)
    state = 'success'
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(row.getByRole('button', { name: /公式カラー見本を拡大/ })).toBeEnabled()
  }
  await dictionary.getByRole('button', { name: '辞書を閉じる' }).click()
  await page.locator('.trip-row[data-trip-id="1"]').click()
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
  await modal.getByLabel('メモ（任意）').fill('保持する入力')
  await modal.getByRole('button', { name: /ルアーを選ぶ/ }).click()
  const picker = page.getByRole('dialog', { name: 'ルアーを選択', exact: true })
  const card = picker.locator('[data-variant-id="40"]')
  await expect(card.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', ref.product!.url)
  await picker.getByRole('button', { name: 'カタログ', exact: true }).click()
  await picker.getByLabel('モデルを選んでからカラーを選択').selectOption('30')
  await expect(card.getByRole('link', { name: '写真を見る' })).toHaveAttribute('href', ref.product!.url)
  await card.locator('.picker-lure-button').click()
  await expect(modal.getByLabel('メモ（任意）')).toHaveValue('保持する入力')
  expect(await readAllState(page)).toEqual(before)
})

test('reviewed BF product opens separately and keeps the offline icon', async ({ page, context }) => {
  const { rc45Fixture } = await import('../rc45Fixture')
  await restoreViaUI(page, rc45Fixture())
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書' })
  await dictionary.getByLabel('辞書検索').fill('Liberty')
  const row = dictionary.locator('[data-variant-id="286"]')
  const link = row.getByRole('link', { name: '写真を見る' })
  await expect(link).toHaveAttribute('href', /t-route\.net\/products\/.+\?variant=44183026434262$/)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(row.getByRole('img', { name: '汎用ルアーアイコン' })).toBeVisible()
  await context.setOffline(true)
  await expect(row.getByRole('img', { name: '汎用ルアーアイコン' })).toBeVisible()
  await expect(link).toBeVisible()
  await expect(row.locator('img')).toHaveCount(0)
})

test('TIMON retailer link keeps the exact type, optional image and existing records', async ({ page, context }) => {
  const fixture = rc43Fixture()
  fixture.data.lureManufacturers.push({ ...catalogFixture().data.lureManufacturers[0], name: 'TIMON' })
  fixture.data.lureSeries.push({ id: 20, manufacturerId: 10, name: 'Chibi PaniCra' })
  fixture.data.lureModels.push({ id: 30, seriesId: 20, name: 'Chibi PaniCra DR', weightG: 1.4, lengthMm: 25, category: 'クランク' })
  fixture.data.lureVariants.push({ id: 40, modelId: 30, colorName: '霞オリーブ' })
  fixture.data.myLures.push({ id: 100, variantId: 40, active: true, ownershipStatus: 'owned' })
  await restoreViaUI(page, fixture)
  const before = await readAllState(page)
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書' })
  await dictionary.getByLabel('辞書検索').fill('霞オリーブ')
  const row = dictionary.locator('[data-variant-id="40"]')
  const link = row.getByRole('link', { name: '写真を見る' })
  await expect(link).toHaveAttribute('href', 'https://store.castingnet.jp/shop/g/g4525807340297/')
  await expect(link).toHaveAttribute('target', '_blank')
  await context.setOffline(true)
  await expect(row.getByRole('img', { name: '汎用ルアーアイコン' })).toBeVisible()
  await expect(row.locator('img')).toHaveCount(0)
  expect(await readAllState(page)).toEqual(before)
})
