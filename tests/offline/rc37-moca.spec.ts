import { test, expect, chromium } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc37Fixture } from '../rc37Fixture'
import { checkMaster, applyMaster } from '../masterUiHelpers'
import { origin, url, offlineReady, offlineState } from './masterCatalogRegression'

test('MOCA supplementation applies offline and survives persistent cold restart without changing MVP or existing data', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc37-offline-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 402, height: 874 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile })
  let context = await launch()
  try {
    let page = context.pages()[0]!; await page.goto(url); await offlineReady(page)
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc37Fixture())) })
    await expect.poll(async () => (await offlineState(page)).lureVariants!.length).toBe(37)
    const before = await offlineState(page)
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    await checkMaster(page); await applyMaster(page)
    const saved = await offlineState(page)
    expect(saved.lureVariants!.filter(v => v.catalogEvidence?.revision === 'RC37')).toHaveLength(180)
    for (const [table, rows] of Object.entries(before)) {
      expect(saved[table]).toEqual(expect.arrayContaining(rows))
      if (!['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'lureVisualProfiles', 'lureMasterImportHistory'].includes(table)) expect(saved[table]).toEqual(rows)
    }
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    expect(await offlineState(page)).toEqual(saved)
    await checkMaster(page); const result = await applyMaster(page)
    for (const row of await result.locator('tbody tr').all()) expect(await row.locator('td').first().textContent()).toBe('0')
    expect((await offlineState(page)).trips).toEqual(before.trips)
  } finally { await context.close() }
})
