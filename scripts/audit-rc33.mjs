import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRc32Runtime } from './lib/rc32Runtime.mjs'

const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/audit-rc33.mjs <backup.json>')
const raw = await readFile(input), hash = createHash('sha256').update(raw).digest('hex')
const runtime = await createRc32Runtime()
try {
  const { db } = runtime.database
  const data = runtime.backup.validateBackup(JSON.parse(raw))
  // Process-local fake-indexeddb only. Never writes the input or accesses a browser DB.
  for (const [name, rows] of Object.entries(data)) if (Array.isArray(rows) && rows.length) await db.table(name).bulkAdd(rows)
  const state = async () => Object.fromEntries(await Promise.all(db.tables.map(async t => [t.name, await t.toArray()])))
  const before = await state(), first = await runtime.rc33.previewRc33Catalog()
  assert.deepEqual(await state(), before)
  await runtime.rc33.applyRc33Catalog(first.comparisonToken)
  const after = await state(), second = await runtime.rc33.previewRc33Catalog()
  assert.equal(second.heldColors, 0)
  const targetIds = second.rows.map(r => r.variantId)
  assert.ok(targetIds.every(id => Number.isSafeInteger(id)))
  assert.equal(new Set(targetIds).size, targetIds.length)
  await runtime.rc33.applyRc33Catalog(second.comparisonToken)
  assert.deepEqual(await state(), after)
  for (const [name, rows] of Object.entries(before)) {
    if (!['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures', 'lureVisualProfiles'].includes(name)) assert.deepEqual(after[name], rows)
    else for (const row of rows) assert.deepEqual(after[name].find(r => r.id === row.id), row, name)
  }
  const backup = await runtime.backup.createBackup()
  assert.equal(backup.version, 8)
  await runtime.backup.importBackup({ text: async () => JSON.stringify(backup) })
  assert.deepEqual(await state(), after)
  assert.equal(createHash('sha256').update(await readFile(input)).digest('hex'), hash)
  const counts = s => Object.fromEntries(Object.entries(s).map(([k,v]) => [k, v.length]))
  const summarize = ({ comparisonToken, rows, ...summary }) => summary
  const report = { inputSha256: hash, before: counts(before), after: counts(after), first: summarize(first), second: summarize(second), existingRowsUnchanged: true, repeatUnchanged: true, v8RoundTripUnchanged: true,
    targetDuplicateColors: 0, rows: first.rows.map(({ variantId, ...r }) => r) }
  await writeFile('docs/rc33/RC33_AUDIT.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ before: report.before, after: report.after, first: report.first, second: report.second }, null, 2))
} finally { await runtime.dispose() }
