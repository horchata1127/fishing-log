import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'fishing-rc34-presentation-'))
async function load(file, name) {
  const target = join(directory, `${name}.mjs`)
  await writeFile(target, ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)
  return import(pathToFileURL(target).href)
}
const ui = await load('src/utils/lureMasterPresentation.ts', 'presentation')
const development = await load('src/data/lureMasterDevelopmentHistory.ts', 'development')
after(async () => { assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep)); await rm(directory, { recursive: true, force: true }) })

function plan() {
  return { masterVersion: 'test', addedManufacturers: 1, addedSeries: 2, addedModels: 3, addedColors: 4, addedOwned: 0, photoColors: 2, provisionalColors: 1,
    rows: [{ targetKey: 'modelA', manufacturer: 'メーカー', series: 'シリーズ', model: 'モデル', color: { label: '赤,"色"\n表示', code: 'T-1', name: '赤', sourceUrl: 'https://example.test/', sources: [{ revision: 'RC20' }, { revision: 'RC21' }] }, catalog: 'add', reason: '', ownership: 'none', visual: 'photo' },
      { targetKey: 'modelA', manufacturer: 'メーカー', series: 'シリーズ', model: 'モデル', color: { label: '=SUM(1,2)', code: '', sourceUrl: 'https://example.test/', sources: [{ revision: 'RC22' }] }, catalog: 'hold', reason: '未確認', existingId: 7, ownership: 'none', visual: 'none' }] }
}
test('CSV exports exactly the displayed plan, source RCs, reasons, existing IDs and escaped cells', () => {
  const p = plan(), before = structuredClone(p), csv = ui.lureMasterPlanCsv(p)
  assert.ok(csv.startsWith('\uFEFFkind,masterVersion'))
  assert.ok(csv.includes('"plan","test"')); assert.ok(csv.includes('"RC20|RC21"'))
  assert.ok(csv.includes('"赤,""色""\n表示"')); assert.ok(csv.includes('"\'=SUM(1,2)"'))
  assert.ok(csv.includes('"hold","未確認","RC22","https://example.test/","7"'))
  assert.deepEqual(p, before)
})
test('model grouping preserves rows without double-counting or mutating the plan', () => {
  const p = plan(), groups = ui.groupMasterPlan(p)
  assert.equal(groups.length, 1); assert.equal(groups[0].rows.length, 2)
  assert.equal(groups[0].key, 'modelA'); assert.equal(p.rows.length, 2)
})
test('preview additions stay distinct from import outcomes and unknown running is explicit', () => {
  assert.deepEqual(ui.plannedAdditions(plan()), { lureManufacturers: 1, lureSeries: 2, lureModels: 3, lureVariants: 4, lureVisualProfiles: 3, myLures: 0 })
  assert.match(ui.importStatusLabels.running, /確認不能/)
  assert.equal(ui.importStatusLabels.succeeded_with_holds, '保留あり成功')
  assert.equal(ui.localImportTime(), '未完了')
  assert.equal(ui.historyAddedTotal({ kind: 'restore' }), 0)
  assert.equal(ui.historyAddedTotal({ kind: 'import', counts: { a: { added: 3 }, b: { added: 2 } } }), 5)
})
test('all 15 RC development entries are bundled descending and every linked local document remains present', async () => {
  const entries = development.lureMasterDevelopmentHistory
  assert.deepEqual(entries.map(e => e.rc), Array.from({ length: 15 }, (_, i) => 33 - i))
  for (const entry of entries) {
    assert.ok(entry.catalog && entry.features && entry.pending && entry.documents.length)
    for (const document of entry.documents) {
      await access(resolve('docs', document))
      assert.ok(development.developmentDocumentUrl(document).startsWith('https://github.com/horchata1127/fishing-log/blob/main/docs/'))
    }
  }
})
