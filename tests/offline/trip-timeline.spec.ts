import { test, expect, chromium } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { timelineScenario, timelineState } from '../timelineFixture'
import { weatherTripName } from '../weatherFixture'

test('cached timeline and explicit same-facility location reuse work after full offline profile restart', async ({}, info) => {
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
    let calls = 0; page.on('request', r => { if (r.url().includes('open-meteo')) calls++ })
    await page.goto(url)
    await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
    const graph = page.getByRole('region', { name: '統合タイムライン', exact: true })
    await expect(graph.locator('.timeline-marker.catch')).toHaveCount(7); await expect(graph.locator('.temperature-line')).toHaveCount(1)
    await expect(graph.locator('.catch-summary')).toContainText('総釣果：7匹')
    await expect(graph.locator('.catch-summary')).toContainText('平均釣果ペース：0.75匹/時')
    expect(await graph.locator('.hour-bar').evaluateAll(elements => elements.map(e => Number((e as HTMLElement).dataset.count)))).toEqual([1,0,0,0,1,1,0,1,2,1])
    await graph.getByRole('button', { name: '2026-10-17 14時台：2匹', exact: true }).click()
    await expect(graph.getByRole('status')).toHaveText('2026-10-17 14時台：2匹')
    await graph.getByRole('button', { name: '釣果 2026/10/17 10:13', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('9号池'); await page.getByRole('button', { name: '記録の詳細を閉じる' }).click()
    await expect(graph.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toBeVisible()
    expect(await timelineState(page)).toEqual(before)
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    await page.getByRole('button', { name: /同一施設の地点再利用テスト/ }).click()
    const panel = page.getByRole('region', { name: '気象データ', exact: true }); await panel.locator('summary').click()
    await panel.getByLabel('以前の地点候補').selectOption('95000'); expect(await timelineState(page)).toEqual(before)
    await panel.getByRole('button', { name: '選択した地点をこの釣行に保存' }).click()
    await expect(panel.getByLabel('緯度', { exact: true })).toHaveValue('36.611')
    const saved = await timelineState(page)
    for (const name of Object.keys(before)) if (name !== 'tripWeatherLocations') expect(saved[name]).toEqual(before[name])
    expect(saved.tripWeatherLocations!.filter(l => l.tripId !== 96000)).toEqual(before.tripWeatherLocations)
    expect(calls).toBe(0)
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    expect(await timelineState(page)).toEqual(saved)
    await page.getByRole('button', { name: /同一施設の地点再利用テスト/ }).click()
    await page.getByRole('region', { name: '気象データ', exact: true }).locator('summary').click()
    await expect(page.getByLabel('緯度', { exact: true })).toHaveValue('36.611')
    await expect(page.getByLabel('以前の地点候補')).toHaveCount(0)
  } finally { await context.close() }
})
