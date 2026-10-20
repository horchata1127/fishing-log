import { test, expect, restoreViaUI, startTrip } from './fixtures'
import { timelineScenario, timelineState } from '../timelineFixture'
import { editEndedTrip } from '../tripEditingFixture'
import { readFile } from 'node:fs/promises'

for (const time of ['00:00', '06:00', '09:00', '23:59']) {
  test(`RC29 new trip uses JST calendar at ${time}`, async ({ page }) => {
    await page.clock.setFixedTime( new Date(`2026-10-12T${time}:00+09:00`))
    await startTrip(page)
    const state = await timelineState(page)
    expect(state.trips![0]!.fishingDate).toBe('2026-10-12')
    expect(state.trips![0]!.startedAt).toBe(new Date(`2026-10-12T${time}:00+09:00`).toISOString())
    await expect(page.getByRole('button', { name: '釣行情報を編集', exact: true })).toHaveCount(0)
  })
}
test('RC29 ended edit cancellation, only reviewed fields update, reload and v7 restore', async ({ page }, info) => {
  await restoreViaUI(page, timelineScenario())
  const after = await editEndedTrip(page)
  await page.reload()
  expect(await timelineState(page)).toEqual(after)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
  const path = info.outputPath('rc29-v7.json'); await download.saveAs(path)
  const backup = JSON.parse(await readFile(path, 'utf8'))
  expect(backup.version).toBe(7)
  await restoreViaUI(page, backup)
  expect(await timelineState(page)).toEqual(after)
})


test('RC29 legacy free-text trip and cross-midnight timestamps remain independent of calendar edits', async ({ page }) => {
  const backup = timelineScenario()
  backup.data.trips!.push({ id: 99000, fishingAreaName: '巾着田', fishingDate: '2026-10-11', fishingStyle: 'CHUBBING',
    startedAt: '2026-10-12T14:59:00.000Z', endedAt: '2026-10-12T16:00:00.000Z', memo: '夜釣り', temperatureC: 15 })
  await restoreViaUI(page, backup)
  const before = await timelineState(page)
  await page.getByRole('button', { name: /^巾着田 / }).click()
  await page.getByRole('button', { name: '釣行情報を編集', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '釣行情報を編集', exact: true })
  await dialog.getByLabel('釣行日', { exact: true }).fill('2026-10-12')
  await dialog.getByLabel('釣り場', { exact: true }).fill('巾着田（編集済み）')
  await dialog.getByRole('button', { name: '変更内容を確認', exact: true }).click()
  await dialog.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const after = await timelineState(page)
  expect(after).toEqual({ ...before, trips: before.trips!.map(t => t.id === 99000 ? { ...t, fishingDate: '2026-10-12', fishingAreaName: '巾着田（編集済み）' } : t) })
})

test('RC29 stale draft cannot overwrite a concurrent trip update', async ({ page }) => {
  await restoreViaUI(page, timelineScenario())
  await page.getByRole('button', { name: /日本イワナセンター（RC25/ }).click()
  await page.getByRole('button', { name: '釣行情報を編集', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '釣行情報を編集', exact: true })
  await dialog.getByLabel('釣行日', { exact: true }).fill('2026-10-17')
  await dialog.getByRole('button', { name: '変更内容を確認', exact: true }).click()
  await page.evaluate(async () => {
    const path = '/fishing-log/src/db/database.ts', { db } = await import(path)
    await db.trips.update(95000, { memo: '他画面の変更' })
  })
  const concurrent = await timelineState(page)
  await dialog.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('釣行が変更されました')
  expect(await timelineState(page)).toEqual(concurrent)
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
})
