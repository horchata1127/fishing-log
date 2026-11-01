import { readFile } from 'node:fs/promises'
import { test, expect, readAllState, restoreViaUI, type Row } from './fixtures'
import { checkMaster, applyMaster, masterHome, prepareMaster } from '../masterUiHelpers'
type Product = { manufacturer: string; manufacturerAliases?: readonly string[]; series: string; seriesAliases?: readonly string[]; model: string; modelAliases?: readonly string[]; productVerified?: boolean; colors: readonly { name: string; code?: string; label?: string; aliases?: readonly string[]; colorClass?: string; jan?: string; verified?: boolean }[] }
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s‐‑–—−#-]/g, '')
const same = (s: string, official: string, aliases: readonly string[] = []) => [official, ...aliases].some(n => norm(n) === norm(s))
export function assertPack(state: Record<string, Row[]>, products: readonly Product[], before: Record<string, Row[]>) {
  for (const target of products) {
    const maker = state.lureManufacturers!.find(m => same(m.name, target.manufacturer, target.manufacturerAliases))
    expect(maker, target.manufacturer).toBeTruthy()
    const parent = state.lureSeries!.find(s => s.manufacturerId === maker!.id && same(s.name, target.series, target.seriesAliases))
    const model = state.lureModels!.find(m => m.seriesId === parent?.id && same(m.name, target.model, target.modelAliases))
    if (target.productVerified === false) {
      expect(state.lureModels!.filter(m => same(m.name, target.model, target.modelAliases))).toEqual(before.lureModels!.filter(m => same(m.name, target.model, target.modelAliases)))
      continue
    }
    expect(model, target.model).toBeTruthy()
    for (const c of target.colors.filter(c => c.verified !== false)) {
      const candidates = state.lureVariants!.filter(v => v.modelId === model!.id).filter(v => {
        if (c.colorClass && v.catalogEvidence && c.colorClass !== v.catalogEvidence.colorClass) return false
        const code = v.catalogEvidence?.colorCode || v.colorName.match(/^#?([A-Za-z]*-?\d+[A-Za-z0-9-]*)\s+/)?.[1]
        return c.code && code ? norm(c.code).replace(/^0+/, '') === norm(code).replace(/^0+/, '') : same(v.catalogEvidence?.originalName || v.colorName, c.name, [c.label ?? c.name, ...c.aliases ?? []])
      })
      expect(candidates.length, `${target.model}/${c.name}`).toBe(1)
      if (c.jan && candidates[0]!.catalogEvidence) expect(candidates[0]!.catalogEvidence.jan).toBe(c.jan)
    }
  }
}
export function registerCatalogRegression(rc: number, fixture: () => unknown, products: readonly Product[], concurrent = false) {
  test(`RC${rc} data through unified preview/cancel/CSV/apply/repeat/reopen/restore`, async ({ page }, info) => {
    test.setTimeout(60000)
    await restoreViaUI(page, fixture())
    const before = await readAllState(page), preview = await checkMaster(page)
    expect(await readAllState(page)).toEqual(before)
    const [download] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: '差分予定をCSVで保存', exact: true }).click()])
    const path = info.outputPath(`rc${rc}-unified-plan.csv`); await download.saveAs(path)
    const csv = await readFile(path, 'utf8'); expect(csv).toContain('sourceRC,sourceUrl'); expect(csv).toContain(`RC${rc}`)
    await preview.getByRole('button', { name: '更新を取り消す', exact: true }).click()
    expect(await readAllState(page)).toEqual(before)
    await checkMaster(page); await applyMaster(page)
    const saved = await readAllState(page)
    for (const [table, rows] of Object.entries(before)) {
      expect(saved[table]).toEqual(expect.arrayContaining(rows))
      if (!['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'lureVisualProfiles', 'lureMasterImportHistory'].includes(table)) expect(saved[table]).toEqual(rows)
    }
    assertPack(saved, products, before)
    await checkMaster(page); const result = await applyMaster(page)
    for (const row of await result.locator('tbody tr').all()) expect(await row.locator('td').first().textContent()).toBe('0')
    const repeated = await readAllState(page)
    for (const [table, rows] of Object.entries(saved)) if (table !== 'lureMasterImportHistory') expect(repeated[table]).toEqual(rows)
    await masterHome(page); await page.reload(); expect(await readAllState(page)).toEqual(repeated)
    const [exported] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📦 データをバックアップ', exact: true }).click()])
    const backupPath = info.outputPath(`rc${rc}-unified-v9.json`); await exported.saveAs(backupPath)
    const backup = JSON.parse(await readFile(backupPath, 'utf8')); expect(backup.version).toBe(9)
    expect(backup.data).toEqual(repeated)
    await restoreViaUI(page, backup)
    const restored = await readAllState(page)
    for (const [table, rows] of Object.entries(repeated)) if (table !== 'lureMasterImportHistory') expect(restored[table]).toEqual(rows)
    expect(restored.lureMasterImportHistory!.length).toBe(repeated.lureMasterImportHistory!.length + 1)
    if (before.catches!.length) {
      const trip = before.trips!.find(t => t.id === before.catches![0]!.tripId)!
      await page.locator(`.trip-row[data-trip-id="${trip.id}"]`).click()
      await page.getByRole('region', { name: '釣果履歴', exact: true }).getByRole('button', { name: '編集', exact: true }).first().click()
      const editor = page.getByRole('dialog', { name: '釣果を編集', exact: true })
      await editor.getByRole('button', { name: '変更', exact: true }).click()
      const picker = page.getByRole('dialog', { name: 'ルアーを選択', exact: true })
      await picker.getByRole('button', { name: 'カタログ', exact: true }).click()
      for (const target of products.filter(t => t.productVerified !== false)) {
        const model = restored.lureModels!.find(m => same(m.name, target.model, target.modelAliases))!
        await picker.getByLabel('モデルを選んでからカラーを選択').selectOption(String(model.id))
        const escaped = model.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const count = restored.lureVariants!.filter(v => v.modelId === model.id).length
        const colors = picker.locator('.picker-lure-button:has(.picker-lure-main)').filter({ hasText: new RegExp(escaped) })
        await expect(colors).toHaveCount(Math.min(50, count))
        for (let shown = 50; shown < count; shown += 50) await picker.getByRole('button', { name: /さらに50件表示/ }).click()
        await expect(colors).toHaveCount(count)
      }
      await picker.getByRole('button', { name: '✕', exact: true }).click(); await editor.getByRole('button', { name: 'キャンセル', exact: true }).click()
      expect(await readAllState(page)).toEqual(restored)
    }
  })
  if (concurrent) test(`RC${rc} unified concurrent confirmation preserves data and commits once`, async ({ page, context }) => {
    test.setTimeout(60000)
    await restoreViaUI(page, fixture()); const before = await readAllState(page), other = await context.newPage()
    await other.goto('/fishing-log/')
    for (const p of [page, other]) { await checkMaster(p); await prepareMaster(p); await p.getByLabel('バックアップファイルが保存されていることを確認しました', { exact: true }).check() }
    await Promise.all([page, other].map(p => p.getByRole('button', { name: '確認して更新を実行', exact: true }).click()))
    await expect.poll(async () => [page, other].map(p => p.getByRole('alert').allTextContents()).reduce(async (a, b) => [...await a, ...await b], Promise.resolve([] as string[]))).toContain('データまたは条件が変わりました。もう一度事前確認してください。')
    const saved = await readAllState(page); assertPack(saved, products, before)
    expect(saved.myLures).toEqual(before.myLures); expect(saved.catches).toEqual(before.catches)
    expect(saved.lureMasterImportHistory!.filter(r => r.status === 'failed')).toHaveLength(1)
    expect(saved.lureMasterImportHistory!.filter(r => r.status === 'succeeded_with_holds')).toHaveLength(1)
    expect(new Set(saved.lureVariants!.map(v => `${v.modelId}/${v.colorName}`)).size).toBe(saved.lureVariants!.length)
    await other.close()
  })
}
