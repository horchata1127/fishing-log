import { test, expect, chromium } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc42Fixture } from '../rc42Fixture'
import { checkRc42Dictionary, checkRc42Selectors } from '../rc42UiHelpers'
import { origin, url, offlineReady, offlineState } from './masterCatalogRegression'

test('RC42 all official colors survive offline cold restart and remain available in all selectors', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc42-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 402, height: 874 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile })
  let context = await launch()
  try {
    let page = context.pages()[0]!; await page.goto(url); await offlineReady(page)
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc42Fixture())) })
    await expect.poll(async () => (await offlineState(page)).lureVariants!.length).toBe(91)
    const before = await offlineState(page)
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    await checkRc42Dictionary(page); await checkRc42Selectors(page)
    expect(await offlineState(page)).toEqual(before)
  } finally { await context.close() }
})
