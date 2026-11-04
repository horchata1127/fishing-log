import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc39Fixture } from '../rc39Fixture'
import { timelineState } from '../timelineFixture'
import { weatherTripId } from '../weatherFixture'
import { origin, url, offlineReady } from './masterCatalogRegression'

test('first timeline PNG generation after cold PWA restart works offline, keeps all data and can download/share fallback', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc39-offline-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url); await offlineReady(page)
    const restored = new Promise<void>((resolve, reject) => {
      page.on('dialog', async d => {
        try { await d.accept(); if (d.message().includes('バックアップから復元したで')) resolve() }
        catch (e) { reject(e) }
      })
    })
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-rc39.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc39Fixture())) })
    await restored
    const before = await timelineState(page)
    // First use of the renderer is offline, after all online contexts are closed.
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.locator(`.trip-row[data-trip-id="${weatherTripId}"]`).click()
    const panel = page.getByRole('region', { name: 'タイムライン画像出力', exact: true })
    await panel.locator('summary').click()
    await panel.getByRole('button', { name: 'タイムライン画像プレビューを作成', exact: true }).click()
    await expect(panel.getByRole('img', { name: 'タイムラインPNGのプレビュー', exact: true })).toBeVisible()
    const card = page.locator('[data-timeline-image-card]')
    await expect(card.locator('.image-temperature-line')).toHaveCount(2)
    await expect(card.locator('.image-marker')).toHaveCount(11)
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'タイムライン画像を保存', exact: true }).click()])
    const path = info.outputPath('rc39-offline-timeline.png'); await download.saveAs(path)
    const png = await readFile(path)
    expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(1600)
    expect(await timelineState(page)).toEqual(before)
    await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }) })
    const [fallback] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'タイムライン画像を共有', exact: true }).click()])
    expect(fallback.suggestedFilename()).toBe(download.suggestedFilename())
    await page.reload()
    expect(await timelineState(page)).toEqual(before)
  } finally { await context.close() }
})
