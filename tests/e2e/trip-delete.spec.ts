import type { Page } from '@playwright/test'
import { test, expect, catalogFixture, readState, restoreViaUI } from './fixtures'

function fixture() {
  const { data } = catalogFixture()
  data.myLures[0]!.ownershipStatus = 'owned'
  const rod = { id: 1, manufacturer: 'Test rod', modelName: 'Rod', active: true }
  const line = { id: 2, material: 'ナイロン', strengthLb: 3.5, active: true }
  const reel = { id: 3, manufacturer: 'Test reel', modelName: 'Reel', mainLineId: 2, active: true }
  data.rods = [rod]; data.lines = [line]; data.reels = [reel]
  data.tackleSets = [{ id: 4, name: '保存するセット', rodId: 1, reelId: 3, active: true }]
  data.fishSpecies = [{ fish_id: 'user:test', display_name: 'テスト魚種', group: 'ニジマス', aliases: '', region: '',
    lineage_or_type: '', source_status: '', notes: '', source_url: '', active: true, origin: 'user' }]
  data.trips = [
    { id: 60, fishingAreaName: '削除対象A', fishingDate: '2026-10-10', fishingStyle: 'AREA_TROUT', startedAt: '2026-10-10T00:00:00Z', tackleSetIds: [4] },
    { id: 61, fishingAreaName: '保持対象B', fishingDate: '2026-10-10', fishingStyle: 'AREA_TROUT', startedAt: '2026-10-10T00:00:00Z', endedAt: '2026-10-10T03:00:00Z', tackleSetIds: [4] },
    { id: 62, fishingAreaName: '釣果ゼロの釣行・長い釣り場名'.repeat(5), fishingDate: '2026-10-11', fishingStyle: 'AREA_TROUT', startedAt: '2026-10-11T00:00:00Z' },
  ]
  data.catches = [60, 60, 61].map((tripId, index) => ({ id: 70 + index, tripId, caughtAt: '2026-10-10T01:00:00Z',
    lureId: 50, lureVariantId: 40, lureName: 'E2Eスプーン', lureColor: '赤', fishSpeciesId: 'user:test', fishSpecies: 'テスト魚種',
    fishSpeciesGroup: 'ニジマス', fishSizeCm: 30, tackleSetId: 4,
    tackleSnapshot: { version: 1, setId: 4, setName: '保存するセット', rod, reel, mainLine: line } }))
  data.tripEvents = [60, 61].map((tripId, index) => ({ id: 80 + index, tripId, type: 'stocking', occurredAt: '2026-10-10T01:00:00Z' }))
  return { format: 'fishing-log-backup', version: 5, exportedAt: '2026-10-11T00:00:00Z', data }
}

async function openDeletion(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name }).click()
  const button = page.getByRole('button', { name: 'この釣行を削除', exact: true })
  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeInViewport()
  await button.click()
  const dialog = page.getByRole('dialog', { name: '釣行を削除しますか？', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function ownedCount(page: Page, count: number) {
  await page.getByRole('button', { name: '🎣 マイルアー', exact: true }).click()
  const owned = page.getByRole('region', { name: '所有ルアー' })
  await expect(owned.getByRole('article')).toHaveCount(1)
  await expect(owned).toContainText(`🎣 ${count}匹`)
  await page.getByRole('button', { name: '← 戻る', exact: true }).click()
}

test('Aだけ削除・キャンセル・二重タップ・集計3→1・Bと全マスターを保持', async ({ page }) => {
  await restoreViaUI(page, fixture())
  const before = await readState(page)
  await ownedCount(page, 3)
  let dialog = await openDeletion(page, /削除対象A/)
  await expect(dialog).toContainText('削除対象A')
  await expect(dialog).toContainText('2026/10/10')
  await expect(dialog).toContainText('2件')
  await expect(dialog).toContainText('釣行中')
  await expect(dialog).toContainText('元に戻せません')
  await expect(dialog.getByRole('button', { name: 'キャンセル', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(await readState(page)).toEqual(before)
  await page.getByRole('button', { name: 'この釣行を削除', exact: true }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(await readState(page)).toEqual(before)
  await page.getByRole('button', { name: '← ホーム', exact: true }).click()
  await ownedCount(page, 3)
  dialog = await openDeletion(page, /削除対象A/)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.delete
    const monitor = window as unknown as { tripDeleteCalls: number }
    monitor.tripDeleteCalls = 0
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'trips') monitor.tripDeleteCalls++
      return original.call(this, key)
    }
  })
  await dialog.getByRole('button', { name: 'この釣行と関連記録を削除する', exact: true }).evaluate(element => {
    (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click()
  })
  await expect(page.getByRole('heading', { name: '🎣 Fishing Log', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('削除しました')
  expect(await page.evaluate(() => (window as unknown as { tripDeleteCalls: number }).tripDeleteCalls)).toBe(1)
  const expected = structuredClone(before)
  expected.trips = expected.trips.filter(row => row.id !== 60)
  expected.catches = expected.catches.filter(row => row.tripId !== 60)
  expected.tripEvents = expected.tripEvents.filter(row => row.tripId !== 60)
  expect(await readState(page)).toEqual(expected)
  await expect(page.getByRole('button', { name: /削除対象A/ })).toHaveCount(0)
  await ownedCount(page, 1)
  await page.getByRole('button', { name: /保持対象B/ }).click()
  await expect(page.getByRole('region', { name: '釣果履歴' })).toContainText('テスト魚種')
  await expect(page.getByRole('region', { name: '釣果履歴' })).toContainText('保存するセット')
  await page.reload()
  expect(await readState(page)).toEqual(expected)
  await ownedCount(page, 1)
})

test('釣果0件の釣行を削除・長い名前の確認UIがモバイルに収まる', async ({ page }, testInfo) => {
  await restoreViaUI(page, fixture())
  const before = await readState(page)
  const dialog = await openDeletion(page, /釣果ゼロの釣行/)
  await expect(dialog).toContainText('0件')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  const confirm = dialog.getByRole('button', { name: 'この釣行と関連記録を削除する', exact: true })
  await confirm.scrollIntoViewIfNeeded()
  await expect(confirm).toBeInViewport()
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('trip-delete-confirmation.png') })
  await confirm.click()
  await expect(dialog).not.toBeVisible()
  before.trips = before.trips.filter(row => row.id !== 62)
  expect(await readState(page)).toEqual(before)
  await page.reload()
  expect(await readState(page)).toEqual(before)
})

test('最終の釣行削除を失敗させると釣果・イベントも戻り、成功表示にならない', async ({ page }) => {
  await restoreViaUI(page, fixture())
  const before = await readState(page)
  const dialog = await openDeletion(page, /削除対象A/)
  // Failure injection is confined to this independent E2E context and origin.
  await page.evaluate(() => {
    if (location.origin !== 'http://127.0.0.1:4177') throw new Error('E2E専用origin以外は禁止')
    const original = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'trips') throw new DOMException('テスト用DB障害', 'UnknownError')
      return original.call(this, key)
    }
  })
  await dialog.getByRole('button', { name: 'この釣行と関連記録を削除する', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('削除できませんでした')
  await expect(dialog.getByRole('alert')).toContainText('テスト用DB障害')
  expect(await readState(page)).toEqual(before)
  await expect(page.getByRole('status')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page.getByRole('heading', { name: '削除対象A', exact: true })).toBeVisible()
  await page.reload()
  expect(await readState(page)).toEqual(before)
})
