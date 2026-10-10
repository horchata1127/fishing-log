import { readFile } from 'node:fs/promises'
import type { Page, Locator } from '@playwright/test'
import { test, expect, catalogFixture, tableNames, readState, restoreViaUI,
  startTrip, selectCatalog, saveCatch, registerTackleSet } from './fixtures'

const catchDialog = (page: Page) => page.getByRole('dialog', { name: '釣果を登録', exact: true })
const home = (page: Page) => page.getByRole('button', { name: '← ホーム', exact: true }).click()
const openCatch = (page: Page) => page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()

test('A: 釣行・カタログ釣果・キャンセル・自動所有・前回と同じ・手入力・一覧', async ({ page }) => {
  await restoreViaUI(page, catalogFixture())
  await startTrip(page)
  const before = await readState(page)
  await openCatch(page)
  await selectCatalog(page)
  await catchDialog(page).getByRole('button', { name: 'キャンセル', exact: true }).click()
  expect(await readState(page)).toEqual(before)

  await openCatch(page)
  await selectCatalog(page)
  await saveCatch(page)
  const first = await readState(page)
  const owned = first.myLures.filter(row => row.ownershipStatus === 'owned')
  expect(owned).toHaveLength(1)
  expect(owned[0].variantId).toBe(40)
  expect(first.catches).toHaveLength(1)
  expect(first.catches[0]).toMatchObject({ lureId: owned[0].id, lureVariantId: 40, lureName: 'E2Eスプーン', lureColor: '赤' })
  expect(first.myLures.filter(row => row.id <= 52)).toEqual(before.myLures)

  await openCatch(page)
  await selectCatalog(page)
  await saveCatch(page)
  await openCatch(page)
  await catchDialog(page).getByRole('button', { name: '前回と同じ' }).click()
  await expect(catchDialog(page)).not.toBeVisible()
  const third = await readState(page)
  expect(third.catches).toHaveLength(3)
  expect(third.myLures).toEqual(first.myLures)
  expect(third.catches.every(row => row.lureId === owned[0].id && row.lureVariantId === 40)).toBe(true)

  await openCatch(page)
  await selectCatalog(page, '青')
  await catchDialog(page).getByRole('button', { name: '手入力する' }).click()
  await catchDialog(page).getByLabel('ルアー名', { exact: true }).fill('手入力E2Eルアー')
  await catchDialog(page).getByLabel('カラー', { exact: true }).fill('金')
  await saveCatch(page)
  const final = await readState(page)
  expect(final.catches).toHaveLength(4)
  expect(final.myLures).toEqual(first.myLures)
  expect(final.catches[3]).toMatchObject({ lureName: '手入力E2Eルアー', lureColor: '金' })
  expect(final.catches[3]).not.toHaveProperty('lureId')
  expect(final.catches[3]).not.toHaveProperty('lureVariantId')
  const history = page.getByRole('region', { name: '釣果履歴' })
  await expect(history.getByText('4匹目', { exact: true })).toBeVisible()
  await expect(history).toContainText('手入力E2Eルアー')
  await home(page)
  await page.getByRole('button', { name: '🎣 マイルアー', exact: true }).click()
  const myLures = page.getByRole('region', { name: '所有ルアー' })
  await expect(myLures.getByRole('article')).toHaveCount(1)
  await expect(myLures.getByRole('article')).toContainText('E2Eスプーン')
  await expect(myLures.getByRole('article')).toContainText('🎣 3匹')
})

async function prepareTackleHistory(page: Page) {
  await restoreViaUI(page, catalogFixture())
  await registerTackleSet(page)
  await startTrip(page) // 釣行開始後に持参セットを追加する経路も確認。
  await page.getByRole('button', { name: '持参セットを追加・変更', exact: true }).click()
  const planned = page.getByRole('dialog', { name: '持参セットを変更', exact: true })
  await planned.getByLabel('クランク用①', { exact: true }).check()
  await planned.getByRole('button', { name: '保存', exact: true }).click()
  await expect(planned).not.toBeVisible()
  await openCatch(page)
  await selectCatalog(page)
  await catchDialog(page).getByLabel('使用タックル', { exact: true }).selectOption({ label: 'クランク用①' })
  await saveCatch(page)
  const first = (await readState(page)).catches[0]
  expect(first.tackleSnapshot.mainLine.strengthLb).toBe(3)
  expect(first.tackleSnapshot.rod.modelCode).toBe('QFRGS-48XUL')
  expect(first.tackleSnapshot.reel.modelName).toBe('ヴァンキッシュ')

  await home(page)
  await page.getByRole('button', { name: 'タックル管理', exact: true }).click()
  await page.getByRole('button', { name: 'リール', exact: true }).click()
  const reel = page.getByRole('article').filter({ hasText: 'ヴァンキッシュ' })
  await reel.getByRole('button', { name: '編集', exact: true }).click()
  await page.getByRole('combobox', { name: '現在のメインライン（任意）', exact: true }).selectOption({ label: 'ナイロン / 3.5lb' })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(reel).toContainText('現在のメインライン：ナイロン / 3.5lb')
  expect((await readState(page)).catches[0]).toEqual(first)
  await page.getByRole('button', { name: '← 戻る', exact: true }).click()
  await page.getByRole('button', { name: /E2Eニレ池/ }).click()
  await openCatch(page)
  const setId = (await readState(page)).tackleSets[0].id
  await expect(catchDialog(page).getByLabel('使用タックル', { exact: true })).toHaveValue(String(setId))
  await catchDialog(page).getByRole('button', { name: '前回と同じ' }).click()
  await expect(catchDialog(page)).not.toBeVisible()
  let data = await readState(page)
  expect(data.catches[0]).toEqual(first)
  expect(data.catches[1].tackleSnapshot.mainLine.strengthLb).toBe(3.5)
  expect(data.catches[1].tackleSetId).toBe(setId)

  await openCatch(page)
  await selectCatalog(page)
  await catchDialog(page).getByLabel('使用タックル', { exact: true }).selectOption('')
  await saveCatch(page)
  data = await readState(page)
  expect(data.catches).toHaveLength(3)
  expect(data.catches[2]).not.toHaveProperty('tackleSnapshot')
  expect(data.catches[2]).not.toHaveProperty('tackleSetId')
  expect(data.myLures.filter(row => row.ownershipStatus === 'owned')).toHaveLength(1)
  await showLineHistory(page)
  return data
}

async function showLineHistory(page: Page) {
  const history = page.getByRole('region', { name: '釣果履歴' })
  const summaries = history.locator('summary')
  await expect(summaries).toHaveCount(2)
  await summaries.nth(0).click()
  await summaries.nth(1).click()
  await expect(history.getByRole('paragraph').filter({ hasText: /メインライン：\s*ナイロン\s+3\.5lb\b/ })).toBeVisible()
  await expect(history.getByRole('paragraph').filter({ hasText: /メインライン：\s*ナイロン\s+3lb\b/ })).toBeVisible()
}

test('B: 初期候補・重複防止・セット・持参変更・巻き替え後も過去構成不変・未指定', async ({ page }) => {
  await prepareTackleHistory(page)
})

test('C: v4全12テーブルをダウンロードし、別Contextへ復元して件数と3lb/3.5lb履歴を維持', async ({ page, browser }, testInfo) => {
  const source = await prepareTackleHistory(page)
  await home(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^fishing-log-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const path = testInfo.outputPath('synthetic-v4-backup.json')
  await download.saveAs(path)
  const backup = JSON.parse(await readFile(path, 'utf8'))
  expect(backup.format).toBe('fishing-log-backup')
  expect(backup.version).toBe(4)
  expect(Object.keys(backup.data).sort()).toEqual([...tableNames].sort())
  expect(backup.data).toEqual(source)
  const set = backup.data.tackleSets[0]
  expect(backup.data.trips[0].tackleSetIds).toEqual([set.id])
  expect(backup.data.rods.some((row: { id: number }) => row.id === set.rodId)).toBe(true)
  expect(backup.data.reels.some((row: { id: number }) => row.id === set.reelId)).toBe(true)
  expect(backup.data.catches[0].tackleSnapshot.mainLine.strengthLb).toBe(3)
  expect(backup.data.catches[1].tackleSnapshot.mainLine.strengthLb).toBe(3.5)

  const context = await browser.newContext({ viewport: page.viewportSize()!,
    isMobile: !!testInfo.project.use.isMobile, hasTouch: !!testInfo.project.use.hasTouch,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' })
  try {
    const restored = await context.newPage()
    const errors: string[] = []
    restored.on('pageerror', error => errors.push(error.message))
    await restored.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4177' ? route.continue() : route.abort())
    await restored.goto('http://127.0.0.1:4177')
    await expect(restored.getByRole('heading', { name: '🎣 Fishing Log', exact: true })).toBeVisible()
    expect(Object.values(await readState(restored)).every(rows => rows.length === 0)).toBe(true)
    await restoreViaUI(restored, backup)
    expect(await readState(restored)).toEqual(source)
    await restored.getByRole('button', { name: /E2Eニレ池/ }).click()
    await expect(restored.getByRole('region', { name: '釣果履歴' })).toContainText('3匹目')
    await showLineHistory(restored)
    await home(restored)
    await restored.getByRole('button', { name: '🎣 マイルアー', exact: true }).click()
    const owned = restored.getByRole('region', { name: '所有ルアー' })
    await expect(owned.getByRole('article')).toHaveCount(1)
    await expect(owned).toContainText('🎣 3匹')
    expect(await readState(page)).toEqual(source) // 復元元コンテキストも変化しない。
    expect(errors, '復元先の未処理ブラウザ例外').toEqual([])
  } finally { await context.close() }
})

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '意図しない横スクロール').toBe(true)
}
async function buttonInViewport(page: Page, button: Locator) {
  await button.scrollIntoViewIfNeeded()
  const box = await button.boundingBox()
  expect(box).not.toBeNull()
  const viewport = page.viewportSize()!
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box!.y).toBeGreaterThanOrEqual(-1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
}

test('D: ホーム・タックル・選択モーダルの横幅と保存ボタン、縦スクロール操作', async ({ page }, testInfo) => {
  await noHorizontalOverflow(page)
  await buttonInViewport(page, page.getByRole('button', { name: '新しい釣行を開始' }))
  await restoreViaUI(page, catalogFixture())
  await registerTackleSet(page)
  await page.getByRole('button', { name: 'タックル管理', exact: true }).click()
  await page.getByRole('button', { name: 'セット', exact: true }).click()
  await noHorizontalOverflow(page)
  await buttonInViewport(page, page.getByRole('button', { name: '保存', exact: true }))
  await page.getByRole('button', { name: '← 戻る', exact: true }).click()
  await startTrip(page, 'クランク用①')
  await noHorizontalOverflow(page)
  await openCatch(page)
  await catchDialog(page).getByRole('button', { name: 'ルアーを選ぶ' }).click()
  const picker = page.getByRole('dialog', { name: 'ルアーを選択', exact: true })
  await noHorizontalOverflow(page)
  await buttonInViewport(page, picker.getByRole('button', { name: 'カタログ', exact: true }))
  await picker.getByLabel('モデルを選んでからカラーを選択').selectOption('30')
  await picker.getByRole('button', { name: 'E2Eスプーン 赤 E2Eメーカー ・ E2Eシリーズ', exact: true }).click()
  await noHorizontalOverflow(page)
  if (testInfo.project.use.isMobile) {
    expect(await catchDialog(page).evaluate(element => element.scrollHeight > element.clientHeight), 'モバイルの長いモーダルに縦スクロール').toBe(true)
  }
  await buttonInViewport(page, catchDialog(page).getByRole('button', { name: '保存する', exact: true }))
  await saveCatch(page)
  expect((await readState(page)).catches).toHaveLength(1)
})

test('不正なv4復元は既存のテストDBを保持する', async ({ page }) => {
  await restoreViaUI(page, catalogFixture())
  await registerTackleSet(page)
  const before = await readState(page)
  const invalid = { format: 'fishing-log-backup', version: 4, exportedAt: '2026-10-10T00:00:00Z', data: structuredClone(before) }
  invalid.data.tackleSets[0].rodId = 99999
  await restoreViaUI(page, invalid, 'rods のID 99999 がありません')
  expect(await readState(page)).toEqual(before)
})
