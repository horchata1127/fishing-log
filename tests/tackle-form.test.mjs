import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/tackleForm.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { normalizeTackleField } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const strength = { key: 'strengthLb', label: '強度（lb）', number: true }
const text = { key: 'manufacturer', label: 'メーカー' }

test('text values trim only strings and preserve optional absence', () => {
  assert.equal(normalizeTackleField('  SMITH  ', text), 'SMITH')
  for (const value of ['', '  ', undefined, null]) assert.equal(normalizeTackleField(value, text), undefined)
  for (const value of [3.5, 0, true, {}, [], { trim: () => 'unsafe' }]) {
    assert.throws(() => normalizeTackleField(value, text), /文字列が必要/)
  }
})

test('number inputs accept strings and numbers; empty optional values remain absent', () => {
  for (const value of ['3.5', ' 3.5 ', 3.5]) assert.equal(normalizeTackleField(value, strength), 3.5)
  for (const value of ['', ' ', undefined, null]) assert.equal(normalizeTackleField(value, strength), undefined)
  for (const value of [0, '0', -1, NaN, Infinity, 'not a number', true, {}, []]) {
    assert.throws(() => normalizeTackleField(value, strength), /数値が必要|正の数/)
  }
})

test('required fields reject absence and invalid text types', () => {
  const required = { ...text, required: true }
  for (const value of ['', ' ', undefined, null]) assert.throws(() => normalizeTackleField(value, required), /入力が必要/)
  assert.throws(() => normalizeTackleField(3.5, required), /文字列が必要/)
  assert.equal(normalizeTackleField(' ナイロン ', { key: 'material', label: '素材', options: 'materials', required: true }), 'ナイロン')
})

test('reference IDs stay numeric and missing required selections are rejected', () => {
  const reference = { key: 'rodId', label: 'ロッド', options: 'rods', required: true }
  assert.equal(normalizeTackleField('12', reference), 12)
  assert.equal(normalizeTackleField(12, reference), 12)
  for (const value of ['', undefined, null]) assert.throws(() => normalizeTackleField(value, reference), /入力が必要/)
  assert.equal(normalizeTackleField('', { ...reference, required: false }), undefined)
})
