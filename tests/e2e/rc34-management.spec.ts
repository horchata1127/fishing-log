import { test, expect, catalogFixture, restoreViaUI, readAllState } from './fixtures'
import { openMaster, checkMaster, prepareMaster, applyMaster, masterHome } from '../masterUiHelpers'

test('one home entrance, offline-bundled development history for all RCs, bounded models, CSV and saved-backup cancellation', async ({ page }, info) => {
  await restoreViaUI(page, catalogFixture()); const before = await readAllState(page)
  await expect(page.getByRole('button', { name: /^RC\d+.*(?:追加|確認)/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ルアーマスター管理', exact: true })).toHaveCount(1)
  const screen = await openMaster(page)
  await screen.getByRole('button', { name: '取り込み履歴', exact: true }).click()
  await expect(screen).toContainText('この端末には取り込み履歴がありません')
  await openMaster(page); await screen.getByRole('button', { name: '開発履歴', exact: true }).click()
  const entries = screen.locator('details[data-rc]'); await expect(entries).toHaveCount(15)
  expect(await entries.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-rc')))).toEqual(Array.from({ length: 15 }, (_, i) => String(33 - i)))
  for (let rc = 19; rc <= 33; rc++) { const entry = screen.locator(`[data-rc="${rc}"]`); await entry.locator('summary').click(); await expect(entry.locator('p').first()).toBeVisible() }
  await expect(screen.getByRole('button', { name: /実行|適用/ })).toHaveCount(0)
  const preview = await checkMaster(page)
  await expect(preview).toContainText('所有オプション：OFF')
  await preview.locator('summary').filter({ hasText: 'モデル別の予定' }).click()
  await expect(preview.locator('[data-model]')).toHaveCount(5)
  await preview.getByRole('button', { name: '次のモデル', exact: true }).click(); await expect(preview.locator('[data-model]')).toHaveCount(5)
  const [csv] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: '差分予定をCSVで保存', exact: true }).click()])
  await csv.saveAs(info.outputPath('displayed-plan.csv'))
  await prepareMaster(page); expect(await readAllState(page)).toEqual(before)
  await screen.getByLabel('RC33の購入指定もマイルアーへ登録する', { exact: true }).check()
  await expect(preview).toContainText('所有オプション：ON')
  await expect(preview.getByRole('button', { name: '確認して更新を実行', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '更新を取り消す', exact: true }).click()
  expect(await readAllState(page)).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('actual results match persisted history, ownership OFF/ON, repeat zero and restored context stays distinct', async ({ page }) => {
  await restoreViaUI(page, catalogFixture()); const before = await readAllState(page)
  await checkMaster(page); const result = await applyMaster(page)
  const saved = await readAllState(page), run = saved.lureMasterImportHistory![0]!
  expect(saved.myLures).toEqual(before.myLures)
  for (const [name, count] of Object.entries(run.counts) as [string, { added: number }][]) expect(saved[name]!.length - before[name]!.length).toBe(count.added)
  await expect(result).toContainText('保留あり成功')
  await page.getByRole('button', { name: '今回の取り込み履歴を確認', exact: true }).click()
  const record = page.locator(`[data-history-id="${run.id}"]`)
  await expect(record).toContainText(run.masterVersion); await expect(record).toContainText(String(run.counts.lureVariants.added))
  const localTime = await page.evaluate((iso: string) => new Date(iso).toLocaleString('ja-JP', { hour12: false }), run.startedAt)
  await expect(record).toContainText(localTime)
  await record.getByText('対象データ文脈', { exact: true }).click(); await expect(record).toContainText(run.contextId)
  await checkMaster(page, true); await applyMaster(page)
  expect((await readAllState(page)).myLures!.length - saved.myLures!.length).toBe(11)
  const all = await readAllState(page)
  await checkMaster(page, true); const repeat = await applyMaster(page)
  for (const row of await repeat.locator('tbody tr').all()) expect(await row.locator('td').first().textContent()).toBe('0')
  await expect(repeat).toContainText('保留あり成功')
  await masterHome(page); await restoreViaUI(page, catalogFixture())
  await openMaster(page); await page.getByRole('button', { name: '取り込み履歴', exact: true }).click()
  await expect(page.getByRole('region', { name: 'ルアーマスター取り込み履歴', exact: true })).toContainText('バックアップ復元')
  expect((await readAllState(page)).lureMasterImportHistory!.length).toBe(all.lureMasterImportHistory!.length + 2)
  const preview = await checkMaster(page); await expect(preview.locator('tbody tr').filter({ hasText: 'カラー' }).locator('td')).not.toHaveText('0')
})

for (const mode of ['backup', 'stale', 'apply', 'history']) test(`${mode} failure never reports success or partially writes user data`, async ({ page }) => {
  await restoreViaUI(page, catalogFixture()); await checkMaster(page)
  if (mode !== 'backup') await prepareMaster(page)
  await page.evaluate(async mode => {
    const path = '/fishing-log/src/db/database.ts', { db } = await import(path)
    if (mode === 'stale') { await db.myLures.update(50, { memo: 'another tab' }); return }
    const table = db.table(mode === 'backup' ? 'lureModels' : mode === 'apply' ? 'lureVariants' : 'lureMasterImportHistory')
    const event = mode === 'backup' ? 'reading' : mode === 'apply' ? 'creating' : 'updating'
    table.hook(event, () => { throw new Error(`synthetic ${mode} failure`) })
  }, mode)
  const before = await readAllState(page)
  if (mode === 'backup') await page.getByRole('button', { name: '更新前のバックアップを保存', exact: true }).click()
  else {
    await page.getByLabel('バックアップファイルが保存されていることを確認しました', { exact: true }).check()
    await page.getByRole('button', { name: '確認して更新を実行', exact: true }).click()
  }
  await expect(page.getByRole('alert')).toContainText(mode === 'stale' ? 'もう一度事前確認' : mode === 'backup' ? '更新を開始しませんでした' : mode === 'history' ? '履歴の保存にも失敗' : '更新に失敗')
  await expect(page.getByRole('region', { name: 'マスター更新結果', exact: true })).toHaveCount(0)
  const after = await readAllState(page)
  for (const [name, rows] of Object.entries(before)) if (name !== 'lureMasterImportHistory') expect(after[name]).toEqual(rows)
  if (mode === 'backup') expect(after.lureMasterImportHistory).toEqual([])
  if (mode === 'history') {
    await page.getByRole('button', { name: '取り込み履歴', exact: true }).click()
    await expect(page.getByRole('region', { name: 'ルアーマスター取り込み履歴', exact: true })).toContainText('確認不能')
  }
})

test('legacy JSON remains a separate confirmed compatibility operation', async ({ page }) => {
  await restoreViaUI(page, catalogFixture()); const before = await readAllState(page)
  const screen = await openMaster(page); await screen.getByRole('button', { name: '旧形式データの取り込み', exact: true }).click()
  const data = catalogFixture().data
  const input = { format: 'fishing-log-catalog-seed', version: 1, catalogVersion: '1.0-rc18', data: {
    lureManufacturers: data.lureManufacturers, lureSeries: data.lureSeries, lureModels: data.lureModels,
    lureVariants: [...data.lureVariants, { id: 42, modelId: 30, colorName: '互換追加' }], ownedLures: [{ broken: true }],
  } }
  await screen.locator('input[type="file"]').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) })
  const preview = page.getByRole('region', { name: 'カタログ取り込みの事前確認', exact: true })
  await expect(preview).toContainText('所有情報が含まれています')
  expect(await readAllState(page)).toEqual(before)
  page.once('dialog', dialog => dialog.accept())
  await preview.getByRole('button', { name: '③ 確認したカタログを反映', exact: true }).click()
  await expect(page.locator('.catalog-import [role="status"]')).toContainText('カタログ反映完了')
  const after = await readAllState(page); expect(after.myLures).toEqual(before.myLures)
  expect(after.lureVariants!.length).toBe(before.lureVariants!.length + 1)
})
