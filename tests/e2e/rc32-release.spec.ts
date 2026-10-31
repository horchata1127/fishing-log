import { performance } from 'node:perf_hooks'
import { test, expect, restoreViaUI, startTrip, readState } from './fixtures'
import { rc32ReleaseFixture } from '../rc32ReleaseFixture'

test('ブラウザーのRC31相当DB v8をv9へ更新して旧19テーブルの全レコードを保持し、自動取り込みしない', async ({ browser }, info) => {
  const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  const page = await context.newPage(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.route('**/rc32-isolated-bootstrap.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated test bootstrap</title>' }))
    await page.goto('/rc32-isolated-bootstrap.html')
    const baseline = await page.evaluate(async source => {
      const schema: Record<string, string> = {
        trips: '++id,fishingDate,fishingAreaName,fishingStyle,startedAt', catches: '++id,tripId,caughtAt', tripEvents: '++id,tripId,occurredAt,type',
        lureManufacturers: '++id,&name', lureSeries: '++id,manufacturerId,name', lureModels: '++id,seriesId,name', lureVariants: '++id,modelId,colorName', myLures: '++id,variantId,active',
        rods: '++id,initialKey', reels: '++id,mainLineId,initialKey', lines: '++id,initialKey', tackleSets: '++id,rodId,reelId,leaderLineId', fishSpecies: 'fish_id,group,display_name,origin',
        facilities: 'id,origin,prefecture', zones: 'id,facilityId,origin', appMetadata: 'key', tripWeatherLocations: 'tripId',
        tripWeatherHours: '[tripId+timestamp],tripId,timestamp,requestId', tripWeatherRequests: '++id,tripId,createdAt',
      }
      const key = (s: string) => s.startsWith('[') ? s.slice(1, -1).split('+') : s
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('FishingLogDatabase', 80) // Dexie v8's native IDB version.
        request.onupgradeneeded = () => {
          for (const [name, spec] of Object.entries(schema)) {
            const [primary, ...indexes] = spec.split(',')
            const store = request.result.createObjectStore(name, { keyPath: key(primary!.replace(/^\+\+/, '')), autoIncrement: primary!.startsWith('++') })
            for (const index of indexes) { const name = index.replace(/^&/, ''); store.createIndex(name, key(name), { unique: index.startsWith('&') }) }
          }
        }
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
      try {
        const data = source.data as Record<string, any[]>
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(Object.keys(schema), 'readwrite')
          for (const [name, rows] of Object.entries(data)) for (const input of rows) {
            const row = { ...input }
            for (const field of name === 'trips' ? ['startedAt', 'endedAt'] : name === 'catches' ? ['caughtAt'] : name === 'tripEvents' ? ['occurredAt'] : []) if (row[field]) row[field] = new Date(row[field])
            tx.objectStore(name).add(row)
          }
          tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)
        })
        return { version: db.version, data: JSON.parse(JSON.stringify(data)) as Record<string, any[]> }
      } finally { db.close() }
    }, rc32ReleaseFixture())
    expect(baseline.version).toBe(80)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '🎣 Fishing Log', exact: true })).toBeVisible()
    await expect(page.getByRole('main')).not.toHaveAttribute('inert')
    const after = await page.evaluate(async () => {
      const request = indexedDB.open('FishingLogDatabase')
      const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      try {
        const data = await new Promise<Record<string, any[]>>((resolve, reject) => {
          const tx = db.transaction([...db.objectStoreNames], 'readonly'), data: Record<string, any[]> = {}
          for (const name of db.objectStoreNames) { const req = tx.objectStore(name).getAll(); req.onsuccess = () => { data[name] = req.result } }
          tx.oncomplete = () => resolve(JSON.parse(JSON.stringify(data))); tx.onabort = () => reject(tx.error)
        })
        return { version: db.version, data }
      } finally { db.close() }
    })
    expect(after.version).toBe(90); expect(Object.keys(after.data)).toHaveLength(21)
    for (const [name, rows] of Object.entries(baseline.data)) {
      const canonical = rows.map(row => { const result = { ...row }; for (const field of name === 'trips' ? ['startedAt', 'endedAt'] : name === 'catches' ? ['caughtAt'] : name === 'tripEvents' ? ['occurredAt'] : []) if (result[field]) result[field] = new Date(result[field]).toISOString(); return result })
      if (['facilities', 'zones', 'appMetadata'].includes(name)) for (const row of canonical) expect(after.data[name]).toContainEqual(row)
      else expect(after.data[name]).toEqual(canonical)
    }
    expect(after.data.lureVisualProfiles).toEqual([]); expect(after.data.temporaryLureColors).toEqual([])
    expect(errors).toEqual([])
    await info.attach('native-upgrade', { body: JSON.stringify({ from: 80, to: 90, retainedTables: 19, variants: after.data.lureVariants!.length, weatherHours: after.data.tripWeatherHours!.length }), contentType: 'application/json' })
  } finally { await context.close() }
})

test('RC31規模2899色・1400推定配色でも候補を50件ずつ表示し、狭いタッチ画面で操作できる', async ({ page }, info) => {
  const fixture = rc32ReleaseFixture()
  await restoreViaUI(page, fixture)
  const before = await readState(page)
  expect(before.lureVariants).toHaveLength(2899)
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
  await expect(dictionary.locator('article[data-variant-id]')).toHaveCount(50)
  await dictionary.getByText('推定配色を一括取り込み（管理）', { exact: true }).click()
  await dictionary.getByRole('button', { name: '推定件数を確認', exact: true }).click()
  await dictionary.getByRole('button', { name: '確認した推定配色を取り込む', exact: true }).click()
  await expect(dictionary.getByText('推定配色を1400件追加しました。既存配色・釣果・所有情報は保持しています。', { exact: true })).toBeVisible()
  await expect(dictionary.locator('article[data-variant-id]')).toHaveCount(50)
  expect(await readState(page)).toEqual(before)
  await dictionary.getByRole('button', { name: '辞書を閉じる', exact: true }).click()
  await startTrip(page)
  const started = performance.now()
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
  await expect(modal.getByRole('region', { name: 'ビジュアルカラー入力' })).toBeVisible()
  const openMs = Math.round(performance.now() - started)
  expect(openMs).toBeLessThan(5000)
  await modal.getByRole('button', { name: 'ルアーを選ぶ', exact: false }).click()
  const picker = page.getByRole('dialog', { name: 'ルアーを選択', exact: true })
  const options = picker.locator('.lure-picker-list').last().locator('.picker-lure-button')
  await picker.getByRole('button', { name: 'カタログ', exact: true }).click()
  const picked = performance.now()
  await picker.getByLabel('モデルを選んでからカラーを選択').selectOption('144')
  await expect(options).toHaveCount(50)
  const modelMs = Math.round(performance.now() - picked)
  expect(modelMs).toBeLessThan(5000)
  await picker.getByRole('button', { name: /さらに50件表示/ }).click()
  await expect(options).toHaveCount(100)
  await picker.getByPlaceholder('ルアー名・カラー・メーカーで検索').fill('レッド 1399')
  await expect(options).toHaveCount(1)
  await picker.getByRole('button', { name: '✕', exact: true }).click()
  const dimensions: { width: number; minWidth: number; minHeight: number }[] = []
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const editor = modal.getByRole('region', { name: 'ビジュアルカラー入力' })
    const bounds = await editor.locator('.swatches button').evaluateAll(buttons => {
      const rects = buttons.map(b => b.getBoundingClientRect())
      return { minWidth: Math.min(...rects.map(r => r.width)), minHeight: Math.min(...rects.map(r => r.height)) }
    })
    expect(bounds.minWidth).toBeGreaterThanOrEqual(44); expect(bounds.minHeight).toBeGreaterThanOrEqual(44)
    expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await editor.getByRole('button', { name: 'レッド', exact: true }).click()
    await expect(editor.getByRole('button', { name: 'レッド', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await editor.getByRole('button', { name: 'レッド', exact: true }).click()
    dimensions.push({ width, ...bounds })
  }
  await info.attach('synthetic-2899-performance', { body: JSON.stringify({ openMs, modelMs, profiles: 1400, variants: 2899, dimensions }, null, 2), contentType: 'application/json' })
  await modal.getByRole('button', { name: 'キャンセル', exact: true }).click()
})
