import { test, expect, chromium, type Page } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkMaster, applyMaster, masterHome, openMaster } from '../masterUiHelpers'
import { assertPack } from '../e2e/masterCatalogRegression'

export const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
export async function offlineState(page: Page) {
  if (new URL(page.url()).origin !== origin) throw new Error('Offline test origin required')
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('FishingLogDatabase'); r.onupgradeneeded = () => { r.transaction?.abort(); reject(new Error('Missing app DB')) }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    try {
      const names = Array.from(database.objectStoreNames)
      return await new Promise<Record<string, Record<string, any>[]>>((resolve, reject) => {
        const tx = database.transaction(names, 'readonly'), rows: Record<string, Record<string, any>[]> = {}
        for (const name of names) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { rows[name] = r.result } }
        tx.oncomplete = () => resolve(JSON.parse(JSON.stringify(rows))); tx.onabort = () => reject(tx.error)
      })
    } finally { database.close() }
  })
}
export async function offlineReady(page: Page) {
  await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
  await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
}
export function registerOfflineCatalogRegression(rc: number, fixture: () => { data: any }, products: Parameters<typeof assertPack>[1], purchases = false) {
  test(`RC${rc} catalog through unified offline cold start/apply/history/repeat/v9 export`, async ({}, info) => {
    await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
    const profile = await mkdtemp(join(tmpdir(), `fishing-unified-rc${rc}-`)), mobile = info.project.name.includes('mobile')
    const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow', viewport: mobile ? { width: 402, height: 874 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
    let context = await launch()
    try {
      let page = context.pages()[0]!; await page.goto(url); await offlineReady(page)
      page.on('dialog', dialog => dialog.accept())
      const source = fixture()
      await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) })
      await expect(page.getByRole('main')).not.toHaveAttribute('inert')
      await expect.poll(async () => (await offlineState(page)).lureVariants!.length).toBe(source.data.lureVariants.length)
      const before = await offlineState(page)
      await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
      expect(await offlineState(page)).toEqual(before)
      await checkMaster(page, purchases); await applyMaster(page)
      const saved = await offlineState(page); assertPack(saved, products, before)
      for (const [table, rows] of Object.entries(before)) {
        expect(saved[table]).toEqual(expect.arrayContaining(rows))
        if (!['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'lureVisualProfiles', 'lureMasterImportHistory', ...(purchases ? ['myLures'] : [])].includes(table)) expect(saved[table]).toEqual(rows)
      }
      if (purchases) expect(saved.myLures!.length - before.myLures!.length).toBe(11)
      await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
      expect(await offlineState(page)).toEqual(saved)
      const screen = await openMaster(page); await screen.getByRole('button', { name: '開発履歴', exact: true }).click()
      await expect(screen.locator('[data-rc]')).toHaveCount(15)
      await openMaster(page); await screen.getByRole('button', { name: '取り込み履歴', exact: true }).click()
      await expect(screen.locator('[data-history-id]')).toHaveCount(1)
      await expect(screen).toContainText('保留あり成功')
      await checkMaster(page, purchases); const again = await applyMaster(page)
      for (const row of await again.locator('tbody tr').all()) expect(await row.locator('td').first().textContent()).toBe('0')
      const repeated = await offlineState(page)
      for (const [table, rows] of Object.entries(saved)) if (table !== 'lureMasterImportHistory') expect(repeated[table]).toEqual(rows)
      await masterHome(page)
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
      const path = info.outputPath(`rc${rc}-unified-offline-v9.json`); await download.saveAs(path)
      const exported = JSON.parse(await readFile(path, 'utf8')); expect(exported.version).toBe(9); expect(exported.data).toEqual(repeated)
    } finally { await context.close() }
  })
}
