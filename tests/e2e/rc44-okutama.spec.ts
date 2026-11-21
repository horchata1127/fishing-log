import { readFile } from 'node:fs/promises'
import { test, expect, restoreViaUI } from './fixtures'
import { rc44Fixture } from '../rc44Fixture'
import { rc44State, recordOkutamaTrip } from '../rc44UiHelpers'

test('RC44 v10 restore, official zone selection/change, catch edit and repeated backup restore preserve data', async ({ page }, info) => {
  await restoreViaUI(page, rc44Fixture())
  const before = await rc44State(page)
  expect(before.facilities).toHaveLength(52); expect(before.zones).toHaveLength(80)
  const saved = await recordOkutamaTrip(page)
  for (const [table, rows] of Object.entries(before)) {
    if (['trips', 'catches'].includes(table)) expect(saved[table]).toEqual(expect.arrayContaining(rows))
    else expect(saved[table]).toEqual(rows)
  }
  await page.getByRole('button', { name: '← ホーム', exact: true }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
  const path = info.outputPath('rc44-roundtrip.json'); await download.saveAs(path)
  const exported = JSON.parse(await readFile(path, 'utf8'))
  // Existing export chooses its minimal compatible version; no new backup format.
  expect([9,10]).toContain(exported.version)
  await restoreViaUI(page, exported); await restoreViaUI(page, exported)
  await page.reload(); await expect(page.getByRole('main')).not.toHaveAttribute('inert')
  const restored = await rc44State(page)
  for (const [table, rows] of Object.entries(saved)) {
    if (table === 'lureMasterImportHistory') { expect(restored[table]).toEqual(expect.arrayContaining(rows)); continue }
    expect(restored[table]).toEqual(rows)
  }
})
