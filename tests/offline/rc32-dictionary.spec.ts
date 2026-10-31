import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc30Fixture } from '../rc30Fixture'

test('RC32辞書を圏外で紐付け、PWA再起動後に色検索・再利用・v8出力する', async ({}, info) => {
  const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc32-dictionary-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
    const restored = new Promise<void>(resolve => {
      page.on('dialog', async dialog => { await dialog.accept(); if (dialog.message().includes('バックアップから復元したで')) resolve() })
    })
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-dictionary.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc30Fixture())) })
    await restored
    await context.setOffline(true)
    await page.getByRole('button', { name: '新しい釣行を開始' }).click()
    await page.getByLabel('釣り場', { exact: true }).fill('RC32辞書圏外池')
    await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
    await modal.getByRole('region', { name: 'ビジュアルカラー入力' }).getByRole('button', { name: 'レッド', exact: true }).click()
    await modal.getByRole('button', { name: '保存する', exact: true }).click()
    await expect(modal).not.toBeVisible()
    await page.getByRole('button', { name: '公式カラーへ紐付け', exact: true }).click()
    const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
    await dictionary.locator('article[data-variant-id="386"]').getByRole('button', { name: 'この仮配色を紐付け', exact: true }).click()
    await expect(dictionary).not.toBeVisible()
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
    const reopened = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
    await reopened.getByText('色から検索（0色）', { exact: true }).click()
    await reopened.getByRole('button', { name: 'レッド', exact: true }).click()
    await expect(reopened.locator('article')).toHaveCount(1)
    await expect(reopened.locator('article[data-variant-id="386"]').getByRole('img', { name: '配色プレビュー' })).toBeVisible()
    await reopened.getByRole('button', { name: '辞書を閉じる', exact: true }).click()
    await page.getByRole('button', { name: /RC32辞書圏外池/ }).click()
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    const form = page.getByRole('dialog', { name: '釣果を登録', exact: true })
    await form.getByRole('button', { name: '色から探す・代表配色を編集', exact: true }).click()
    await reopened.locator('article').getByRole('button', { name: 'この公式カラーを選ぶ', exact: true }).click()
    await expect(form.getByRole('region', { name: 'ビジュアルカラー入力' }).getByRole('button', { name: 'レッド', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await form.getByRole('button', { name: 'キャンセル', exact: true }).click()
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('synthetic-rc32-dictionary-offline-v8.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8'))
    expect(backup.version).toBe(8)
    expect(backup.data.myLures).toEqual(rc30Fixture().data.myLures)
    expect(backup.data.lureVisualProfiles[0].variantId).toBe(386)
    expect(backup.data.catches.at(-1).visualColorSnapshot.appearance.regions.whole.colors).toEqual(['red'])
  } finally { await context.close() }
})
