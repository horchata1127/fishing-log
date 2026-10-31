import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc30Fixture } from '../rc30Fixture'

test('名称推定を圏外で一括取り込みし、再起動後の逆引きとv8出力を保持する', async ({}, info) => {
  const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc32-auto-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  const source = rc30Fixture(); source.data.lureVariants[0]!.colorName = '赤金'
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
    const restored = new Promise<void>(resolve => { page.on('dialog', async d => { await d.accept(); if (d.message().includes('バックアップから復元したで')) resolve() }) })
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-auto-v7.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) })
    await restored
    await context.setOffline(true)
    await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
    const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
    await dictionary.getByText('推定配色を一括取り込み（管理）', { exact: true }).click()
    await dictionary.getByRole('button', { name: '推定件数を確認', exact: true }).click()
    await expect(dictionary.getByRole('region', { name: '推定配色の事前確認' })).toContainText('新規追加 1件')
    await dictionary.getByRole('button', { name: '確認した推定配色を取り込む', exact: true }).click()
    await expect(dictionary.locator('article[data-variant-id="386"]')).toContainText('名称推定・未確認')
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
    const reopened = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
    await reopened.getByText('色から検索（0色）', { exact: true }).click()
    await reopened.getByRole('button', { name: 'レッド', exact: true }).click()
    await expect(reopened.locator('article[data-variant-id]')).toHaveCount(1)
    await expect(reopened.getByRole('img', { name: '配色プレビュー' })).toBeVisible()
    await reopened.getByText('推定配色を一括取り込み（管理）', { exact: true }).click()
    await reopened.getByRole('button', { name: '推定件数を確認', exact: true }).click()
    await expect(reopened.getByRole('region', { name: '推定配色の事前確認' })).toContainText('新規追加 0件・既存保持 1件')
    await reopened.getByRole('button', { name: '辞書を閉じる', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('synthetic-auto-offline-v8.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8'))
    expect(backup.version).toBe(8); expect(backup.data.lureVisualProfiles).toHaveLength(1)
    expect(backup.data.myLures).toEqual(source.data.myLures)
    expect(backup.data.catches).toEqual(source.data.catches.map(c => ({ ...c, caughtAt: new Date(c.caughtAt).toISOString() })))
    expect(backup.data.lureVisualProfiles[0]).toMatchObject({ origin: 'name', userEdited: false, confirmed: false, evidence: { estimatorVersion: 'rc32-name-v1' } })
  } finally { await context.close() }
})
