import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc30Fixture } from '../rc30Fixture'

test('RC36 first PNG generation works offline after PWA restart, MVP persists and exports as v11', async ({}, info) => {
  const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc36-offline-')), mobile = info.project.name.includes('mobile')
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
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-rc36.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc30Fixture())) })
    await restored
    // No image has been generated online: the renderer must come from SW precache.
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
    let panel = page.getByRole('region', { name: '釣行サマリー', exact: true })
    await panel.getByText('MVPを指定・編集', { exact: true }).click()
    await panel.getByLabel('MVPルアー名', { exact: true }).fill('圏外のMVP')
    await panel.getByLabel('MVPカラー', { exact: true }).fill('暫定カラー')
    await panel.getByLabel('カラーは暫定').check()
    await panel.getByRole('button', { name: 'MVPを保存', exact: true }).click()
    await expect(panel.getByRole('status')).toHaveText('MVPを保存しました')
    await panel.getByText('サマリー画像・共有', { exact: true }).click()
    await panel.getByRole('button', { name: '画像プレビューを作成', exact: true }).click()
    await expect(panel.getByRole('img')).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'サマリー画像を保存', exact: true }).click()])
    const path = info.outputPath('rc36-offline.png'); await download.saveAs(path)
    const png = await readFile(path)
    expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBe(1350)
    expect(png.length).toBeGreaterThan(20000)
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
    panel = page.getByRole('region', { name: '釣行サマリー', exact: true })
    await expect(panel.locator('.mvp-display')).toContainText('圏外のMVP')
    await expect(panel.locator('.mvp-display')).toContainText('暫定')
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    const [backupDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const backupPath = info.outputPath('rc36-offline-v11.json'); await backupDownload.saveAs(backupPath)
    const backup = JSON.parse(await readFile(backupPath, 'utf8'))
    expect(backup.version).toBe(11)
    expect(backup.data.trips[0].summaryMvp).toEqual({ name: '圏外のMVP', color: '暫定カラー', provisional: true })
    expect(backup.data.catches).toHaveLength(2)
  } finally { await context.close() }
})
