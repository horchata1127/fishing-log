import { test, expect, readState, restoreViaUI, saveCatch } from './fixtures'
import { stage6Candidate, stage6Backup } from '../stage6Fixture'

test('PR4 pending startup, approved static application, Iwana all nine choices and catch/lost snapshots persist', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const path = '/fishing-log/src/db/database.ts'
    return (await import(path)).db.facilities.count()
  })).toBe(0)
  // Simulate the separately approved static release in an isolated test origin.
  expect(await page.evaluate(async master => {
    const path = '/fishing-log/src/utils/facilityRelease.ts'
    return (await import(path)).initializeFacilityRelease({ status: 'approved', master })
  }, stage6Candidate)).toBeUndefined()
  await restoreViaUI(page, stage6Backup())
  const before = await readState(page)
  await page.getByRole('button', { name: '新しい釣行を開始' }).click()
  await page.getByLabel('施設を検索', { exact: true }).fill('イワナ')
  const facilities = page.getByLabel('管理釣り場', { exact: true })
  await expect(facilities).toContainText('日本イワナセンター（公式）')
  await expect(facilities).toContainText('日本イワナセンター（ユーザー登録）')
  await facilities.selectOption('official:nihon-iwana-center')
  const zones = page.getByLabel('エリア（任意）', { exact: true })
  await expect(zones.locator('option')).toHaveCount(10)
  for (const zone of stage6Candidate.facilities.find((f: any) => f.id === 'official:nihon-iwana-center').zones) {
    await zones.selectOption(zone.id); await expect(zones).toHaveValue(zone.id)
  }
  await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  await saveCatch(page)
  await page.getByRole('group', { name: '現在のエリア', exact: true }).getByLabel('現在のエリア', { exact: true }).selectOption('official:nihon-iwana-center:zero-2')
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
  await modal.getByRole('button', { name: 'バラシ', exact: true }).click()
  await modal.getByRole('button', { name: '沖', exact: true }).click()
  await saveCatch(page)
  const saved = await readState(page)
  expect(saved.catches.at(-2)!.locationSnapshot).toEqual({ facilityName: '日本イワナセンター', zoneName: '9号池' })
  expect(saved.catches.at(-1)!.locationSnapshot).toEqual({ facilityName: '日本イワナセンター', zoneName: 'ZERO号池第2' })
  expect(saved.catches.at(-1)!.resultType).toBe('lost')
  for (const row of before.catches) expect(saved.catches.find(r => r.id === row.id)).toEqual(row)
  for (const key of ['myLures', 'lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'tackleSets'] as const) expect(saved[key]).toEqual(before[key])
  await page.reload(); expect(await readState(page)).toEqual(saved)
})
