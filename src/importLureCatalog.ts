import { db } from './db/database'

export const catalogTables = ['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants'] as const
type CatalogTable = typeof catalogTables[number]
type Row = { id: number; [field: string]: unknown }
type CatalogData = Record<CatalogTable, Row[]>

export interface CatalogPreview {
  counts: Record<CatalogTable, { added: number; updated: number; unchanged: number }>
  duplicates: string[]
  collisions: string[]
  errors: string[]
  ignoredOwnership: boolean
  ignoredOwnershipRows: number | null
  comparisonToken: string
}

type Operation = { table: CatalogTable; row: Row; update: boolean }
const parents: Partial<Record<CatalogTable, { field: string; table: CatalogTable }>> = {
  lureSeries: { field: 'manufacturerId', table: 'lureManufacturers' },
  lureModels: { field: 'seriesId', table: 'lureSeries' },
  lureVariants: { field: 'modelId', table: 'lureModels' },
}
const normalize = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase()
const validId = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function validate(value: unknown, report: CatalogPreview): CatalogData | null {
  if (!isObject(value) || value.format !== 'fishing-log-catalog-seed' || value.version !== 1 ||
      !['1.0-rc7', '1.0-rc18'].includes(value.catalogVersion as string) || !isObject(value.data)) {
    report.errors.push('対応するRC7・RC18カタログJSONではありません。')
    return null
  }
  const source = value.data
  report.ignoredOwnership = Object.hasOwn(source, 'ownedLures')
  report.ignoredOwnershipRows = Array.isArray(source.ownedLures) ? source.ownedLures.length : null
  const data = {} as CatalogData
  for (const table of catalogTables) {
    const rows = source[table]
    if (!Array.isArray(rows)) {
      report.errors.push(`${table}: 配列が必要です。`)
      data[table] = []
      continue
    }
    const seen = new Set<number>()
    data[table] = []
    rows.forEach((entry, index) => {
      const path = `${table}[${index}]`
      if (!isObject(entry) || !validId(entry.id)) {
        report.errors.push(`${path}: 正の整数IDが必要です。`)
        return
      }
      const row = { ...entry } as Row
      if (seen.has(row.id)) {
        const duplicate = `${path}: ID ${row.id} が重複しています。`
        report.duplicates.push(duplicate)
        report.errors.push(duplicate)
      }
      seen.add(row.id)
      const name = table === 'lureVariants' ? row.colorName : row.name
      if (typeof name !== 'string' || !name.trim()) report.errors.push(`${path}: 名前が必要です。`)
      const parent = parents[table]
      if (parent && !validId(row[parent.field])) report.errors.push(`${path}: 親IDが不正です。`)
      if (table === 'lureModels') {
        if (row.category !== undefined && !['スプーン', 'クランク', 'ミノー', 'トップ', 'バイブレーション', 'その他'].includes(row.category as string)) {
          report.errors.push(`${path}: 未対応のカテゴリです。`)
        }
        for (const field of ['lengthMm', 'weightG']) {
          const number = row[field]
          if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || number < 0)) {
            report.errors.push(`${path}.${field}: 数値が不正です。`)
          }
        }
      }
      data[table].push(row)
    })
  }
  for (const table of catalogTables) {
    const parent = parents[table]
    if (!parent) continue
    const ids = new Set(data[parent.table].map(row => row.id))
    for (const row of data[table]) {
      if (!ids.has(row[parent.field] as number)) {
        report.errors.push(`${table} ID ${row.id}: ${parent.table} の参照先 ${row[parent.field]} がありません。`)
      }
    }
  }
  return report.errors.length ? null : data
}

/** 正規化一致は警告に使う。異なる原表記を自動統合しない。 */
function plan(value: unknown, existing: CatalogData) {
  const report: CatalogPreview = {
    counts: Object.fromEntries(catalogTables.map(table => [table, { added: 0, updated: 0, unchanged: 0 }])) as CatalogPreview['counts'],
    duplicates: [], collisions: [], errors: [], ignoredOwnership: false,
    ignoredOwnershipRows: null, comparisonToken: '',
  }
  const source = validate(value, report)
  const operations: Operation[] = []
  if (!source) return { report, operations }
  report.comparisonToken = JSON.stringify({ source, existing })
  const maps = {} as Record<CatalogTable, Map<number, number>>
  let virtualId = -1
  for (const table of catalogTables) {
    const parent = parents[table]
    const nameField = table === 'lureVariants' ? 'colorName' : 'name'
    const localRows = existing[table].map(row => ({ ...row }))
    const importedNames = new Set<string>()
    maps[table] = new Map()
    for (const row of source[table]) {
      const parentId = parent ? maps[parent.table].get(row[parent.field] as number) : undefined
      if (parent && parentId === undefined) {
        report.errors.push(`${table} ID ${row.id}: 親の対応付けができません。`)
        continue
      }
      const name = row[nameField] as string
      const label = `${table} ID ${row.id}「${name}」`
      const scoped = localRows.filter(local => !parent || local[parent.field] === parentId)
      const exact = scoped.filter(local => local[nameField] === name)
      const identity = JSON.stringify([parentId, name])
      if (importedNames.has(identity)) {
        report.duplicates.push(`${label}: 同じ親・同じ名前が入力内で重複しています。`)
        report.errors.push(`${label}: 完全一致の重複を解消してから取り込んでください。`)
        continue
      }
      importedNames.add(identity)
      if (exact.length > 1) {
        report.duplicates.push(`${label}: 既存の完全一致候補が${exact.length}件あります。`)
        report.errors.push(`${label}: 既存IDを一意に選べないため取り込みを停止します。`)
        continue
      }
      const collisions = scoped.filter(local => local[nameField] !== name && normalize(local[nameField] as string) === normalize(name))
      if (collisions.length) {
        report.collisions.push(`${label}: ${collisions.map(local => `「${local[nameField]}」`).join('、')}と正規化一致します。原表記ごとの別レコードを保持します。`)
      }
      let local = exact[0]
      if (!local) {
        const inserted: Row = { id: virtualId--, [nameField]: name }
        if (parent) inserted[parent.field] = parentId
        if (table === 'lureModels') {
          for (const field of ['category', 'lengthMm', 'weightG']) {
            if (row[field] !== undefined) inserted[field] = row[field]
          }
        }
        local = inserted
        localRows.push(local)
        operations.push({ table, row: inserted, update: false })
        report.counts[table].added++
      } else if (table === 'lureModels' && row.category !== undefined && row.category !== local.category) {
        // 現行互換：既存モデルはカテゴリだけ更新。名前・親ID・寸法は上書きしない。
        operations.push({ table, row: { id: local.id, category: row.category }, update: true })
        local.category = row.category
        report.counts[table].updated++
      } else {
        report.counts[table].unchanged++
      }
      maps[table].set(row.id, local.id)
    }
  }
  return { report, operations }
}

async function readCatalog(): Promise<CatalogData> {
  const data = {} as CatalogData
  await Promise.all(catalogTables.map(async table => {
    data[table] = await db.table(table).orderBy('id').toArray()
  }))
  return data
}

/** 読み取り専用。実行と同じ照合規則で追加・更新・問題点を確認する。 */
export async function previewLureCatalog(value: unknown): Promise<CatalogPreview> {
  return db.transaction('r', catalogTables.map(table => db.table(table)), async () => {
    return plan(value, await readCatalog()).report
  })
}

/** カタログ4テーブルのみ変更。所有情報・釣行・釣果にはアクセスしない。 */
export async function importLureCatalog(value: unknown, comparisonToken?: string): Promise<CatalogPreview> {
  return db.transaction('rw', catalogTables.map(table => db.table(table)), async () => {
    const { report, operations } = plan(value, await readCatalog())
    if (report.errors.length) throw new Error(report.errors.join('\n'))
    if (comparisonToken !== undefined && comparisonToken !== report.comparisonToken) {
      throw new Error('事前確認後にカタログが変わりました。もう一度ファイルを確認してください。')
    }
    const actualIds = new Map<number, number>()
    for (const operation of operations) {
      const table = db.table(operation.table)
      if (operation.update) {
        const { id, ...changes } = operation.row
        await table.update(id, changes)
      } else {
        const { id: virtual, ...inserted } = operation.row
        const parent = parents[operation.table]
        if (parent) {
          const target = inserted[parent.field] as number
          inserted[parent.field] = target < 0 ? actualIds.get(target)! : target
        }
        actualIds.set(virtual, await table.add(inserted) as number)
      }
    }
    return report
  })
}
