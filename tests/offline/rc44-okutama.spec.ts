import { test, expect, chromium } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc44Fixture } from '../rc44Fixture'
import { rc44State, recordOkutamaTrip } from '../rc44UiHelpers'
import { origin, url, offlineReady } from './masterCatalogRegression'

test('RC44 bundled master and old v10 restore survive offline cold restart, zone change and catch save/edit', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc44-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!; await page.goto(url); await offlineReady(page)
    const initial = await rc44State(page)
    expect(initial.facilities).toHaveLength(51); expect(initial.zones).toHaveLength(78)
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-v10.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc44Fixture())) })
    await expect.poll(async () => (await rc44State(page)).facilities!.length).toBe(52)
    const before = await rc44State(page)
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    expect(await rc44State(page)).toEqual(before)
    const saved = await recordOkutamaTrip(page)
    for (const [table, rows] of Object.entries(before)) {
      if (['trips', 'catches'].includes(table)) expect(saved[table]).toEqual(expect.arrayContaining(rows))
      else expect(saved[table]).toEqual(rows)
    }
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    expect(await rc44State(page)).toEqual(saved)
  } finally { await context.close() }
})
