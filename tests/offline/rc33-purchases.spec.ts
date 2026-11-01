import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc31Fixture } from '../rc31Fixture'

test('RC33 purchases and dictionary survive offline application and persistent PWA restart', async ({}, info) => {
  const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc33-offline-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
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
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-rc31.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc31Fixture())) })
    await restored
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: 'RC33 購入品・カラーの追加予定を確認', exact: true }).click()
    await page.getByRole('button', { name: 'RC33の確認済みデータを追加', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('61色・所有11個')
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: 'RC33 購入品・カラーの追加予定を確認', exact: true }).click()
    const preview = page.getByRole('region', { name: 'RC33取り込みの事前確認', exact: true })
    await expect(preview).toContainText('追加 0色・登録済み 61色・保留 0件')
    await preview.getByRole('button', { name: 'RC33の追加をキャンセル', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('synthetic-rc33-offline-v8.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8')); expect(backup.version).toBe(8)
    expect(backup.data.lureVariants).toHaveLength(2877)
    expect(backup.data.myLures.slice(0, 9)).toEqual(rc31Fixture().data.myLures)
    expect(backup.data.myLures).toHaveLength(20)
    expect(backup.data.lureVisualProfiles).toHaveLength(41)
    expect(backup.data.lureVisualProfiles.filter((p: any) => p.confirmed)).toHaveLength(29)
    expect(backup.data.tripEvents).toEqual(rc31Fixture().data.tripEvents)
  } finally { await context.close() }
})
