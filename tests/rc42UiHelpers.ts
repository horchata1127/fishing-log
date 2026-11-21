import { expect, type Page } from '@playwright/test'
import { rc42Audit } from './rc42Fixture'

export async function checkRc42Dictionary(page: Page) {
  await page.getByRole('button', { name: 'ビジュアルカラー辞書', exact: true }).click()
  const dictionary = page.getByRole('dialog', { name: 'ビジュアルカラー辞書', exact: true })
  for (const m of rc42Audit.models) {
    await dictionary.getByLabel('辞書モデル').selectOption(String(m.existingModel.id))
    await expect(dictionary.locator('article[data-variant-id]')).toHaveCount(m.colors.length)
    for (const c of m.colors) await expect(dictionary.locator(`article[data-variant-id="${c.existing[0].id}"]`)).toContainText(c.existing[0].colorName)
  }
  await dictionary.getByRole('button', { name: '辞書を閉じる', exact: true }).click()
}

export async function checkRc42Selectors(page: Page) {
  await page.getByRole('button', { name: /マイルアー/, exact: false }).click()
  for (const [group, label] of [['メーカー', 'ダイワ'], ['シリーズ', 'PRESSO DOUBLE CLUTCH F']]) {
    await page.getByRole('group', { name: `${group}の候補`, exact: true }).getByRole('button', { name: label, exact: true }).click()
  }
  for (const m of rc42Audit.models) {
    await page.locator('.step-tabs').getByRole('button', { name: /^モデル/ }).click()
    await page.getByRole('group', { name: 'モデルの候補', exact: true }).getByRole('button', { name: m.existingModel.name, exact: true }).click()
    const colors = page.getByRole('group', { name: 'カラーの候補', exact: true })
    for (const c of m.colors) await expect(colors.getByRole('button', { name: c.existing[0].colorName, exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: /戻る/ }).click()
  await page.locator('.trip-row[data-trip-id="1"]').click()
  await page.getByRole('region', { name: '釣果履歴', exact: true }).getByRole('button', { name: '編集', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '釣果を編集', exact: true })
  await editor.getByRole('button', { name: '変更', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'ルアーを選択', exact: true })
  await picker.getByRole('button', { name: 'カタログ', exact: true }).click()
  for (const m of rc42Audit.models) {
    await picker.getByLabel('モデルを選んでからカラーを選択').selectOption(String(m.existingModel.id))
    await expect(picker.locator('.picker-lure-button:has(.picker-lure-main)')).toHaveCount(m.colors.length)
    for (const c of m.colors) await expect(picker.locator('.picker-lure-button').filter({ hasText: c.existing[0].colorName }).first()).toBeVisible()
  }
  await picker.getByRole('button', { name: '✕', exact: true }).click()
  await editor.getByRole('button', { name: 'キャンセル', exact: true }).click()
}
