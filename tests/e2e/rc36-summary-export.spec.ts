import { test, expect, readAllState, restoreViaUI } from './fixtures'
import { rc30Fixture } from '../rc30Fixture'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

function fixture(count = 2) {
  const original = rc30Fixture()
  return { ...original, version: 10, data: { ...original.data,
    trips: original.data.trips.map(t => ({ ...t, memo: '朝はスプーンが好調。\n風と日陰を確認して次回へ。'.repeat(count > 2 ? 10 : 1) })),
    catches: count === 2 ? original.data.catches : Array.from({ length: count }, (_, i) => ({ id: i + 1, tripId: 13, caughtAt: '2026-10-24T01:30:00Z', lureName: `ルアー${i}・日本語とても長い名前`.repeat(8), lureColor: 'かるべね・カラー未確定'.repeat(8), ...(i % 5 === 0 ? { resultType: 'lost', lostDistance: 'near' } : {}) })),
    tripEvents: [{ id: 17, tripId: 13, type: 'weather', occurredAt: '2026-10-24T01:00:00Z', weatherObservation: { source: 'observed', sky: 'cloudy', wind: 'strong', changes: ['sunHidden', 'windStronger'] } }],
    lureVisualProfiles: [], temporaryLureColors: [], lureMasterImportHistory: [],
  } }
}

test('RC36 summary/MVP v11 backup, PNG matches preview, file sharing and RC35 coexist', async ({ page }, info) => {
  await restoreViaUI(page, fixture())
  await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
  const panel = page.getByRole('region', { name: '釣行サマリー', exact: true })
  await expect(panel).toContainText('釣果時速 0.1匹/時')
  await expect(panel).toContainText('反応時速 0.3回/時')
  await expect(panel).toContainText('自動候補')
  await panel.getByText('MVPを指定・編集', { exact: true }).click()
  await panel.getByLabel('MVPルアー名', { exact: true }).fill('モカDR-Fラトル')
  await panel.getByLabel('MVPカラー', { exact: true }).fill('特定カラー')
  await panel.getByLabel('カラーは暫定').check()
  await panel.getByRole('button', { name: 'MVPを保存', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('MVPを保存しました')
  await expect(panel.locator('.mvp-display')).toContainText('ユーザー指定')
  await expect(panel.locator('.mvp-display')).toContainText('暫定')
  await expect(page.getByRole('region', { name: '釣行メモ', exact: true }).getByRole('textbox')).toHaveValue(/朝はスプーン/)
  await expect(page.locator('.timeline-marker.weather')).toHaveCount(1)
  const beforeExport = await readAllState(page)
  await panel.getByText('サマリー画像・共有', { exact: true }).click()
  await panel.getByLabel('釣行メモの抜粋').check()
  await panel.getByLabel('気象ログの要約').check()
  await panel.getByRole('button', { name: '画像プレビューを作成', exact: true }).click()
  const preview = panel.getByRole('img', { name: '釣行レポートPNGのプレビュー' })
  await expect(preview).toBeVisible()
  const digest = await preview.evaluate(async image => {
    const bytes = await (await fetch((image as HTMLImageElement).src)).arrayBuffer()
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  })
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'サマリー画像を保存', exact: true }).click()])
  const pngPath = info.outputPath('rc36-summary.png'); await download.saveAs(pngPath)
  const png = await readFile(pngPath)
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBe(1350)
  expect(png.length).toBeGreaterThan(20000)
  expect(createHash('sha256').update(png).digest('hex')).toBe(digest)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files![0]!
      ;(window as any).__rc36Share = { name: file.name, type: file.type, size: file.size, text: data.text }
    } })
  })
  await panel.getByRole('button', { name: '共有', exact: true }).click()
  expect(await page.evaluate(() => (window as any).__rc36Share)).toMatchObject({ type: 'image/png', size: png.length, text: expect.stringContaining('モカDR-Fラトル') })
  await expect(panel).toContainText('共有先へ画像を渡しました')
  await panel.getByLabel('MVP', { exact: true }).uncheck()
  await expect(preview).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '共有', exact: true })).toBeDisabled()
  expect(await readAllState(page)).toEqual(beforeExport)
  await page.getByRole('button', { name: '← ホーム', exact: true }).click()
  const [backupDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
  const backupPath = info.outputPath('rc36-v11.json'); await backupDownload.saveAs(backupPath)
  const backup = JSON.parse(await readFile(backupPath, 'utf8')); expect(backup.version).toBe(11)
  await restoreViaUI(page, backup)
  await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
  await expect(panel.locator('.mvp-display')).toContainText('モカDR-Fラトル')
  const restored = await readAllState(page)
  for (const key of Object.keys(beforeExport)) if (key !== 'lureMasterImportHistory') expect(restored[key]).toEqual(beforeExport[key])
})

test('RC36 long Japanese text and many lures fit the card; full-table pages retain all rows', async ({ page }, info) => {
  await restoreViaUI(page, fixture(37))
  await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
  const panel = page.getByRole('region', { name: '釣行サマリー', exact: true })
  await panel.getByText('サマリー画像・共有', { exact: true }).click()
  await panel.getByLabel('釣行メモの抜粋').check()
  await panel.getByLabel('気象ログの要約').check()
  const card = page.locator('[data-report-card]')
  await expect(card).toContainText('ほか29件')
  const assertFits = async () => {
    const metrics = await card.evaluate(element => {
      const footer = element.querySelector('footer')!.getBoundingClientRect()
      const sections = [...element.querySelectorAll('section')]
      return { bottom: Math.max(...sections.map(item => item.getBoundingClientRect().bottom)), footer: footer.top,
        sections: sections.map(item => ({ name: item.className, height: item.getBoundingClientRect().height, bottom: item.getBoundingClientRect().bottom })) }
    })
    expect(metrics.bottom, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.footer)
  }
  await assertFits()
  await panel.getByLabel('画像の種類').selectOption('lures')
  await expect(panel.getByLabel('出力ページ').locator('option')).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    await panel.getByLabel('出力ページ').selectOption(String(i))
    await expect(card.locator('tbody tr')).toHaveCount(i < 2 ? 14 : 9)
    await assertFits()
  }
  await panel.getByRole('button', { name: '画像プレビューを作成', exact: true }).click()
  await expect(panel.getByRole('img')).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: '画像で保存', exact: true }).click()])
  await download.saveAs(info.outputPath('rc36-lures-page-3.png'))
  await panel.getByLabel('出力ページ').selectOption('0')
  await expect(panel.getByRole('img')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('RC36 zero catch/unfinished trip, rendering failure retry, share cancellation and unsupported fallback', async ({ page }) => {
  const data = fixture(0)
  delete (data.data.trips[0] as any).endedAt
  await restoreViaUI(page, data)
  await page.getByRole('button', { name: /白馬八方ニレ池/ }).click()
  const panel = page.getByRole('region', { name: '釣行サマリー', exact: true })
  await expect(panel.locator('.summary-totals')).not.toContainText('時速')
  await expect(panel.locator('.mvp-display')).toContainText('未設定')
  await panel.getByText('サマリー画像・共有', { exact: true }).click()
  await page.evaluate(() => {
    ;(window as any).__rc36ToBlob = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = callback => callback(null)
  })
  await panel.getByRole('button', { name: '画像プレビューを作成', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('PNGを生成できませんでした')
  await expect(panel.getByRole('button', { name: '共有', exact: true })).toBeDisabled()
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = (window as any).__rc36ToBlob })
  await panel.getByRole('button', { name: '画像プレビューを作成', exact: true }).click()
  await expect(panel.getByRole('img')).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('cancel', 'AbortError') } })
  })
  let downloads = 0; page.on('download', () => downloads++)
  await panel.getByRole('button', { name: '共有', exact: true }).click()
  await expect(panel).toContainText('共有をキャンセルしました')
  expect(downloads).toBe(0)
  await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }) })
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: '共有', exact: true }).click()])
  expect(download.suggestedFilename()).toMatch(/\.png$/)
  await expect(panel).toContainText('PNGの保存を開始しました')
  await expect(panel.getByRole('link', { name: 'Xの投稿画面を開く（文面のみ）' })).toHaveAttribute('href', /^https:\/\/twitter.com\/intent\/tweet\?text=/)
})
