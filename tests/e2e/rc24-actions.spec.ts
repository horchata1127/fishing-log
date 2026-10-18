import { test, expect, readCompleteState, restoreViaUI, saveCatch } from './fixtures'
import { stage6Backup } from '../stage6Fixture'
import { rc24Fixture } from '../rc24Fixture'

const added = ['マジックジャーク', 'デジ巻き', 'ボトムノック', 'ボトムバンプ', 'ボトムトレース', 'ドリフト', 'ダート', 'ボトムステイ']
const old = ['ただ巻き', 'ストップ＆ゴー', 'トゥイッチ', 'ジャーク', 'シェイク', 'シミーフォール', 'シミーアップ', 'リフト＆フォール', 'ステイ', 'その他']
const lengths = ['short', 'normal', 'long']

test('RC24 all new actions, catch/lost switches, editing, previous shortcut and Iwana snapshots survive reload', async ({ page }) => {
  await restoreViaUI(page, stage6Backup())
  const original = await readCompleteState(page)
  await page.getByRole('button', { name: '新しい釣行を開始' }).click()
  await page.getByLabel('施設を検索', { exact: true }).fill('イワナ')
  await page.getByLabel('管理釣り場', { exact: true }).selectOption('official:nihon-iwana-center')
  await page.getByLabel('エリア（任意）', { exact: true }).selectOption('official:nihon-iwana-center:pond-9')
  await page.getByRole('button', { name: '🎣 釣行開始', exact: true }).click()
  const history = page.getByRole('region', { name: '釣果履歴' })
  for (const [i, action] of added.entries()) {
    if (i === 4) await page.getByRole('group', { name: '現在のエリア', exact: true }).getByLabel('現在のエリア', { exact: true }).selectOption('official:nihon-iwana-center:zero-2')
    await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
    const actions = modal.getByLabel('アクション', { exact: true }), length = modal.getByLabel('アクションの長さ', { exact: true })
    await expect(actions).toBeVisible()
    const options = await actions.locator('option').allTextContents()
    expect(new Set(options).size).toBe(19)
    expect([...options].sort()).toEqual(['未選択', ...old, ...added].sort())
    await expect(actions).not.toHaveAttribute('multiple')
    await expect(length).toHaveValue('normal')
    await actions.selectOption(action); await length.selectOption(lengths[i % 3]!)
    if (i % 2) {
      await modal.getByRole('button', { name: 'バラシ', exact: true }).click()
      await modal.getByRole('button', { name: '沖', exact: true }).click()
      await modal.getByRole('button', { name: 'キャッチ', exact: true }).click()
      await modal.getByRole('button', { name: 'バラシ', exact: true }).click()
      await expect(actions).toHaveValue(action); await expect(length).toHaveValue(lengths[i % 3]!)
    }
    await saveCatch(page)
    await history.getByRole('button', { name: '編集', exact: true }).first().click()
    const editor = page.getByRole('dialog', { name: '釣果を編集', exact: true })
    await expect(editor.getByLabel('アクション', { exact: true })).toHaveValue(action)
    await expect(editor.getByLabel('アクションの長さ', { exact: true })).toHaveValue(lengths[i % 3]!)
    await editor.getByLabel('アクションの長さ', { exact: true }).selectOption(lengths[(i + 1) % 3]!)
    await editor.getByRole('button', { name: '保存する', exact: true }).click()
    await expect(editor).not.toBeVisible()
  }
  const saved = await readCompleteState(page)
  const oldIds = new Set(original.catches!.map(r => r.id)), created = saved.catches!.filter(r => !oldIds.has(r.id))
  expect(created).toHaveLength(8)
  for (const [i, record] of created.entries()) {
    expect(record.action).toBe(added[i]); expect(record.actionLength).toBe(lengths[(i + 1) % 3])
    expect(record.resultType).toBe(i % 2 ? 'lost' : 'catch')
    expect(record.locationSnapshot).toEqual({ facilityName: '日本イワナセンター', zoneName: i < 4 ? '9号池' : 'ZERO号池第2' })
  }
  for (const [name, rows] of Object.entries(original)) {
    const pk = name === 'fishSpecies' ? 'fish_id' : name === 'appMetadata' ? 'key' : 'id'
    for (const row of rows) expect(saved[name]!.find(r => r[pk] === row[pk])).toEqual(row)
  }
  expect(saved.myLures).toEqual(original.myLures)
  await page.reload(); await expect(page.getByRole('main')).not.toHaveAttribute('inert')
  expect(await readCompleteState(page)).toEqual(saved)
  await page.getByRole('button', { name: /日本イワナセンター/ }).click()
  await expect(history.getByText('アクション: マジックジャーク / 長さ: 普通', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '釣果を登録', exact: true })
  await modal.getByRole('button', { name: /前回と同じ/ }).click(); await expect(modal).not.toBeVisible()
  const copied = (await readCompleteState(page)).catches!.at(-1)!
  expect(copied.action).toBe('ボトムステイ'); expect(copied.actionLength).toBe('long')
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  await expect(modal.getByLabel('アクションの長さ', { exact: true })).toHaveValue('normal')
  await modal.getByRole('button', { name: 'キャンセル', exact: true }).click()
})

test('RC24 legacy unknown actions and absent lengths survive narrow dark UI, cancel, unrelated edits and copying', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 }); await page.emulateMedia({ colorScheme: 'dark' })
  const fixture = rc24Fixture()
  await restoreViaUI(page, fixture)
  const before = await readCompleteState(page)
  await page.getByRole('button', { name: /RC24旧記録/ }).click()
  const row = page.getByRole('region', { name: '釣果履歴' }).locator('.catch-row').filter({ hasText: 'ユーザー独自の旧アクション' })
  await row.getByRole('button', { name: '編集', exact: true }).click()
  const modal = page.getByRole('dialog', { name: '釣果を編集', exact: true })
  await expect(modal.getByLabel('アクション', { exact: true })).toHaveValue('ユーザー独自の旧アクション')
  await expect(modal.getByLabel('アクションの長さ', { exact: true })).toHaveValue('normal')
  await modal.getByLabel('アクション', { exact: true }).selectOption('マジックジャーク')
  await modal.getByLabel('アクションの長さ', { exact: true }).selectOption('long')
  const save = modal.getByRole('button', { name: '保存する', exact: true })
  await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport()
  expect(await modal.evaluate(el => el.scrollHeight > el.clientHeight && el.scrollTop > 0)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await modal.getByRole('button', { name: 'キャンセル', exact: true }).click()
  expect(await readCompleteState(page)).toEqual(before)
  await row.getByRole('button', { name: '編集', exact: true }).click()
  await modal.getByLabel('メモ（任意）').fill('関連しない編集')
  await save.click(); await expect(modal).not.toBeVisible()
  let record = (await readCompleteState(page)).catches!.find(r => r.id === 90000)!
  expect(record.action).toBe('ユーザー独自の旧アクション'); expect(record).not.toHaveProperty('actionLength')
  await row.getByRole('button', { name: '編集', exact: true }).click()
  await modal.getByLabel('アクションの長さ', { exact: true }).selectOption('short')
  await modal.getByLabel('アクションの長さ', { exact: true }).selectOption('normal')
  await save.click(); await expect(modal).not.toBeVisible()
  record = (await readCompleteState(page)).catches!.find(r => r.id === 90000)!
  expect(record.actionLength).toBe('normal'); expect(record.action).toBe('ユーザー独自の旧アクション')
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  const create = page.getByRole('dialog', { name: '釣果を登録', exact: true })
  await create.getByRole('button', { name: /前回と同じ/ }).click(); await expect(create).not.toBeVisible()
  const copied = (await readCompleteState(page)).catches!.at(-1)!
  expect(copied.action).toBe('旧コピー専用'); expect(copied).not.toHaveProperty('actionLength')
  await page.getByRole('button', { name: '🎣 釣れた！', exact: true }).click()
  await expect(create.getByLabel('アクションの長さ', { exact: true })).toHaveValue('normal')
  await saveCatch(page)
  const final = await readCompleteState(page)
  expect(final.catches!.at(-1)!.actionLength).toBe('normal')
  expect(final.catches!.at(-1)!).not.toHaveProperty('action')
  for (const [name, rows] of Object.entries(before)) {
    const pk = name === 'fishSpecies' ? 'fish_id' : name === 'appMetadata' ? 'key' : 'id'
    for (const source of rows) if (name !== 'catches' || source.id !== 90000) expect(final[name]!.find(r => r[pk] === source[pk])).toEqual(source)
  }
  await page.reload(); await expect(page.getByRole('main')).not.toHaveAttribute('inert')
  expect(await readCompleteState(page)).toEqual(final)
})
