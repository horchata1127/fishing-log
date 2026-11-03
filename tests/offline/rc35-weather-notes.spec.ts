import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc30Fixture } from '../rc30Fixture'

test('RC35 installed PWA records notes/weather offline and retains them after offline restart and backup', async ({}, info) => {
  const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc35-offline-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow', viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
    const restored = new Promise<void>((resolve, reject) => {
      page.on('dialog', async d => {
        try { await d.accept(); if (d.message().includes('バックアップから復元したで')) resolve() }
        catch (e) { reject(e) }
      })
    })
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-rc35.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc30Fixture())) })
    await restored
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
    const memo = page.getByRole('region', { name: '釣行メモ', exact: true })
    await memo.getByRole('textbox').fill('圏外の振り返り\n流れが強かった')
    await memo.getByRole('button', { name: '釣行メモを保存' }).click()
    await expect(memo.getByRole('status')).toHaveText('保存済み')
    await page.getByRole('button', { name: '気象を記録', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'イベント追加', exact: true })
    await editor.getByLabel('発生日時（日本時間）').fill('2026-10-24T10:30')
    await editor.getByRole('button', { name: '🌥️ 日が陰った', exact: true }).click()
    await editor.getByRole('button', { name: '🌬️ 風が強まった', exact: true }).click()
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
    await expect(page.getByRole('region', { name: '釣行メモ', exact: true }).getByRole('textbox')).toHaveValue('圏外の振り返り\n流れが強かった')
    await expect(page.locator('.timeline-marker.weather')).toHaveCount(1)
    await expect(page.getByRole('region', { name: '釣果グラフの気象イベント', exact: true }).getByRole('button')).toHaveCount(1)
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('rc35-offline-v10.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8'))
    expect(backup.version).toBe(10)
    expect(backup.data.trips[0].memo).toBe('圏外の振り返り\n流れが強かった')
    expect(backup.data.tripEvents[0].weatherObservation.changes).toEqual(['sunHidden', 'windStronger'])
    expect(backup.data.catches).toHaveLength(2)
  } finally { await context.close() }
})
