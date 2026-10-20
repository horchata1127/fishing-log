import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { timelineScenario, timelineState } from '../timelineFixture'
import { editEndedTrip } from '../tripEditingFixture'

test('RC29 ended trip editing persists offline across restart and v7 restore', async ({}, info) => {
  const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-timeline-offline-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow', viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url)
    await expect(page.getByText('準備を完了するにはホームで再読み込みしてください。', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-timeline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(timelineScenario())) })
    await expect(page.getByRole('button', { name: /同一施設の地点再利用テスト/ })).toBeVisible()
    const before = await timelineState(page)
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    const after = await editEndedTrip(page)
    expect(after.trips!.map(t => t.id)).toEqual(before.trips!.map(t => t.id))
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    expect(await timelineState(page)).toEqual(after)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('rc29-offline-v7.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8')); expect(backup.version).toBe(7)
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'rc29-offline-v7.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await expect(page.getByRole('button', { name: /同一施設の地点再利用テスト/ })).toBeVisible()
    expect(await timelineState(page)).toEqual(after)
  } finally { await context.close() }
})
