import { test, expect, restoreViaUI } from './fixtures'
import { timelineScenario, timelineState } from '../timelineFixture'
import { weatherTripName } from '../weatherFixture'

test('RC26 ended catch area edits preserve seven catches and pace, update filter without reload, cancel and rollback safely', async ({ page }, info) => {
  await restoreViaUI(page, timelineScenario())
  const before = await timelineState(page)
  await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
  const graph = page.getByRole('region', { name: '統合タイムライン', exact: true }), modal = page.getByRole('dialog', { name: '釣果を編集', exact: true })
  const edit = () => page.getByRole('region', { name: '釣果履歴', exact: true }).getByRole('button', { name: '編集', exact: true }).first().click()
  const area = () => modal.getByLabel('釣り場内のエリア', { exact: true })
  await edit(); await area().selectOption('official:nihon-iwana-center:zero-1')
  await modal.getByRole('button', { name: 'キャンセル', exact: true }).click(); expect(await timelineState(page)).toEqual(before)
  for (const zone of ['', 'official:nihon-iwana-center:zero-1', 'official:nihon-iwana-center:pond-9']) {
    await edit(); await area().selectOption(zone); await modal.getByRole('button', { name: '保存する', exact: true }).click(); await expect(modal).toHaveCount(0)
    await expect(graph.locator('.catch-summary')).toContainText('総釣果：7匹'); await expect(graph.locator('.catch-summary')).toContainText('0.75匹/時')
    if (zone.includes('zero-1')) {
      await graph.getByLabel('釣果・バラシのエリア').selectOption('id:'+zone)
      await expect(graph.locator('.catch-summary')).toContainText('表示中：1匹／全体：7匹')
      expect(await graph.locator('.hour-bar').evaluateAll(nodes => nodes.reduce((n,e) => n + Number((e as HTMLElement).dataset.count),0))).toBe(1)
      await expect(graph.locator('.timeline-marker.catch')).toHaveCount(1)
      await graph.getByLabel('釣果・バラシのエリア').selectOption('all')
    }
    await edit(); await expect(area()).toHaveValue(zone); await modal.getByRole('button', { name: 'キャンセル', exact: true }).click()
  }
  const saved = await timelineState(page)
  for (const name of Object.keys(before)) expect(saved[name]).toEqual(before[name])
  await edit(); await area().selectOption('official:nihon-iwana-center:zero-1')
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) { if (this.name === 'catches') throw new DOMException('RC26保存障害','UnknownError'); return original.apply(this,args) } })
  const messages: string[] = []; page.on('dialog', async d => { messages.push(d.message()); await d.accept() })
  await modal.getByRole('button', { name: '保存する', exact: true }).click()
  await expect.poll(() => messages.join()).toContain('RC26保存障害'); await expect(modal).toBeVisible(); expect(await timelineState(page)).toEqual(saved)
  await area().scrollIntoViewIfNeeded(); await modal.screenshot({ path: info.outputPath('catch-area-edit.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('RC26 unresolved historical area survives unrelated save; no-facility lost record shows an unset area field', async ({ page }) => {
  await restoreViaUI(page, timelineScenario())
  await page.evaluate(async () => {
    const path = '/fishing-log/src/db/database.ts', { db } = await import(path)
    await db.catches.update(95006, { zoneId: 'user:unresolved', locationSnapshot: { facilityName: '旧施設名', zoneName: '旧エリア名' }, resultType: 'lost', lostDistance: 'near' })
  })
  const before = await timelineState(page)
  await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
  const edit = () => page.getByRole('region', { name: '釣果履歴', exact: true }).getByRole('button', { name: '編集', exact: true }).first().click()
  const modal = page.getByRole('dialog', { name: '釣果を編集', exact: true })
  await edit(); await expect(modal.getByLabel('釣り場内のエリア', { exact: true })).toHaveValue('user:unresolved')
  await expect(modal.getByText(/既存エリアを解決できません/)).toBeVisible()
  await modal.getByRole('button', { name: '保存する', exact: true }).click(); await expect(modal).toHaveCount(0)
  expect(await timelineState(page)).toEqual(before)
  await page.evaluate(async () => {
    const path = '/fishing-log/src/db/database.ts', { db } = await import(path)
    await db.trips.update(95000, { facilityId: undefined, currentZoneId: undefined })
    await db.catches.update(95006, { facilityId: undefined, zoneId: undefined, locationSnapshot: undefined })
  })
  await page.reload(); await page.getByRole('button', { name: new RegExp(weatherTripName.replace(/[（）]/g, '.')) }).click()
  const legacy = await timelineState(page)
  await edit(); await expect(modal.getByLabel('釣り場内のエリア', { exact: true })).toHaveValue('')
  await expect(modal.getByText(/釣行に施設IDがないため/)).toBeVisible()
  await modal.getByRole('button', { name: '保存する', exact: true }).click(); await expect(modal).toHaveCount(0)
  expect(await timelineState(page)).toEqual(legacy)
})
