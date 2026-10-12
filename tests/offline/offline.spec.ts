import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc20Fixture } from '../rc20Fixture'

const origin = 'http://127.0.0.1:4188'
const url = `${origin}/fishing-log/`
const names = ['trips', 'catches', 'tripEvents', 'lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures', 'rods', 'reels', 'lines', 'tackleSets', 'fishSpecies']
async function database(page: Page, seed = false, includeLocations = false) {
  return page.evaluate(async ({ names, seed }) => {
    if (location.origin !== 'http://127.0.0.1:4188') throw new Error('Only isolated offline test origin permitted')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('FishingLogDatabase'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)
      r.onupgradeneeded = () => { r.transaction?.abort(); reject(new Error('App DB missing')) }
    })
    try {
      return await new Promise<Record<string, any[]>>((resolve, reject) => {
        const tx = db.transaction(names, seed ? 'readwrite' : 'readonly')
        const rows: Record<string, any[]> = {}
        if (seed) {
          const data: Record<string, any[]> = {
            trips: [{ id: 1, fishingDate: '2026-10-11', fishingAreaName: '既存テスト釣行', fishingStyle: 'AREA_TROUT', startedAt: '2026-10-11T00:00:00Z' }],
            lureManufacturers: [{ id: 10, name: 'E2Eメーカー' }], lureSeries: [{ id: 20, manufacturerId: 10, name: 'E2Eシリーズ' }],
            lureModels: [{ id: 30, seriesId: 20, name: 'E2Eスプーン', category: 'スプーン' }], lureVariants: [{ id: 40, modelId: 30, colorName: '赤' }],
            myLures: [{ id: 50, variantId: 40, active: true, ownershipStatus: 'owned' }],
            rods: [{ id: 1, manufacturer: '試験', modelName: 'ロッド', active: true }],
            reels: [{ id: 1, manufacturer: '試験', modelName: 'リール', mainLineId: 1, active: true }],
            lines: [{ id: 1, material: 'ナイロン', strengthLb: 3.5, active: true }],
            tackleSets: [{ id: 1, name: '試験セット', rodId: 1, reelId: 1, active: true }],
            fishSpecies: [{ fish_id: 'F001', group: 'ニジマス', display_name: 'ニジマス', active: true, origin: 'reviewed',
              aliases: '', region: '', lineage_or_type: '', source_status: '', notes: '', source_url: '' }],
          }
          for (const [name, values] of Object.entries(data)) for (const value of values) tx.objectStore(name).put(value)
        }
        for (const name of names) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { rows[name] = r.result } }
        tx.oncomplete = () => resolve(JSON.parse(JSON.stringify(rows))); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error)
      })
    } finally { db.close() }
  }, { names: includeLocations ? [...names, 'facilities', 'zones', 'appMetadata'] : names, seed })
}
async function ready(page: Page) {
  await expect(page.getByText('準備を完了するにはホームで再読み込みしてください。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
  await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${url}sw.js`)
}

test('RC20 official patch works offline and preserves historical IDs after full profile restart', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc20-offline-'))
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { serviceWorkers: 'allow', offline,
    viewport: info.project.name.includes('mobile') ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url); await ready(page)
    page.on('dialog', dialog => dialog.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-rc19.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc20Fixture())) })
    await expect.poll(async () => (await database(page)).catches!.length).toBe(4)
    const before = await database(page)
    await context.setOffline(true)
    await page.getByRole('button', { name: 'RC20の追加予定を確認', exact: true }).click()
    const preview = page.getByRole('region', { name: 'RC20カタログの事前確認', exact: true })
    await expect(preview).toContainText('追加 48色')
    await preview.getByRole('button', { name: 'RC20の確認済みカラーを追加', exact: true }).click()
    await expect(preview).not.toBeVisible()
    const saved = await database(page)
    expect(saved.catches).toEqual(before.catches); expect(saved.trips).toEqual(before.trips); expect(saved.myLures).toEqual(before.myLures)
    expect(saved.lureVariants!.filter(v => v.modelId === 305)).toHaveLength(30)
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    expect(await database(page)).toEqual(saved)
  } finally { await context.close() }
})

test('offline user facility/zone additions, catch snapshots and v6 backup survive full profile restart', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-location-offline-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, {
    serviceWorkers: 'allow', offline, viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url); await ready(page)
    await database(page, true)
    const original = await database(page)
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    expect(await database(page)).toEqual(original)
    await page.getByRole('button', { name: '新しい釣行を開始' }).click()
    await page.getByRole('button', { name: '施設を追加', exact: true }).click()
    await page.getByLabel('追加する施設名', { exact: true }).fill('圏外の架空施設')
    await page.getByRole('button', { name: '登録して選択', exact: true }).click()
    await expect(page.getByLabel('追加する施設名', { exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'この施設にエリアを追加', exact: true }).click()
    await page.getByLabel('追加するエリア名', { exact: true }).fill('圏外の架空下池')
    await page.getByRole('button', { name: '登録して選択', exact: true }).click()
    await expect(page.getByLabel('追加するエリア名', { exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
    await modal.getByRole('button', { name: 'ルアーを選ぶ' }).click()
    await page.getByRole('dialog', { name: 'ルアーを選択', exact: true }).getByRole('button', { name: /E2Eスプーン 赤/ }).click()
    await modal.getByRole('button', { name: '保存する', exact: true }).click()
    await expect(modal).not.toBeVisible()
    await page.getByRole('region', { name: '釣果履歴' }).getByRole('button', { name: '編集', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '釣果を編集', exact: true })
    await editor.getByLabel('メモ（任意）').fill('圏外で訂正')
    await editor.getByRole('button', { name: '保存する', exact: true }).click()
    await expect(editor).not.toBeVisible()
    const saved = await database(page, false, true)
    expect(saved.catches![0].memo).toBe('圏外で訂正')
    expect(saved.facilities).toHaveLength(1); expect(saved.zones).toHaveLength(1)
    expect(saved.trips).toHaveLength(2); expect(saved.catches).toHaveLength(1)
    expect(saved.catches![0].locationSnapshot).toEqual({ facilityName: '圏外の架空施設', zoneName: '圏外の架空下池' })
    expect(saved.myLures).toEqual(original.myLures); expect(saved.tackleSets).toEqual(original.tackleSets)
    expect(saved.trips![0]).toEqual(original.trips![0])
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url); expect(await database(page, false, true)).toEqual(saved)
    await page.getByRole('button', { name: /圏外の架空施設/ }).click()
    await expect(page.getByLabel('現在のエリア', { exact: true })).toHaveValue(saved.zones![0].id)
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    await page.getByRole('dialog', { name: '釣果を登録', exact: true }).getByRole('button', { name: /前回と同じ/ }).click()
    await expect(page.getByRole('dialog', { name: '釣果を登録', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    const complete = await database(page, false, true)
    expect(complete.catches).toHaveLength(2)
    expect(complete.catches![1].locationSnapshot).toEqual(saved.catches![0].locationSnapshot)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('synthetic-location-backup.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8'))
    expect(backup.version).toBe(6); expect(backup.data).toEqual(complete)
    await page.screenshot({ path: info.outputPath('offline-user-locations.png'), fullPage: true })
  } finally { await context.close() }
})
test('cold persistent profile: offline trip/catch, snapshots, restart, backup and static-only cache', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-offline-'))
  const mobile = info.project.name.includes('mobile')
  let context: BrowserContext
  const launch = async (offline = false) => chromium.launchPersistentContext(profile, {
    serviceWorkers: 'allow', offline, viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  })
  context = await launch()
  context.setDefaultTimeout(10000)
  try {
    let page = context.pages()[0]!
    await page.goto(url); await ready(page); await database(page, true)
    await page.reload(); await expect(page.getByRole('button', { name: /既存テスト釣行/ })).toBeVisible()
    await context.close(); context = await launch(true); context.setDefaultTimeout(10000); page = context.pages()[0]!
    await page.goto(url)
    await expect(page.getByRole('button', { name: /既存テスト釣行/ })).toBeVisible()
    await page.getByRole('button', { name: '新しい釣行を開始' }).click()
    await page.getByLabel('釣り場', { exact: true }).fill('圏外試験釣行')
    await page.getByLabel('試験セット', { exact: true }).check()
    await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
    await modal.getByRole('combobox', { name: '魚種を選択', exact: true }).selectOption('F001')
    await modal.getByLabel('全長（cm・任意）', { exact: true }).fill('30')
    await modal.getByLabel('使用タックル', { exact: true }).selectOption('1')
    await modal.getByRole('button', { name: 'ルアーを選ぶ' }).click()
    await page.getByRole('dialog', { name: 'ルアーを選択', exact: true }).getByRole('button', { name: /E2Eスプーン 赤/ }).click()
    await modal.getByRole('button', { name: '保存する', exact: true }).click()
    await expect(modal).not.toBeVisible()
    const saved = await database(page)
    expect(saved.trips).toHaveLength(2); expect(saved.catches).toHaveLength(1)
    expect(saved.catches![0]).toMatchObject({ fishSpeciesId: 'F001', fishSizeCm: 30, lureId: 50, tackleSetId: 1 })
    expect(saved.catches![0].tackleSnapshot.mainLine.strengthLb).toBe(3.5)
    await page.reload(); expect(await database(page)).toEqual(saved)
    await context.close(); context = await launch(true); context.setDefaultTimeout(10000); page = context.pages()[0]!
    await page.goto(url); expect(await database(page)).toEqual(saved)
    await context.setOffline(false); await page.reload(); expect(await database(page)).toEqual(saved)
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('synthetic-backup.json'); await file.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8')); expect(backup.version).toBe(5); expect(backup.data).toEqual(saved)
    const keys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat())
    expect(keys.length).toBeGreaterThan(5)
    expect(keys.every(key => new URL(key).pathname.startsWith('/fishing-log/'))).toBe(true)
    expect(keys.every(key => /\.(html|js|css|svg|png|webmanifest)(\?|$)/.test(key))).toBe(true)
    expect(keys.some(key => /backup|blob:/.test(key))).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath('offline-ready.png'), fullPage: true })
  } finally { await context.close() }
})

test('updates: unsaved input, defer, other window veto, explicit update, natural activation and failed install', async ({ browser }) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  try {
    const page = await context.newPage(); await page.goto(url); await ready(page)
    await page.getByRole('button', { name: '新しい釣行を開始' }).click()
    await page.getByLabel('釣り場', { exact: true }).fill('未保存の入力')
    await page.getByRole('button', { name: '施設を追加', exact: true }).click()
    await page.getByLabel('追加する施設名', { exact: true }).fill('未保存の追加施設')
    await fetch(`${origin}/__test/version?v=B`, { method: 'POST' })
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
    await expect(page.getByRole('button', { name: '更新して再読み込み' })).toBeDisabled()
    await expect(page.getByLabel('釣り場', { exact: true })).toHaveValue('未保存の入力')
    await expect(page.getByLabel('追加する施設名', { exact: true })).toHaveValue('未保存の追加施設')
    await expect(page.getByRole('button', { name: '🎣 釣行開始', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '追加をキャンセル', exact: true }).click()
    await page.getByRole('button', { name: '後で', exact: true }).click()
    await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
    await page.getByRole('button', { name: '← ホーム', exact: true }).click()
    await page.getByRole('button', { name: '更新操作を表示' }).click()
    const other = await context.newPage(); await other.goto(url)
    await other.getByRole('button', { name: '新しい釣行を開始' }).click()
    await other.getByLabel('釣り場', { exact: true }).fill('別画面の入力')
    await page.getByRole('button', { name: '更新して再読み込み' }).click()
    await expect(page.getByText(/更新を延期しました。他のFishing Log画面を閉じてから/)).toBeVisible()
    await expect(other.getByLabel('釣り場', { exact: true })).toHaveValue('別画面の入力')
    await other.close()
    await page.getByRole('button', { name: '更新して再読み込み' }).click()
    await expect(page.locator('meta[name="test-version"]')).toHaveAttribute('content', 'B')
    expect((await database(page)).trips).toHaveLength(1)
    await fetch(`${origin}/__test/version?v=C`, { method: 'POST' })
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
    await expect(page.getByRole('button', { name: '更新して再読み込み' })).toBeVisible()
    await page.close()
    const reopened = await context.newPage(); await reopened.goto(url)
    await expect(reopened.locator('meta[name="test-version"]')).toHaveAttribute('content', 'C')
    await fetch(`${origin}/__test/version?v=broken`, { method: 'POST' })
    await reopened.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
    await expect.poll(async () => (await (await fetch(`${origin}/__test/status`)).json()).missingHits).toBeGreaterThan(0)
    await expect.poll(() => reopened.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.installing?.state ?? 'none')).toBe('none')
    await context.setOffline(true); await reopened.reload()
    await expect(reopened.locator('meta[name="test-version"]')).toHaveAttribute('content', 'C')
    expect((await database(reopened)).trips).toHaveLength(1)
    const outside = await context.newPage()
    await context.setOffline(false); const response = await outside.goto(`${origin}/outside`)
    expect(response?.status()).toBe(404); expect(await outside.evaluate(() => navigator.serviceWorker.controller)).toBeNull()
    const missing = await reopened.request.get(`${url}missing-page`); expect(missing.status()).toBe(404)
  } finally { await context.close() }
})

test('production URLs, MIME, manifest scope, icon sizes and failed first preparation', async ({ browser, request }) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  for (const [name, mime] of [['sw.js', 'application/javascript'], ['manifest.webmanifest', 'application/manifest+json'],
    ['pwa-client-check.js', 'application/javascript'], ['pwa-192.png', 'image/png'], ['pwa-512.png', 'image/png'], ['apple-touch-icon.png', 'image/png']]) {
    const response = await request.get(url + name); expect(response.status()).toBe(200); expect(response.headers()['content-type']).toContain(mime)
    if (name!.endsWith('.png')) {
      const png = await response.body(); const size = name === 'apple-touch-icon.png' ? 180 : name === 'pwa-192.png' ? 192 : 512
      expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size)
    }
  }
  const manifest = await (await request.get(url + 'manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ id: '/fishing-log/', start_url: '/fishing-log/', scope: '/fishing-log/', display: 'standalone' })
  await fetch(`${origin}/__test/version?v=broken`, { method: 'POST' })
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  try {
    const page = await context.newPage(); await page.goto(url)
    await expect(page.getByText(/圏外利用の準備に失敗しました/)).toBeVisible()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: '新しい釣行を開始' }).click()
    await expect(page.getByLabel('釣り場', { exact: true })).toBeVisible()
  } finally { await context.close() }
})
