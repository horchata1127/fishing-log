import { test as base, expect, type Page } from '@playwright/test'

export const tableNames = ['trips', 'catches', 'tripEvents', 'lureManufacturers', 'lureSeries',
  'lureModels', 'lureVariants', 'myLures', 'rods', 'reels', 'lines', 'tackleSets'] as const
export type Row = Record<string, any>
export type State = Record<typeof tableNames[number], Row[]>

// 原本・実バックアップは読まない。テストごとに新しい合成データを作る。
export function catalogFixture() {
  const data = Object.fromEntries(tableNames.map(name => [name, []])) as unknown as State
  data.lureManufacturers = [{ id: 10, name: 'E2Eメーカー' }]
  data.lureSeries = [{ id: 20, manufacturerId: 10, name: 'E2Eシリーズ' }]
  data.lureModels = [{ id: 30, seriesId: 20, name: 'E2Eスプーン', category: 'スプーン' }]
  data.lureVariants = [{ id: 40, modelId: 30, colorName: '赤' }, { id: 41, modelId: 30, colorName: '青' }]
  data.myLures = [{ id: 50, variantId: 40, active: true },
    { id: 51, variantId: 40, active: true, ownershipStatus: 'unverified' },
    { id: 52, variantId: 40, active: true, ownershipStatus: 'placeholder' }]
  return { format: 'fishing-log-backup', version: 4, exportedAt: '2026-10-10T00:00:00.000Z', data }
}

/** 独立BrowserContextのDBを読み取り専用で観測。アプリ内部APIへの依存・書き込みなし。 */
export async function readState(page: Page): Promise<State> {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:4177') throw new Error('E2E専用origin以外へのDBアクセスを拒否')
  return page.evaluate(async names => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('FishingLogDatabase')
      request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('アプリがDBを作成していません')) }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
    try {
      return await new Promise<State>((resolve, reject) => {
        const transaction = database.transaction(names, 'readonly')
        const data = {} as State
        for (const name of names) {
          const request = transaction.objectStore(name).getAll()
          request.onsuccess = () => { data[name] = request.result }
        }
        transaction.oncomplete = () => resolve(JSON.parse(JSON.stringify(data)))
        transaction.onabort = () => reject(transaction.error)
        transaction.onerror = () => reject(transaction.error)
      })
    } finally { database.close() }
  }, [...tableNames])
}

export const test = base.extend<{ isolatedApp: void }>({
  isolatedApp: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://127.0.0.1:4177') return route.continue()
      return route.abort()
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '🎣 Fishing Log', exact: true })).toBeVisible()
    await expect.poll(async () => Object.values(await readState(page)).every(rows => rows.length === 0)).toBe(true)
    await use()
    expect(errors, '未処理のブラウザ例外').toEqual([])
  }, { auto: true }],
})
export { expect }

export async function restoreViaUI(page: Page, backup: unknown, expectedMessage = 'バックアップから復元したで！') {
  const messages: string[] = []
  const handler = async (dialog: import('@playwright/test').Dialog) => {
    messages.push(dialog.message())
    await dialog.accept()
  }
  page.on('dialog', handler)
  try {
    await page.getByTestId('restore-backup').setInputFiles({ name: 'e2e-backup.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await expect.poll(() => messages.length).toBe(2)
    expect(messages[0]).toContain('現在のデータはすべて置き換わる')
    expect(messages[1]).toContain(expectedMessage)
    await expect(page.getByRole('main')).not.toHaveAttribute('inert')
  } finally { page.off('dialog', handler) }
}

export async function startTrip(page: Page, setName?: string) {
  await page.getByRole('button', { name: '新しい釣行を開始' }).click()
  await page.getByLabel('釣り場', { exact: true }).fill('E2Eニレ池')
  if (setName) await page.getByLabel(setName, { exact: true }).check()
  await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
  await expect(page.getByRole('button', { name: '🎣 釣れた！', exact: true })).toBeVisible()
}

export async function selectCatalog(page: Page, color = '赤') {
  const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
  await modal.getByRole('button', { name: 'ルアーを選ぶ' }).click()
  const picker = page.getByRole('dialog', { name: 'ルアーを選択', exact: true })
  await picker.getByRole('button', { name: 'カタログ', exact: true }).click()
  await picker.getByLabel('モデルを選んでからカラーを選択').selectOption('30')
  await picker.getByRole('button', { name: `E2Eスプーン ${color} E2Eメーカー ・ E2Eシリーズ`, exact: true }).click()
  await expect(picker).not.toBeVisible()
}

export async function saveCatch(page: Page) {
  await page.getByRole('dialog', { name: '釣果を登録', exact: true }).getByRole('button', { name: '保存する', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '釣果を登録', exact: true })).not.toBeVisible()
}

export async function registerTackleSet(page: Page) {
  await page.getByRole('button', { name: 'タックル管理', exact: true }).click()
  await page.getByRole('button', { name: '初期候補8件を登録', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('8件追加')
  await expect(page.getByRole('heading', { name: 'ロッド一覧（2件）', exact: true })).toBeVisible()
  const data = await readState(page)
  expect([data.rods.length, data.reels.length, data.lines.length, data.tackleSets.length]).toEqual([2, 3, 3, 0])
  await page.getByRole('button', { name: '初期候補8件を登録', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('0件追加')
  expect(await readState(page)).toEqual(data)
  await page.getByRole('button', { name: 'ライン', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'ライン一覧（3件）', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'リール', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'リール一覧（3件）', exact: true })).toBeVisible()
  const reel = page.getByRole('article').filter({ hasText: 'ヴァンキッシュ' })
  await reel.getByRole('button', { name: '編集', exact: true }).click()
  await page.getByRole('combobox', { name: '現在のメインライン（任意）', exact: true }).selectOption({ label: 'ナイロン / 3lb' })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(reel).toContainText('現在のメインライン：ナイロン / 3lb')
  await page.getByRole('button', { name: 'セット', exact: true }).click()
  await page.getByLabel('セット名（必須）', { exact: true }).fill('クランク用①')
  await page.getByRole('combobox', { name: 'ロッド（必須）', exact: true }).selectOption({ label: 'Palms / クワトロ Universal IV / QFRGS-48XUL' })
  await page.getByRole('combobox', { name: 'リール（必須）', exact: true }).selectOption({ label: 'SHIMANO / ヴァンキッシュ' })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('article')).toContainText('クランク用①')
  await page.getByRole('button', { name: '← 戻る', exact: true }).click()
}
