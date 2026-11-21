import { expect, type Page } from '@playwright/test'
import { okutamaId, okutamaZones } from './rc44Fixture'

export async function rc44State(page: Page) {
  if (!['http://127.0.0.1:4177', 'http://127.0.0.1:4188'].includes(new URL(page.url()).origin)) throw new Error('Isolated test origin required')
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('FishingLogDatabase'); r.onupgradeneeded = () => { r.transaction?.abort(); reject(new Error('Missing DB')) }
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)
    })
    try {
      const names = Array.from(db.objectStoreNames)
      return await new Promise<Record<string, any[]>>((resolve, reject) => {
        const tx = db.transaction(names, 'readonly'), rows: Record<string, any[]> = {}
        for (const name of names) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { rows[name] = r.result } }
        tx.oncomplete = () => resolve(JSON.parse(JSON.stringify(rows))); tx.onabort = () => reject(tx.error)
      })
    } finally { db.close() }
  })
}

export async function recordOkutamaTrip(page: Page) {
  await page.getByRole('button', { name: '新しい釣行を開始' }).click()
  await page.getByLabel('施設を検索', { exact: true }).fill('奥多摩')
  const facilities = page.getByLabel('管理釣り場', { exact: true })
  await expect(facilities.locator('option')).toHaveCount(2)
  await facilities.selectOption(okutamaId)
  const zones = page.getByLabel('エリア（任意）', { exact: true })
  await expect(zones.locator('option')).toHaveText(['エリア未指定', ...okutamaZones.map(n => `${n}（公式）`)])
  for (const option of await zones.locator('option').all()) await zones.selectOption((await option.getAttribute('value'))!)
  await zones.selectOption(`${okutamaId}:lure-stream`)
  await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
  for (const slug of ['lure-stream', 'lure-pond']) {
    if (slug === 'lure-pond') await page.getByRole('group', { name: '現在のエリア', exact: true }).getByLabel('現在のエリア', { exact: true }).selectOption(`${okutamaId}:${slug}`)
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
    await modal.getByRole('button', { name: '保存する', exact: true }).click(); await expect(modal).not.toBeVisible()
  }
  const beforeEdit = await rc44State(page)
  const history = page.getByRole('region', { name: '釣果履歴' })
  await history.getByRole('button', { name: '編集', exact: true }).last().click()
  const modal = page.getByRole('dialog', { name: '釣果を編集', exact: true })
  await modal.getByLabel('メモ（任意）').fill('河川の記録を編集しても位置を維持')
  await modal.getByRole('button', { name: '保存する', exact: true }).click(); await expect(modal).not.toBeVisible()
  const saved = await rc44State(page)
  const catches = saved.catches!.filter(c => c.facilityId === okutamaId)
  expect(catches.map(c => c.zoneId)).toEqual([`${okutamaId}:lure-stream`, `${okutamaId}:lure-pond`])
  expect(catches.map(c => c.locationSnapshot)).toEqual([
    { facilityName: '奥多摩フィッシングセンター', zoneName: okutamaZones[0] },
    { facilityName: '奥多摩フィッシングセンター', zoneName: okutamaZones[1] },
  ])
  const originalCatch = beforeEdit.catches!.find(c => c.id === catches[0].id)
  expect(catches[0]).toEqual({ ...originalCatch, memo: '河川の記録を編集しても位置を維持' })
  expect(saved.trips!.at(-1)).toMatchObject({ facilityId: okutamaId, currentZoneId: `${okutamaId}:lure-pond` })
  return saved
}
