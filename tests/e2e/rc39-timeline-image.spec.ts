import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test, expect, restoreViaUI, readAllState } from './fixtures'
import { rc39Fixture } from '../rc39Fixture'
import { weatherTripId } from '../weatherFixture'

test('timeline PNG includes all layers and readable legend; save/share use the preview bytes without DB writes', async ({ page }, info) => {
  test.setTimeout(60000)
  await restoreViaUI(page, rc39Fixture())
  const before = await readAllState(page)
  await page.locator(`.trip-row[data-trip-id="${weatherTripId}"]`).click()
  const panel = page.getByRole('region', { name: 'タイムライン画像出力', exact: true })
  await panel.locator('summary').click()
  const card = page.locator('[data-timeline-image-card]')
  await expect(card.locator('[data-image-legend]')).toContainText('気温')
  for (const label of ['釣果', 'バラシ', '放流', 'ペレット散布', '気象・環境']) await expect(card.locator('[data-image-legend]')).toContainText(label)
  await expect(card).toContainText('2026/10/17 06:03 〜 2026/10/17 15:25 JST')
  await expect(card).toContainText('欠損や時間の抜けでは線を切ります')
  await expect(card).toContainText('Open-Meteo.com')
  await expect(card.locator('.image-temperature-line')).toHaveCount(2)
  await expect(card.locator('.image-marker[data-kind="catch"]')).toHaveCount(7)
  for (const kind of ['lost', 'stocking', 'pellet', 'weather']) await expect(card.locator(`.image-marker[data-kind="${kind}"]`)).toHaveCount(1)
  const graphArea = await card.evaluate(e => {
    const graph = e.querySelector('svg')!.getBoundingClientRect(), card = e.getBoundingClientRect()
    return { x: graph.x - card.x, y: graph.y - card.y, width: graph.width, height: graph.height }
  })
  await panel.getByRole('button', { name: 'タイムライン画像プレビューを作成', exact: true }).click()
  const preview = panel.getByRole('img', { name: 'タイムラインPNGのプレビュー', exact: true })
  await expect(preview).toBeVisible()
  const pixels = await preview.evaluate(async (element, area) => {
    const img = element as HTMLImageElement
    await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(area.x, area.y, area.width, area.height).data
    const count = (r: number, g: number, b: number) => {
      let n = 0; for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i]! - r) < 8 && Math.abs(data[i + 1]! - g) < 8 && Math.abs(data[i + 2]! - b) < 8) n++
      return n
    }
    const bytes = await (await fetch(img.src)).arrayBuffer()
    return { temperature: count(197, 104, 50), catch: count(18, 102, 82), lost: count(161, 45, 64),
      hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }
  }, graphArea)
  expect(pixels.temperature).toBeGreaterThan(200); expect(pixels.catch).toBeGreaterThan(200); expect(pixels.lost).toBeGreaterThan(100)
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'タイムライン画像を保存', exact: true }).click()])
  expect(download.suggestedFilename()).toBe('fishing-log-2026-10-17-timeline.png')
  const path = info.outputPath('rc39-timeline.png'); await download.saveAs(path)
  const png = await readFile(path)
  expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(1600)
  expect(createHash('sha256').update(png).digest('hex')).toBe(pixels.hash)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files![0]!, bytes = await file.arrayBuffer()
      ;(window as any).__rc39Shared = { name: file.name, type: file.type, text: data.text,
        hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('') }
    } })
  })
  await panel.getByRole('button', { name: 'タイムライン画像を共有', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__rc39Shared)).toMatchObject({ name: download.suggestedFilename(), type: 'image/png', hash: pixels.hash, text: expect.stringContaining('タイムライン') })
  await expect(panel.getByRole('status')).toContainText('共有先へタイムライン画像を渡しました')
  expect(await readAllState(page)).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('dense multi-day Japanese timeline expands as one PNG with every record, notes and footer inside', async ({ page }, info) => {
  test.setTimeout(60000)
  await restoreViaUI(page, rc39Fixture(true))
  const before = await readAllState(page)
  await page.locator(`.trip-row[data-trip-id="${weatherTripId}"]`).click()
  const panel = page.getByRole('region', { name: 'タイムライン画像出力', exact: true })
  await panel.locator('summary').click(); await panel.getByLabel('釣行メモの抜粋', { exact: true }).check()
  const card = page.locator('[data-timeline-image-card]')
  await expect(card.locator('.image-marker[data-kind="catch"]')).toHaveCount(35)
  await expect(card).toContainText('時刻不明の合成記録')
  await expect(card).toContainText('表示範囲外：')
  await expect(card).toContainText('放流の前後と風の変化を確認')
  await expect(card).toContainText('2026/10/20 15:25 JST')
  const bounds = await card.evaluate(e => {
    const rect = e.getBoundingClientRect(), svg = e.querySelector('svg')!.getBoundingClientRect()
    return { height: rect.height, overflow: e.scrollWidth > e.clientWidth,
      outside: [...e.querySelectorAll('h1, h2, p, li, footer, .image-marker')].filter(n => {
        const b = n.getBoundingClientRect(); return b.left < rect.left || b.right > rect.right || b.top < rect.top || b.bottom > rect.bottom
      }).map(n => n.textContent),
      graphOutside: [...e.querySelectorAll('.image-marker')].some(n => { const b = n.getBoundingClientRect(); return b.bottom > svg.bottom || b.right > svg.right }) }
  })
  expect(bounds.overflow).toBe(false); expect(bounds.outside).toEqual([]); expect(bounds.graphOutside).toBe(false)
  expect(bounds.height).toBeGreaterThan(3000)
  await panel.getByRole('button', { name: 'タイムライン画像プレビューを作成', exact: true }).click()
  await expect(panel.getByRole('img', { name: 'タイムラインPNGのプレビュー', exact: true })).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'タイムライン画像を保存', exact: true }).click()])
  const path = info.outputPath('rc39-timeline-dense.png'); await download.saveAs(path)
  const png = await readFile(path)
  expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBe(Math.ceil(bounds.height))
  expect(await readAllState(page)).toEqual(before)
})

test('layer/filter changes invalidate preview; failure retries; sharing cancellation/fallback and no-temperature output', async ({ page }) => {
  test.setTimeout(60000)
  await restoreViaUI(page, rc39Fixture())
  const before = await readAllState(page)
  await page.locator(`.trip-row[data-trip-id="${weatherTripId}"]`).click()
  const timeline = page.getByRole('region', { name: '統合タイムライン', exact: true })
  const panel = page.getByRole('region', { name: 'タイムライン画像出力', exact: true })
  await panel.locator('summary').click()
  await page.evaluate(() => {
    ;(window as any).__rc39ToBlob = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = callback => callback(null)
  })
  await panel.getByRole('button', { name: 'タイムライン画像プレビューを作成', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('タイムラインPNGを生成できませんでした')
  await expect(panel.getByRole('button', { name: 'タイムライン画像を保存', exact: true })).toBeDisabled()
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = (window as any).__rc39ToBlob })
  await panel.getByRole('button', { name: 'タイムライン画像プレビューを作成', exact: true }).click()
  const preview = panel.getByRole('img', { name: 'タイムラインPNGのプレビュー', exact: true })
  await expect(preview).toBeVisible()
  await timeline.getByLabel('釣果・バラシのエリア').selectOption('unset')
  await expect(preview).toHaveCount(0)
  await panel.getByLabel('気温線', { exact: true }).uncheck()
  await panel.getByLabel('気象・環境', { exact: true }).uncheck()
  await expect(page.locator('[data-timeline-image-card] .image-temperature-line')).toHaveCount(0)
  await expect(page.locator('[data-timeline-image-card] .image-marker[data-kind="weather"]')).toHaveCount(0)
  await panel.getByRole('button', { name: 'タイムライン画像プレビューを作成', exact: true }).click()
  await expect(preview).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('cancel', 'AbortError') } })
  })
  let downloads = 0; page.on('download', () => downloads++)
  await panel.getByRole('button', { name: 'タイムライン画像を共有', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('共有をキャンセルしました')
  expect(downloads).toBe(0)
  await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }) })
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'タイムライン画像を共有', exact: true }).click()])
  expect(download.suggestedFilename()).toMatch(/-timeline\.png$/)
  expect(await readAllState(page)).toEqual(before)
  await page.getByRole('button', { name: '← ホーム', exact: true }).click()
  await page.locator('.trip-row[data-trip-id="96000"]').click()
  await panel.locator('summary').click()
  await expect(page.locator('[data-timeline-image-card]')).toContainText('保存済み気温なし')
  await panel.getByRole('button', { name: 'タイムライン画像プレビューを作成', exact: true }).click()
  await expect(preview).toBeVisible()
  expect(await readAllState(page)).toEqual(before)
})
