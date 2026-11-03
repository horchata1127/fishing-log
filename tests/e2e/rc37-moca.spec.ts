import { readFile } from 'node:fs/promises'
import { test, expect, restoreViaUI, readAllState } from './fixtures'
import { rc37Fixture } from '../rc37Fixture'
import { checkMaster, applyMaster, masterHome } from '../masterUiHelpers'

test('MOCA audited IDs, ambiguous rattle, provisional MVP, repeat and v11 restore through UI', async ({ page }, info) => {
  test.setTimeout(90000)
  await restoreViaUI(page, rc37Fixture()); const before = await readAllState(page)
  const preview = await checkMaster(page)
  const [csv] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: '差分予定をCSVで保存', exact: true }).click()])
  const csvPath = info.outputPath('moca-plan.csv'); await csv.saveAs(csvPath)
  const csvText = await readFile(csvPath, 'utf8'); expect(csvText).toContain('RC37'); expect(csvText).toContain('F/SS未確認')
  expect(await readAllState(page)).toEqual(before)
  await applyMaster(page); const saved = await readAllState(page)
  for (const [table, rows] of Object.entries(before)) {
    expect(saved[table]).toEqual(expect.arrayContaining(rows))
    if (!['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'lureVisualProfiles', 'lureMasterImportHistory'].includes(table)) expect(saved[table]).toEqual(rows)
  }
  expect(saved.lureVariants!.filter(v => v.catalogEvidence?.revision === 'RC37')).toHaveLength(180)
  expect(saved.lureModels!.find(m => m.id === 128)!.name).toBe('MOCA DR Rattle 2HOOK')
  expect(saved.lureModels!.some(m => m.name === 'MOCA DR-F Rattle 2HOOK')).toBe(false)
  expect(saved.trips![0]!.summaryMvp.provisional).toBe(true)
  await checkMaster(page); const result = await applyMaster(page)
  for (const row of await result.locator('tbody tr').all()) expect(await row.locator('td').first().textContent()).toBe('0')
  await masterHome(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
  const path = info.outputPath('moca-v11.json'); await download.saveAs(path)
  const backup = JSON.parse(await readFile(path, 'utf8')); expect(backup.version).toBe(11)
  await restoreViaUI(page, backup); await page.reload()
  const restored = await readAllState(page)
  for (const [table, rows] of Object.entries(saved)) if (table !== 'lureMasterImportHistory') expect(restored[table]).toEqual(rows)
  await page.locator('.trip-row[data-trip-id="1"]').click()
  await expect(page.getByRole('region', { name: '釣行サマリー', exact: true })).toContainText('ミルクココア（暫定）')
})
