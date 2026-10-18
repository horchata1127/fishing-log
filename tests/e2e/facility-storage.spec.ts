import { test, expect, restoreViaUI } from './fixtures'

// Only synthetic rows and the local E2E origin. No production profile or backup file.
const facility = { id: 'official:e2e-f', name: '架空施設', prefecture: '長野県', address: null,
  facilityTypes: ['pond'], lureAllowed: true, operationStatus: 'open', officialUrl: null, sourceUrl: null,
  verifiedAt: null, aliases: [], zones: [{ id: 'official:e2e-z', name: '架空エリア', sortOrder: 1, sourceUrl: null }] }
// Synthetic updates start after the real initial release; never weaken same-number conflict checks.
const master = (releaseOrder = 2) => ({ schemaVersion: 1, masterVersion: `sample-${releaseOrder}`, distributionMode: 'full', releaseOrder, facilities: [facility] })
const modules = { database: '/fishing-log/src/db/database.ts', storage: '/fishing-log/src/utils/facilityStorage.ts', backup: '/fishing-log/src/utils/backup.ts' }

test('v6 restore retains current user rows, round trips references and rejects conflicts atomically', async ({ page }) => {
  const backup = await page.evaluate(async ({ modules, master }) => {
    const { db } = await import(modules.database), { applyFacilityMaster } = await import(modules.storage)
    await applyFacilityMaster(master)
    await db.facilities.put({ id: 'user:source', name: 'ユーザー架空施設', origin: 'user' })
    await db.zones.put({ id: 'user:source-zone', name: 'ユーザー架空エリア', origin: 'user', facilityId: 'official:e2e-f' })
    await db.trips.put({ id: 40, fishingAreaName: '架空', fishingDate: '2026-10-11', startedAt: new Date('2026-10-11T01:00:00Z'), facilityId: 'official:e2e-f', currentZoneId: 'official:e2e-z' })
    await db.catches.put({ id: 80, tripId: 40, caughtAt: new Date('2026-10-11T02:00:00Z'), facilityId: 'official:e2e-f', zoneId: 'official:e2e-z', locationSnapshot: { facilityName: '保存時名称' } })
    return JSON.parse(JSON.stringify(await (await import(modules.backup)).createBackup()))
  }, { modules, master: master() })
  expect(backup.version).toBe(6)
  await page.evaluate(async modules => {
    const { db } = await import(modules.database)
    await db.facilities.put({ id: 'user:kept', name: '端末側の架空施設', origin: 'user' })
    await db.trips.clear(); await db.catches.clear()
  }, modules)
  await restoreViaUI(page, backup)
  const state = () => page.evaluate(async modules => {
    const { db } = await import(modules.database)
    return JSON.parse(JSON.stringify(Object.fromEntries(await Promise.all(db.tables.map(async (t: any) => [t.name, await t.toArray()])))))
  }, modules)
  const saved = await state()
  expect(saved.facilities.map((r: any) => r.id)).toContain('user:kept')
  expect(saved.catches[0].locationSnapshot.facilityName).toBe('保存時名称')
  backup.data.facilities.find((r: any) => r.id === 'user:source').name = '衝突'
  await restoreViaUI(page, backup, '衝突')
  expect(await state()).toEqual(saved)
  await page.reload(); expect(await state()).toEqual(saved)
})

test('separate tabs serialize official updates and preserve highest release', async ({ page, context }) => {
  const other = await context.newPage(); await other.goto('/fishing-log/')
  const apply = (tab: typeof page, release: number) => tab.evaluate(async ({ modules, master }) => {
    try { await (await import(modules.storage)).applyFacilityMaster(master); return 'ok' }
    catch (error) { return String(error) }
  }, { modules, master: master(release) })
  const results = await Promise.all([apply(page, 3), apply(other, 2)])
  expect(results[0]).toBe('ok')
  expect(await page.evaluate(async modules => (await (await import(modules.database)).db.appMetadata.get('facilityMaster')).releaseOrder, modules)).toBe(3)
  await other.close()
})

test('blocked upgrade and versionchange preserve form input and stop stale saves', async ({ page }) => {
  await page.getByRole('button', { name: '新しい釣行を開始' }).click()
  await page.getByLabel('釣り場', { exact: true }).fill('編集中の架空釣り場')
  const result = await page.evaluate(async modules => {
    const { db, databaseConnection } = await import(modules.database)
    // An unmanaged legacy connection deliberately blocks the upgrade; close only after onblocked.
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('FishingLogDatabase'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    old.onversionchange = () => {}
    let blocked = false
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('FishingLogDatabase', 80)
      request.onblocked = () => { blocked = true; old.close() }
      request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result)
    })
    let staleSave = ''
    try { await db.trips.add({ fishingAreaName: '未保存', fishingDate: '2026-10-11', startedAt: new Date() }) }
    catch (error) { staleSave = (error as Error).name }
    upgraded.close()
    return { blocked, state: databaseConnection.state, staleSave }
  }, modules)
  expect(result).toEqual({ blocked: true, state: 'changed', staleSave: 'DatabaseClosedError' })
  await expect(page.getByRole('alert')).toContainText('この画面からは保存できません')
  await expect(page.getByLabel('釣り場', { exact: true })).toHaveValue('編集中の架空釣り場')
})
