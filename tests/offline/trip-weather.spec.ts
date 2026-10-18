import { test, expect, chromium, type Page } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { weatherResponse, weatherScenario, weatherStoreNames, weatherTripName } from '../weatherFixture'

const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
async function state(page: Page) {
  if (new URL(page.url()).origin !== origin) throw new Error('Isolated test origin required')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('FishingLogDatabase'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.onupgradeneeded = () => { r.transaction?.abort(); reject(Error('DB not ready')) } })
    try {
      return await new Promise<Record<string, any[]>>((resolve, reject) => {
        const names = Array.from(db.objectStoreNames), tx = db.transaction(names, 'readonly'), rows: Record<string, any[]> = {}
        for (const name of names) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { rows[name] = r.result } }
        tx.oncomplete = () => resolve(JSON.parse(JSON.stringify(rows))); tx.onabort = () => reject(tx.error)
      })
    } finally { db.close() }
  })
}
test('weather UTC hours and provenance survive offline full profile restart; failures keep cache and v7 round trip', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-weather-offline-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url); await expect(page.getByRole('button', { name: '新しい釣行を開始' })).toBeVisible()
    await expect(page.getByText('準備を完了するにはホームで再読み込みしてください。', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
    await page.clock.install({ time: new Date('2026-10-23T00:00:00Z') })
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-weather-case.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(weatherScenario())) })
    await expect(page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) })).toBeVisible()
    const before = await state(page)
    await context.route('https://archive-api.open-meteo.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(weatherResponse) }))
    await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
    let panel = page.getByRole('region', { name: '気象データ', exact: true }); await panel.locator('summary').click()
    await panel.getByLabel('緯度', { exact: true }).fill('36.611'); await panel.getByLabel('経度', { exact: true }).fill('139.194')
    await panel.getByRole('button', { name: '地点を保存', exact: true }).click()
    await panel.getByRole('button', { name: '過去の気象データを取得', exact: true }).click(); await expect(panel.locator('tbody tr')).toHaveCount(24)
    const saved = await state(page)
    for (const [name, rows] of Object.entries(before)) if (!(weatherStoreNames as readonly string[]).includes(name)) expect(saved[name]).toEqual(rows)
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.clock.install({ time: new Date('2026-10-23T00:00:00Z') })
    await page.goto(url); await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
    panel = page.getByRole('region', { name: '気象データ', exact: true }); await panel.locator('summary').click()
    await expect(panel.locator('tbody tr')).toHaveCount(24); expect(await state(page)).toEqual(saved)
    await expect(panel.getByText(/モデルのグリッド地点/)).toContainText(String(weatherResponse.longitude))
    await expect(panel.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toBeVisible()
    await panel.getByRole('button', { name: '過去の気象データを再取得', exact: true }).click()
    await expect(panel.getByRole('alert')).toBeVisible(); expect((await state(page)).tripWeatherHours).toEqual(saved.tripWeatherHours)
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('offline-weather-v7.json'); await download.saveAs(path); const backup = JSON.parse(await readFile(path, 'utf8'))
    expect(backup.version).toBe(7); expect(Object.keys(backup.data)).toHaveLength(19)
    page.on('dialog', d => d.accept()); await page.getByTestId('restore-backup').setInputFiles({ name: 'offline-weather-v7.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await expect.poll(async () => (await state(page)).tripWeatherHours).toEqual(backup.data.tripWeatherHours)
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    expect((await state(page)).tripWeatherHours).toEqual(backup.data.tripWeatherHours)
    for (const [name, rows] of Object.entries(before)) if (!(weatherStoreNames as readonly string[]).includes(name)) expect((await state(page))[name]).toEqual(rows)
    const keys = await page.evaluate(async () => { const out: string[] = []; for (const cacheName of await caches.keys()) for (const r of await (await caches.open(cacheName)).keys()) out.push(r.url); return out })
    expect(keys.some(u => u.includes('open-meteo') || u.includes('weather-fixture') || u.includes('facility-coordinates'))).toBe(false)
  } finally { await context.close() }
})
