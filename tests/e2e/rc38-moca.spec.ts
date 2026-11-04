import { readFile } from 'node:fs/promises'
import { test, expect, restoreViaUI, readAllState } from './fixtures'
import { rc37Fixture } from '../rc37Fixture'
import { checkMaster, applyMaster, masterHome } from '../masterUiHelpers'

test('RC38 explicit ownership, duplicate prevention, catch edit, MVP and PNG use DR-F rattle / tea', async ({ page }, info) => {
  test.setTimeout(90000)
  await restoreViaUI(page, rc37Fixture())
  const before = await readAllState(page)
  await checkMaster(page); await applyMaster(page)
  const applied = await readAllState(page)
  expect(applied.catches).toEqual(before.catches); expect(applied.myLures).toEqual(before.myLures)
  const model = applied.lureModels!.find(m => m.name === 'MOCA DR-F Rattle 2HOOK')!
  const tea = applied.lureVariants!.find(v => v.modelId === model.id && v.colorName === 'さちおの茶')!
  expect(tea.catalogEvidence.jan).toBe('4573151245423')
  await masterHome(page)
  await page.getByRole('button', { name: /マイルアー/, exact: false }).click()
  const choose = async () => {
    for (const [group, label] of [['メーカー', 'RODIO CRAFT'], ['シリーズ', 'MOCA'], ['モデル', model.name], ['カラー', 'さちおの茶']]) {
      await page.getByRole('group', { name: `${group}の候補`, exact: true }).getByRole('button', { name: label, exact: true }).click()
    }
    await page.getByRole('button', { name: '＋ マイルアーに登録', exact: true }).click()
    await expect(page.getByRole('group', { name: 'メーカーの候補', exact: true })).toBeVisible()
  }
  await choose(); await choose()
  const owned = await readAllState(page)
  expect(owned.myLures!.filter(l => l.variantId === tea.id)).toHaveLength(1)
  expect(owned.myLures).toHaveLength(before.myLures!.length + 1)
  await page.getByRole('button', { name: /戻る/ }).click()
  await page.locator('.trip-row[data-trip-id="1"]').click()
  const history = page.getByRole('region', { name: '釣果履歴', exact: true })
  await history.getByRole('button', { name: '編集', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '釣果を編集', exact: true })
  await modal.getByRole('button', { name: '変更', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'ルアーを選択', exact: true })
  await picker.getByRole('button', { name: 'カタログ', exact: true }).click()
  await picker.getByLabel('モデルを選んでからカラーを選択').selectOption(String(model.id))
  await picker.getByRole('button', { name: /さちおの茶/ }).click()
  await modal.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(modal).not.toBeVisible()
  const edited = await readAllState(page)
  expect(edited.catches![0]).toMatchObject({ id: 1, tripId: 1, caughtAt: before.catches![0]!.caughtAt,
    lureVariantId: tea.id, lureName: model.name, lureColor: 'さちおの茶' })
  expect(edited.myLures).toEqual(owned.myLures)
  const panel = page.getByRole('region', { name: '釣行サマリー', exact: true })
  await panel.getByText('MVPを指定・編集', { exact: true }).click()
  await panel.getByLabel('記録したルアーから選ぶ').selectOption({ label: `${model.name} / さちおの茶` })
  await panel.getByRole('button', { name: 'MVPを保存', exact: true }).click()
  await expect(panel.locator('.mvp-display')).toContainText('さちおの茶')
  await panel.getByText('サマリー画像・共有', { exact: true }).click()
  await expect(page.locator('[data-report-card]')).toContainText(model.name)
  await expect(page.locator('[data-report-card]')).toContainText('さちおの茶')
  await panel.getByRole('button', { name: '画像プレビューを作成', exact: true }).click()
  await expect(panel.getByRole('img', { name: '釣行レポートPNGのプレビュー' })).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: '画像で保存', exact: true }).click()])
  const path = info.outputPath('rc38-tea-summary.png'); await download.saveAs(path)
  expect((await readFile(path)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
})
