import { test, expect, chromium, type Page } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stage6Backup, stage6Candidate } from '../stage6Fixture'

const origin = 'http://127.0.0.1:4188', url = `${origin}/fishing-log/`
const names = ['trips', 'catches', 'tripEvents', 'lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures', 'rods', 'reels', 'lines', 'tackleSets', 'fishSpecies', 'facilities', 'zones', 'appMetadata']
async function state(page: Page) {
  return page.evaluate(async names => {
    if (location.origin !== 'http://127.0.0.1:4188') throw new Error('Isolated origin only')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('FishingLogDatabase')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('Missing app DB')) }
    })
    try {
      return await new Promise<Record<string, any[]>>((resolve, reject) => {
        const tx = db.transaction(names, 'readonly'), rows: Record<string, any[]> = {}
        for (const name of names) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { rows[name] = r.result } }
        tx.oncomplete = () => resolve(JSON.parse(JSON.stringify(rows))); tx.onabort = () => reject(tx.error)
      })
    } finally { db.close() }
  }, names)
}

test('approved compiled startup installs 50/73, survives offline profile restart, and preserves all existing rows', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-stage6-approved-profile-'))
  const mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  let context = await launch()
  try {
    let page = context.pages()[0]!
    await page.goto(url)
    await expect.poll(async () => (await state(page)).facilities!.length).toBe(50)
    const first = await state(page)
    expect(first.zones).toHaveLength(73)
    expect(first.appMetadata![0].releaseOrder).toBe(1)
    expect(first.appMetadata![0].masterVersion).toBe(stage6Candidate.masterVersion)
    expect(first.facilities!.every(r => r.origin === 'official')).toBe(true)
    expect(first.trips).toEqual([]); expect(first.catches).toEqual([])
    await expect(page.getByText('準備を完了するにはホームで再読み込みしてください。', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /(?:準備を完了して|更新して)再読み込み/ }).click()
    await expect(page.getByText('圏外利用の準備完了', { exact: true })).toBeVisible()
    expect(await state(page)).toEqual(first)
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'isolated-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stage6Backup())) })
    await expect.poll(async () => (await state(page)).facilities!.length).toBe(51)
    const before = await state(page)
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url)
    await expect(page.getByRole('main')).not.toHaveAttribute('inert')
    expect(await state(page)).toEqual(before)
    await page.getByRole('button', { name: '新しい釣行を開始' }).click()
    const facilities = page.getByLabel('管理釣り場', { exact: true })
    const zones = page.getByLabel('エリア（任意）', { exact: true })
    await facilities.selectOption('official:anglers-park-kingfisher')
    await expect(zones.locator('option')).toHaveText(['エリア未指定', ...[1, 2, 3, 4, 5].map(n => `トラウトエリア${n}号池（公式）`)])
    await facilities.selectOption('official:nihon-iwana-center')
    await expect(zones.locator('option')).toHaveText(['エリア未指定', 'ZERO号池第2（公式）', 'ZERO号池第1（公式）', '1号池（公式）', '2号池（公式）', '3・4号池（公式）', '5・6号池（公式）', '7号池（公式）', '8号池（公式）', '9号池（公式）'])
    await zones.selectOption('official:nihon-iwana-center:pond-9')
    await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
    for (const lost of [false, true]) {
      await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
      const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
      if (lost) { await modal.getByRole('button', { name: 'バラシ', exact: true }).click(); await modal.getByRole('button', { name: '沖', exact: true }).click() }
      await modal.getByRole('button', { name: '保存する', exact: true }).click(); await expect(modal).not.toBeVisible()
    }
    const saved = await state(page)
    for (const [name, rows] of Object.entries(before)) {
      const pk = name === 'fishSpecies' ? 'fish_id' : name === 'appMetadata' ? 'key' : 'id'
      for (const row of rows) expect(saved[name]!.find(r => r[pk] === row[pk])).toEqual(row)
    }
    for (const record of saved.catches!.slice(-2)) expect(record.locationSnapshot).toEqual({ facilityName: '日本イワナセンター', zoneName: '9号池' })
    expect(saved.catches!.at(-1).resultType).toBe('lost')
    await context.close(); context = await launch(true); page = context.pages()[0]!
    await page.goto(url); await expect(page.getByRole('main')).not.toHaveAttribute('inert')
    expect(await state(page)).toEqual(saved)
  } finally { await context.close() }
})
