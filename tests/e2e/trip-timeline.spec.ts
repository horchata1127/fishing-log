import { test, expect, restoreViaUI } from './fixtures'
import { timelineScenario, timelineState } from '../timelineFixture'
import { weatherTripName, weatherResponse, weatherTripId } from '../weatherFixture'

test('saved Iwana archive and seven catches: JST placement, touch details, gaps, filters and metadata are read only', async ({ page }, info) => {
  const fixture = timelineScenario(true)
  const rows = fixture.data.catches!.filter(c => c.tripId === weatherTripId)
  rows[0]!.lureName = 'テスト用記録ルアー'; rows[0]!.fishSpecies = 'ニジマス'
  // Synthetic extra lost record: no claim about the real Iwana trip.
  fixture.data.catches!.push({ ...rows[1], id: 97000, resultType: 'lost', lostDistance: 'near', zoneId: undefined, locationSnapshot: undefined })
  await restoreViaUI(page, fixture)
  let calls = 0; await page.route('https://archive-api.open-meteo.com/**', route => { calls++; return route.abort() })
  const before = await timelineState(page)
  await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
  const graph = page.getByRole('region', { name: '統合タイムライン', exact: true })
  await expect(graph.locator('.timeline-marker.catch')).toHaveCount(7)
  await expect(graph.locator('.temperature-line')).toHaveCount(2)
  for (const time of ['06:21','10:13','11:22','13:57','14:21','14:53','15:16']) await expect(graph.getByRole('button', { name: `釣果 2026/10/17 ${time}`, exact: true })).toBeVisible()
  const chart = await graph.locator('.canvas').boundingBox(), marker = graph.locator('.timeline-marker.catch').first(), rect = await marker.boundingBox()
  expect(rect!.width).toBeGreaterThanOrEqual(44); expect(rect!.height).toBeGreaterThanOrEqual(44)
  const fraction = (Date.parse('2026-10-17T06:21:00+09:00') - Date.parse('2026-10-16T21:03:12.160Z')) / (Date.parse('2026-10-17T15:25:00+09:00') - Date.parse('2026-10-16T21:03:12.160Z'))
  expect(rect!.x + 22 - chart!.x).toBeCloseTo(84 + fraction * (chart!.width - 112), 0)
  await marker.click(); const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('テスト用記録ルアー'); await expect(dialog).toContainText('ニジマス'); await expect(dialog).toContainText('9号池')
  await dialog.getByRole('button', { name: '記録の詳細を閉じる' }).click()
  await graph.getByLabel('釣果・バラシのエリア').selectOption('id:official:nihon-iwana-center:pond-9')
  await expect(graph.locator('.timeline-marker.lost')).toHaveCount(1)
  await graph.getByLabel('エリア未設定も含める').uncheck(); await expect(graph.locator('.timeline-marker.lost')).toHaveCount(0)
  await expect(graph.locator('.temperature-line')).toHaveCount(2)
  await graph.getByLabel('タイムラインの拡大率').selectOption('2'); await expect(graph.getByText('グラフ内を横にスクロールできます。')).toBeVisible()
  await graph.getByLabel('タイムラインの拡大率').selectOption('1')
  await graph.getByText('グラフの気象取得地点とモデル格子点', { exact: true }).click()
  await expect(graph.getByText(/モデル格子点：/)).toContainText(String(weatherResponse.longitude))
  await expect(graph.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toBeVisible()
  expect(calls).toBe(0); expect(await timelineState(page)).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await graph.screenshot({ path: info.outputPath('timeline-ui.png') })
})

test('manual same-facility candidate requires explicit confirmation; no weather or existing record changes', async ({ page }) => {
  await restoreViaUI(page, timelineScenario())
  let calls = 0; await page.route('https://archive-api.open-meteo.com/**', route => { calls++; return route.abort() })
  const before = await timelineState(page)
  await page.getByRole('button', { name: /同一施設の地点再利用テスト/ }).click()
  const graph = page.getByRole('region', { name: '統合タイムライン', exact: true })
  await expect(graph.getByText('保存済み気温データはありません。釣果・イベントのみ表示します。')).toBeVisible()
  const panel = page.getByRole('region', { name: '気象データ', exact: true }); await panel.locator('summary').click()
  await panel.getByLabel('以前の地点候補').selectOption(String(weatherTripId))
  expect(await timelineState(page)).toEqual(before); expect(calls).toBe(0)
  await expect(panel.getByLabel('緯度', { exact: true })).toHaveValue('')
  await panel.getByRole('button', { name: '選択した地点をこの釣行に保存' }).click()
  await expect(panel.getByLabel('緯度', { exact: true })).toHaveValue('36.611')
  const after = await timelineState(page)
  for (const name of Object.keys(before)) if (name !== 'tripWeatherLocations') expect(after[name]).toEqual(before[name])
  expect(after.tripWeatherLocations!.filter(l => l.tripId !== 96000)).toEqual(before.tripWeatherLocations)
  expect(after.tripWeatherLocations).toHaveLength(before.tripWeatherLocations!.length + 1)
  await page.reload(); await page.getByRole('button', { name: /同一施設の地点再利用テスト/ }).click(); await page.getByRole('region', { name: '気象データ', exact: true }).locator('summary').click()
  await expect(page.getByLabel('以前の地点候補')).toHaveCount(0); expect(calls).toBe(0)
})

test('same-time stocking/pellet and unknown-time events stay distinct without weather', async ({ page }) => {
  await restoreViaUI(page, timelineScenario())
  // Defensive legacy/malformed input is confined to this disposable browser context.
  await page.evaluate(async () => {
    const path = '/fishing-log/src/db/database.ts', { db } = await import(path)
    await db.tripEvents.bulkAdd([
      { tripId: 96000, type: 'stocking', occurredAt: new Date('2026-10-18T01:00:00Z'), note: '合成放流' },
      { tripId: 96000, type: 'pellet', occurredAt: new Date('2026-10-18T01:00:00Z'), timePrecision: 'approximate', note: '合成概算' },
      { tripId: 96000, type: 'pellet', timePrecision: 'unknown', note: '合成・正確な時刻不明' },
    ])
  })
  const before = await timelineState(page)
  await page.getByRole('button', { name: /同一施設の地点再利用テスト/ }).click()
  const graph = page.getByRole('region', { name: '統合タイムライン', exact: true })
  await expect(graph.locator('.timeline-marker')).toHaveCount(2)
  await graph.getByRole('button', { name: /ペレット散布 約/ }).click(); await expect(page.getByRole('dialog')).toContainText('概算時刻の記録'); await page.getByRole('button', { name: '記録の詳細を閉じる' }).click()
  await expect(graph.getByRole('heading', { name: '時刻不明イベント' })).toBeVisible()
  await graph.getByRole('button', { name: /ペレット散布 時刻不明/ }).click(); await expect(page.getByRole('dialog')).toContainText('正確な時刻は記録されていません。'); await page.getByRole('button', { name: '記録の詳細を閉じる' }).click()
  expect(await timelineState(page)).toEqual(before)
})

test('missing trip times fall back to saved record bounds without changing weather or legacy fishingDate', async ({ page }) => {
  await restoreViaUI(page, timelineScenario())
  await page.evaluate(async () => {
    const path = '/fishing-log/src/db/database.ts', { db } = await import(path)
    // Empty legacy start is still indexable; a missing indexed key is not listed by
    // the pre-existing home query. Neither fixture nor app backfills a real time.
    await db.trips.update(95000, { startedAt: '', endedAt: undefined })
  })
  await page.reload()
  const before = await timelineState(page)
  await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
  const graph = page.getByRole('region', { name: '統合タイムライン', exact: true })
  await expect(graph.locator('.timeline-marker.catch')).toHaveCount(7)
  await expect(graph.getByText(/開始・終了時刻が揃わないため/)).toBeVisible()
  await expect(graph.locator('.temperature-line')).toHaveCount(1)
  const panel = page.getByRole('region', { name: '気象データ', exact: true }); await panel.locator('summary').click()
  await expect(panel.getByRole('button', { name: '過去の気象データを再取得', exact: true })).toBeDisabled()
  expect(await timelineState(page)).toEqual(before)
})
