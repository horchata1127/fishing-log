import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
const source = ts.transpileModule(await readFile(new URL('../src/utils/calendarDate.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const { validateCalendarDate } = await import(url)
test('local calendar respects device timezone at JST boundaries, UTC and negative offsets', () => {
  for (const [zone, instants, days] of [
    ['Asia/Tokyo', ['2026-10-11T15:00:00Z','2026-10-11T21:00:00Z','2026-10-12T00:00:00Z','2026-10-12T14:59:00Z','2026-10-12T15:00:00Z'], ['2026-10-12','2026-10-12','2026-10-12','2026-10-12','2026-10-13']],
    ['UTC', ['2026-10-11T23:59:00Z','2026-10-12T00:00:00Z'], ['2026-10-11','2026-10-12']],
    ['America/Los_Angeles', ['2026-10-12T06:59:00Z','2026-10-12T07:00:00Z'], ['2026-10-11','2026-10-12']],
  ]) {
    const script = `import { localCalendarDate } from '${url}'; console.log(JSON.stringify(${JSON.stringify(instants)}.map(s=>localCalendarDate(new Date(s)))))`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), days)
  }
})
test('calendar validation rejects missing/impossible days; leap days work', () => {
  for (const day of ['', '2026-02-29', '2026-10-32', '2026-1-2', '2026-10-12T00:00:00Z']) assert.throws(() => validateCalendarDate(day))
  for (const day of ['2024-02-29','2026-10-12']) assert.doesNotThrow(() => validateCalendarDate(day))
})
