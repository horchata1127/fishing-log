import type { Page } from '@playwright/test'
import { test, expect, catalogFixture, restoreViaUI, selectCatalog, saveCatch, readState } from './fixtures'

async function inspect(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  const failures = await page.locator('h1, h2, h3, legend, label, .hint, .empty, .label, .note, [role="status"]').evaluateAll(elements => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number)
    const luminance = (values: number[]) => values.slice(0, 3).map(v => {
      const n = v / 255
      return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4
    }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0)
    return elements.filter(element => element.getClientRects().length).flatMap(element => {
      const style = getComputedStyle(element)
      let ancestor: Element | null = element
      let background = [255, 255, 255]
      while (ancestor) {
        const color = rgb(getComputedStyle(ancestor).backgroundColor)
        if (color.length === 3 || color[3] === 1) { background = color; break }
        ancestor = ancestor.parentElement
      }
      const foreground = luminance(rgb(style.color)), back = luminance(background)
      const ratio = (Math.max(foreground, back) + .05) / (Math.min(foreground, back) + .05)
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700)
      return ratio < (large ? 3 : 4.5) ? [{ text: element.textContent?.trim(), ratio }] : []
    })
  })
  expect(failures, '見出し・ラベル・補足文のAAコントラスト').toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: 画面の配色・日付幅・モーダルスクロール`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme })
    const check = async (name: string) => {
      await page.screenshot({ path: testInfo.outputPath(`after-${name}.png`), fullPage: true })
      await inspect(page)
    }
    await restoreViaUI(page, catalogFixture())
    await check('home')
    for (const name of ['🎣 マイルアー', 'タックル管理', '魚種マスター管理']) {
      await page.getByRole('button', { name, exact: true }).click()
      await check(name === '🎣 マイルアー' ? 'my-lures' : name === 'タックル管理' ? 'tackles' : 'fish-species')
      await page.getByRole('button', { name: '← 戻る', exact: true }).click()
    }
    await page.getByRole('button', { name: '新しい釣行を開始' }).click()
    await page.getByLabel('釣り場', { exact: true }).fill('UI確認用釣り場')
    await check('new-trip')
    {
      const date = page.locator('input[type="date"]')
      await date.fill('2026-10-10')
      const bounds = await date.evaluate(element => {
        const input = element.getBoundingClientRect(), parent = element.closest('.card')!.getBoundingClientRect()
        return { left: input.left, right: input.right, parentLeft: parent.left, parentRight: parent.right }
      })
      expect(bounds.left).toBeGreaterThanOrEqual(bounds.parentLeft)
      expect(bounds.right).toBeLessThanOrEqual(bounds.parentRight)
      await expect(date).toHaveValue('2026-10-10')
    }
    await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
    await check('fishing')
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '釣果を登録', exact: true })
    await check('catch')
    await dialog.getByRole('button', { name: 'ルアーを選ぶ' }).click()
    await check('lure-picker')
    await page.getByRole('dialog', { name: 'ルアーを選択', exact: true }).getByRole('button', { name: '✕', exact: true }).click()
    await selectCatalog(page)
    const save = dialog.getByRole('button', { name: '保存する', exact: true })
    await save.scrollIntoViewIfNeeded()
    await expect(save).toBeInViewport()
    if (testInfo.project.use.isMobile) expect(await dialog.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    await saveCatch(page)
    const state = await readState(page)
    expect(state.catches).toHaveLength(1)
    await page.reload()
    expect(await readState(page)).toEqual(state)
  })
}
