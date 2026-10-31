import { test, expect, chromium, type Page } from '@playwright/test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc32ReleaseFixture } from '../rc32ReleaseFixture'

const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
async function state(page: Page) {
  if (new URL(page.url()).origin !== origin) throw new Error('Test origin required')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('FishingLogDatabase')
      request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('Existing test DB required')) }
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<Record<string, any[]>>((resolve, reject) => {
        const tx = db.transaction([...db.objectStoreNames], 'readonly'), data: Record<string, any[]> = {}
        for (const name of db.objectStoreNames) { const req = tx.objectStore(name).getAll(); req.onsuccess = () => { data[name] = req.result } }
        tx.oncomplete = () => resolve(JSON.parse(JSON.stringify(data))); tx.onabort = () => reject(tx.error)
      })
    } finally { db.close() }
  })
}

test('RC32辞書編集中はPWA更新を延期し、更新と圏外再起動で全21テーブルを保持する', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc32-release-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url)
    await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
    const restored = new Promise<void>(resolve => { page.on('dialog', async d => { await d.accept(); if (d.message().includes('バックアップから復元したで')) resolve() }) })
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic-release-v7.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc32ReleaseFixture())) })
    await restored
    const original = await state(page)
    expect(original.lureVariants).toHaveLength(2899); expect(original.tripWeatherHours).toHaveLength(24)
    expect(original.lureVisualProfiles).toEqual([])
    await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
    const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
    await dictionary.locator('article[data-variant-id="386"]').getByRole('button', { name: '代表配色を編集', exact: true }).click()
    const editor = dictionary.getByRole('region', { name: 'ビジュアルカラー入力' })
    await editor.getByRole('button', { name: 'ブルー', exact: true }).click()
    await fetch(`${origin}/__test/version?v=B`, { method: 'POST' })
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
    await expect(page.getByRole('button', { name: '更新して再読み込み', exact: true })).toBeDisabled()
    await expect(editor.getByRole('button', { name: 'ブルー', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await state(page)).toEqual(original)
    await dictionary.getByRole('button', { name: '代表配色を保存', exact: true }).click()
    await expect(dictionary.locator('article[data-variant-id="386"]')).toContainText('手動編集・確認済み')
    await dictionary.getByRole('button', { name: '辞書を閉じる', exact: true }).click()
    const beforeUpdate = await state(page)
    expect(beforeUpdate.lureVisualProfiles).toHaveLength(1)
    for (const [name, rows] of Object.entries(original)) if (name !== 'lureVisualProfiles') expect(beforeUpdate[name]).toEqual(rows)
    await page.getByRole('button', { name: '更新して再読み込み', exact: true }).click()
    await expect(page.locator('meta[name="test-version"]')).toHaveAttribute('content', 'B')
    expect(await state(page)).toEqual(beforeUpdate)
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    expect(await state(page)).toEqual(beforeUpdate)
    await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
    const reopened = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
    await reopened.getByText('色から検索（0色）', { exact: true }).click()
    await reopened.getByRole('button', { name: 'ブルー', exact: true }).click()
    await expect(reopened.locator('article[data-variant-id]')).toHaveCount(1)
    await reopened.getByRole('button', { name: '辞書を閉じる', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const path = info.outputPath('synthetic-release-v8.json'); await download.saveAs(path)
    const backup = JSON.parse(await readFile(path, 'utf8'))
    expect(backup.version).toBe(8); expect(backup.data).toEqual(beforeUpdate)
  } finally { await context.close() }
})
