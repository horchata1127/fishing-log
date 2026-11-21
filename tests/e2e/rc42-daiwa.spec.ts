import { test, expect, restoreViaUI, readAllState } from './fixtures'
import { rc42Fixture } from '../rc42Fixture'
import { checkRc42Dictionary, checkRc42Selectors } from '../rc42UiHelpers'

test('RC42 all 91 existing official colors remain selectable after repeated import without changing ownership/history', async ({ page }) => {
  test.setTimeout(90000)
  await restoreViaUI(page, rc42Fixture())
  await restoreViaUI(page, rc42Fixture())
  const before = await readAllState(page)
  await checkRc42Dictionary(page)
  await checkRc42Selectors(page)
  expect(await readAllState(page)).toEqual(before)
})
