import { test, expect, chromium } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rc43Fixture } from '../rc43Fixture'
import { openRc43Manager, uploadRc43Photo, openRc43CatchPicker } from '../rc43UiHelpers'
import { origin, url, offlineReady, offlineState } from './masterCatalogRegression'

test('RC43 shared local photos survive offline cold restart; missing photos keep SVG and one external link without blocking selection', async ({}, info) => {
  await fetch(`${origin}/__test/version?v=A`, { method: 'POST' })
  const profile = await mkdtemp(join(tmpdir(), 'fishing-rc43-')), mobile = info.project.name.includes('mobile')
  const launch = (offline = false) => chromium.launchPersistentContext(profile, { offline, serviceWorkers: 'allow',
    viewport: mobile ? { width: 402, height: 874 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile })
  let context = await launch()
  try {
    let page = context.pages()[0]!; await page.goto(url); await offlineReady(page)
    page.on('dialog', d => d.accept())
    await page.getByTestId('restore-backup').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rc43Fixture())) })
    await expect.poll(async () => (await offlineState(page)).lureVariants!.length).toBe(688)
    const manager = await openRc43Manager(page)
    await uploadRc43Photo(page)
    await manager.getByRole('button', { name: '写真管理を閉じる' }).click()
    await page.getByRole('button', { name: '辞書を閉じる' }).click()
    const before = await offlineState(page)
    await context.close(); context = await launch(true); page = context.pages()[0]!; await page.goto(url)
    const { modal, picker, card } = await openRc43CatchPicker(page)
    const image = card.getByRole('img', { name: /表面写真/ })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect(card.getByRole('link', { name: '写真を見る' })).toHaveCount(0)
    await card.getByRole('button', { name: /表面写真を拡大/ }).click()
    await expect(page.getByRole('dialog', { name: 'カラー写真の拡大' }).getByRole('img')).toBeVisible()
    await page.getByRole('button', { name: '写真を閉じる', exact: true }).click()
    await card.getByRole('button', { name: '裏', exact: true }).click()
    await expect(card.getByRole('img', { name: '配色プレビュー', exact: true })).toBeVisible()
    await expect(card.getByRole('link', { name: '写真を見る' })).toHaveAttribute('target', '_blank')
    await expect(card).toContainText('オフライン：接続後に開けます')
    await card.getByRole('button', { name: /NOA 1\.8g/ }).click()
    await expect(picker).not.toBeVisible()
    await expect(modal.getByLabel('メモ（任意）')).toHaveValue('入力中のメモを保持')
    expect(await offlineState(page)).toEqual(before)
  } finally { await context.close() }
})
