import { test, expect, chromium } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { catalogFixture } from '../e2e/fixtures'
import { checkMaster, prepareMaster, openMaster } from '../masterUiHelpers'
import { origin, url, offlineReady, offlineState } from './masterCatalogRegression'

test('unified preview, backup confirmation and active apply defer a waiting SW; offline result/history/development persist', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc34-ui-offline-')), mobile = info.project.name.includes('mobile')
  const context = await chromium.launchPersistentContext(profile, { serviceWorkers: 'allow', viewport: mobile ? { width: 402, height: 874 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  const page = context.pages()[0]!
  try {
    await page.goto(url); await offlineReady(page)
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(catalogFixture())) })
    await expect.poll(async () => (await offlineState(page)).lureVariants!.length).toBe(2)
    const before = await offlineState(page)
    await checkMaster(page)
    await fetch(`${origin}/__test/version?v=B`, { method: 'POST' })
    await page.evaluate(async () => { (window as any).__oldController = navigator.serviceWorker.controller; await (await navigator.serviceWorker.getRegistration())?.update() })
    const update = page.getByRole('button', { name: '更新して再読み込み', exact: true })
    await expect(update).toBeVisible({ timeout: 20000 }); await expect(update).toBeDisabled()
    await prepareMaster(page); await expect(update).toBeDisabled()
    expect(await offlineState(page)).toEqual(before)
    await context.setOffline(true)
    // An isolated readwrite transaction holds history long enough to observe the apply UI safely.
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('FishingLogDatabase'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      const transaction = database.transaction('lureMasterImportHistory', 'readwrite'), store = transaction.objectStore('lureMasterImportHistory')
      let hold = true
      ;(window as any).__releaseMasterBlock = () => { hold = false }
      const tick = () => { const r = store.get('__test_only_hold'); r.onsuccess = () => { if (hold) tick() } }
      transaction.oncomplete = () => database.close(); transaction.onabort = () => database.close(); tick()
    })
    await page.getByLabel('バックアップファイルが保存されていることを確認しました', { exact: true }).check()
    await page.getByRole('button', { name: '確認して更新を実行', exact: true }).click()
    await expect(page.getByText('処理中です…画面を閉じずにお待ちください。', { exact: true })).toBeVisible()
    await expect(update).toBeDisabled()
    expect(await page.evaluate(() => (window as any).__oldController === navigator.serviceWorker.controller)).toBe(true)
    await page.evaluate(() => (window as any).__releaseMasterBlock())
    const result = page.getByRole('region', { name: 'マスター更新結果', exact: true })
    await expect(result).toContainText('保留あり成功'); await expect(update).toBeEnabled()
    const saved = await offlineState(page)
    expect(saved.myLures).toEqual(before.myLures)
    expect(saved.lureVisualProfiles).toHaveLength(41)
    await page.screenshot({ path: info.outputPath('rc34-result.png'), fullPage: true })
    await update.click(); await expect(page.getByRole('heading', { name: '🎣 Fishing Log', exact: true })).toBeVisible()
    expect(await offlineState(page)).toEqual(saved)
    const screen = await openMaster(page)
    await screen.getByRole('button', { name: '取り込み履歴', exact: true }).click()
    await expect(screen.locator('[data-history-id]')).toHaveCount(1); await expect(screen).toContainText('保留あり成功')
    await openMaster(page); await screen.getByRole('button', { name: '開発履歴', exact: true }).click()
    await expect(screen.locator('[data-rc]')).toHaveCount(15)
    await screen.locator('[data-rc="19"] summary').click(); await expect(screen.locator('[data-rc="19"]')).toContainText('HUNT GRANDE')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await context.close() }
})
