import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('RC32の仮配色を圏外で保存し、PWA終了後も編集・v8出力できる', async ({}, info) => {
  const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc32-offline-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
    await context.setOffline(true)
    await page.getByRole('button', { name: '新しい釣行を開始' }).click()
    await page.getByLabel('釣り場', { exact: true }).fill('RC32圏外テスト池')
    await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
    const editor = modal.getByRole('region', { name: 'ビジュアルカラー入力' })
    await editor.getByRole('button', { name: 'レッド', exact: true }).click()
    await editor.getByRole('button', { name: 'ゴールド', exact: true }).click()
    await editor.getByText('模様・特殊属性・部位設定', { exact: true }).click()
    await editor.getByLabel('模様', { exact: true }).selectOption('gradient')
    await editor.getByRole('button', { name: 'グロー', exact: true }).click()
    await modal.getByRole('button', { name: '保存する', exact: true }).click()
    await expect(modal).not.toBeVisible()
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /RC32圏外テスト池/ }).click()
    const history = page.getByRole('region', { name: '釣果履歴' })
    await expect(history.locator('g[data-region="whole"]')).toHaveAttribute('data-pattern', 'gradient')
    await history.getByRole('button', { name: '編集', exact: true }).click()
    const editing = page.getByRole('dialog', { name: '釣果を編集', exact: true })
    await expect(editing.getByRole('button', { name: 'レッド', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await editing.getByLabel('メモ（任意）').fill('圏外で配色を保持して編集')
    await editing.getByRole('button', { name: '保存する', exact: true }).click()
    await expect(editing).not.toBeVisible()
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('synthetic-rc32-offline-v8.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8'))
    expect(backup.version).toBe(8)
    expect(backup.data.myLures).toEqual([])
    expect(backup.data.catches[0].visualColorSnapshot.appearance.regions.whole).toEqual({ colors: ['red', 'gold'], attributes: ['glow'], pattern: 'gradient' })
  } finally { await context.close() }
})
