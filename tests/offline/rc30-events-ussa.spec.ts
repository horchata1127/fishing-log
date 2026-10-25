import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc30Fixture } from '../rc30Fixture'

test('RC30 PWA offline restart keeps event edits and additive USSA catalog', async ({}, info) => {
  const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc30-offline-')), mobile = info.project.name.includes('mobile')
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
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-rc30.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc30Fixture())) })
    await restored
    await expect(page.getByRole('button', { name: /白馬八方ニレ池/ })).toBeVisible()
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: 'RC30 USSAの追加予定を確認', exact: true }).click()
    await page.getByRole('button', { name: 'RC30の確認済みカタログを追加', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('140色追加')
    await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
    await page.getByRole('button', { name: 'イベント追加', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'イベント追加', exact: true })
    await editor.getByLabel('発生日時（日本時間）').fill('2026-10-24T10:30')
    await editor.getByLabel('メモ').fill('圏外で保存')
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
    await expect(page.locator('.event-entry')).toContainText('圏外で保存')
    await expect(page.locator('.event-entry')).toContainText('10:30')
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    await page.getByRole('button', { name: 'RC30 USSAの追加予定を確認', exact: true }).click()
    const preview = page.getByRole('region', { name: 'RC30カタログの事前確認', exact: true })
    await expect(preview).toContainText('追加 0色・登録済み 140色')
    await preview.getByRole('button', { name: 'RC30の追加をキャンセル', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('rc30-offline-v7.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8')); expect(backup.version).toBe(7)
    expect(backup.data.tripEvents).toHaveLength(1); expect(backup.data.lureVariants).toHaveLength(141)
    expect(backup.data.catches).toEqual(JSON.parse(JSON.stringify(rc30Fixture().data.catches)).map((c: Record<string, unknown>) => ({ ...c, caughtAt: new Date(c.caughtAt as string).toISOString() })))
  } finally { await context.close() }
})
