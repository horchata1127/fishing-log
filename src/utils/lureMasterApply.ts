import Dexie from 'dexie'
import { db, emptyLureMasterHistoryCounts, lureMasterHistoryValue, visualIdentityForVariant, visualNaturalKey, validateVisualRecord, validateVisualReferences,
  type LureMasterHistoryCounts, type LureVisualProfile } from '../db/database'
import { lureMasterManifest, type MasterManifest } from '../data/lureMasterManifest'
import { planLureMaster, stableMasterValue, type LureMasterOptions, type LureMasterPlan, type LureMasterSnapshot, type MasterAddition } from './lureMasterPlanner'
import { readLureMasterSnapshot, lureMasterSnapshotTables } from './lureMasterPreview'
import { startLureMasterImport, finishLureMasterImport } from './lureMasterHistory'

const protocol = 'rc34-web-lock-v1' as const
export class LureMasterApplyError extends Error {
  code: string; runId?: string; historyError?: unknown
  constructor(code: string, message: string, cause?: unknown, runId?: string, historyError?: unknown) {
    super(message, { cause }); this.name = 'LureMasterApplyError'; this.code = code; this.runId = runId; this.historyError = historyError
  }
}
export async function hashLureMasterManifest(manifest: MasterManifest = lureMasterManifest): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lureMasterHistoryValue(manifest)))
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('')
}
type CatalogTable = MasterAddition['table']
type IdMap = Map<number, { table: CatalogTable; id: number }>
const parentOf = {
  lureSeries: { field: 'manufacturerId', table: 'lureManufacturers' },
  lureModels: { field: 'seriesId', table: 'lureSeries' },
  lureVariants: { field: 'modelId', table: 'lureModels' },
} as const
/** A virtual ID must resolve to the correct table; never fall through to a same-numbered local ID. */
export function resolveLureMasterId(id: number | undefined, table: CatalogTable, ids: IdMap): number {
  if (!Number.isSafeInteger(id) || id === 0) throw new LureMasterApplyError('ID_RESOLUTION', '親子IDが不正です')
  if (id! > 0) return id!
  const mapped = ids.get(id!)
  if (!mapped || mapped.table !== table || !Number.isSafeInteger(mapped.id) || mapped.id <= 0) throw new LureMasterApplyError('ID_RESOLUTION', '仮IDの親子対応を解決できません')
  return mapped.id
}
function holdDetails(plan: LureMasterPlan) {
  return [...plan.rows.filter(r => r.catalog === 'hold').map(r => ({ naturalKey: `${r.targetKey}/${r.color.code || r.color.name}`,
    reason: `${r.reason} | ${r.color.sourceUrl}`.slice(0, 4000) })),
  ...plan.pending.map(p => ({ naturalKey: `${p.revision}/${p.detail.series}/${p.detail.name}`, reason: stableMasterValue(p.detail).slice(0, 4000) }))]
}

/** Count only distinct records actually matched in the read snapshot, including reused parents. */
function observedCounts(plan: LureMasterPlan, snapshot: LureMasterSnapshot): LureMasterHistoryCounts {
  const counts = emptyLureMasterHistoryCounts()
  const retained = Object.fromEntries(lureMasterSnapshotTables.map(name => [name, new Set<number | string>()])) as Record<keyof LureMasterHistoryCounts, Set<number | string>>
  const virtual = new Map(plan.additions.map(op => [op.value.id!, op]))
  const lookup = (id: number, table: CatalogTable): Record<string, unknown> => {
    const row = id > 0 ? snapshot[table].find(r => r.id === id) : virtual.get(id)?.table === table ? virtual.get(id)!.value : undefined
    if (!row) throw new LureMasterApplyError('ID_RESOLUTION', '照合結果の親子IDを解決できません')
    if (id > 0) retained[table].add(id)
    return row as unknown as Record<string, unknown>
  }
  const groups = new Map<string, boolean[]>()
  for (const row of plan.rows) {
    const group = groups.get(row.targetKey) ?? []; group.push(row.catalog === 'hold'); groups.set(row.targetKey, group)
    if (row.catalog === 'hold') { counts.lureVariants.held++; continue }
    const variant = lookup(row.plannedVariantId!, 'lureVariants'), model = lookup(variant.modelId as number, 'lureModels')
    const parent = lookup(model.seriesId as number, 'lureSeries'); lookup(parent.manufacturerId as number, 'lureManufacturers')
    if (row.ownership === 'keep') for (const owned of snapshot.myLures.filter(m => m.variantId === row.plannedVariantId)) retained.myLures.add(owned.id!)
    if (row.visual === 'keep') for (const profile of snapshot.lureVisualProfiles.filter(p => p.variantId === row.plannedVariantId)) retained.lureVisualProfiles.add(profile.id)
  }
  counts.lureModels.held = [...groups.values()].filter(rows => rows.every(Boolean)).length
  for (const name of lureMasterSnapshotTables) counts[name].retained = retained[name].size
  return counts
}

/** UUIDs are allocated before catalog writes. A collision holds every affected target, preserving existing rows. */
function allocateVisualIds(input: LureMasterPlan, snapshot: LureMasterSnapshot) {
  const plan = structuredClone(input), ids = new Map<number, string>(), reserved = new Map<string, string | undefined>(snapshot.lureVisualProfiles.map(p => [p.id, undefined]))
  const held = new Set<string>()
  for (const row of plan.rows.filter(r => r.visual === 'photo' || r.visual === 'name')) {
    const id = crypto.randomUUID()
    if (reserved.has(id)) {
      held.add(row.targetKey)
      const previous = reserved.get(id); if (previous) held.add(previous)
    } else reserved.set(id, row.targetKey)
    ids.set(row.plannedVariantId!, id)
  }
  if (held.size) {
    for (const row of plan.rows) if (held.has(row.targetKey)) {
      row.catalog = 'hold'; row.reason = '代表配色UUIDが競合しています'; row.ownership = 'none'; row.visual = 'none'
      delete row.appearance; delete row.visualEvidence
    }
    const operations = new Map(plan.additions.map(op => [op.value.id!, op])), needed = new Set<number>()
    const visit = (id: number) => {
      if (id > 0 || needed.has(id)) return
      const op = operations.get(id)
      if (!op) throw new LureMasterApplyError('ID_RESOLUTION', '保留後の依存関係を解決できません')
      needed.add(id)
      if (op.table !== 'lureManufacturers') {
        const parent = parentOf[op.table]
        visit((op.value as unknown as Record<string, number>)[parent.field]!)
      }
    }
    for (const row of plan.rows) if (row.catalog !== 'hold') visit(row.plannedVariantId!)
    plan.additions = plan.additions.filter(op => needed.has(op.value.id!))
    plan.addedManufacturers = plan.additions.filter(op => op.table === 'lureManufacturers').length
    plan.addedSeries = plan.additions.filter(op => op.table === 'lureSeries').length
    plan.addedModels = plan.additions.filter(op => op.table === 'lureModels').length
    plan.addedColors = plan.rows.filter(r => r.catalog === 'add').length
    plan.retainedColors = plan.rows.filter(r => r.catalog === 'keep').length
    plan.heldColors = plan.rows.filter(r => r.catalog === 'hold').length
    plan.addedOwned = plan.rows.filter(r => r.ownership === 'add').length
    plan.retainedOwned = plan.rows.filter(r => r.ownership === 'keep').length
    plan.photoColors = plan.rows.filter(r => r.visual === 'photo').length
    plan.provisionalColors = plan.rows.filter(r => r.visual === 'name').length
    plan.unknownColors = plan.rows.filter(r => r.visual === 'unknown').length
  }
  return { plan, ids }
}

/** Default uses the existing DB and frozen cumulative manifest. Injection permits independent connection tests. */
export function createLureMasterUpdater(database = db, sourceManifest: MasterManifest = lureMasterManifest) {
  const lockName = `${database.name}:rc34-lure-master-apply:v1`
  const tables = () => lureMasterSnapshotTables.map(name => database.table(name))
  const locks = () => globalThis.navigator?.locks

  async function recoverWithLock() {
    return database.transaction('rw', database.lureMasterImportHistory, async () => {
      const rows = await database.lureMasterImportHistory.toArray(), recovered: string[] = []
      for (const run of rows) if (run.kind === 'import' && run.status === 'running' && run.executionProtocol === protocol) {
        await finishLureMasterImport(run, { status: 'interrupted', counts: emptyLureMasterHistoryCounts(),
          error: { code: 'EXCLUSIVE_RECOVERY', message: '同じWeb Lockを取得し、実行主体が残っていないことを確認しました' } }, database)
        recovered.push(run.id)
      }
      return recovered
    })
  }
  async function recoverInterrupted() {
    if (Dexie.currentTransaction) throw new LureMasterApplyError('NESTED_APPLY', '中断確認は既存トランザクションの外から実行してください')
    const manager = locks()
    // Absence of a lock or elapsed time is not proof that another tab has stopped.
    if (!manager) return []
    return manager.request(lockName, { mode: 'exclusive', ifAvailable: true }, lock => lock ? recoverWithLock() : [])
  }
  async function preview(options: LureMasterOptions = {}) {
    const manifest = structuredClone(sourceManifest)
    return database.transaction('r', tables(), async () => planLureMaster(await readLureMasterSnapshot(database), options, manifest))
  }
  async function execute(token: string, options: LureMasterOptions, exclusive: boolean) {
    const manifest = structuredClone(sourceManifest), selected = { includePurchases: options.includePurchases === true }
    // WebCrypto is deliberately outside IndexedDB transactions.
    const manifestHash = await hashLureMasterManifest(manifest)
    if (exclusive) await recoverWithLock()
    const run = await startLureMasterImport({ masterVersion: manifest.masterVersion, matchingVersion: manifest.matchingVersion,
      manifestHash, options: selected, ...(exclusive ? { executionProtocol: protocol } : {}) }, database)
    let checked: LureMasterPlan | undefined
    let observed = emptyLureMasterHistoryCounts()
    try {
      return await database.transaction('rw', [...tables(), database.lureMasterImportHistory], async () => {
        const snapshot = await readLureMasterSnapshot(database)
        checked = planLureMaster(snapshot, selected, manifest)
        if (checked.comparisonToken !== token) throw new LureMasterApplyError('STALE_PREVIEW', 'データまたは更新条件が変更されました。もう一度事前確認してください')
        const prepared = allocateVisualIds(checked, snapshot), plan = prepared.plan, ids: IdMap = new Map()
        checked = plan
        observed = observedCounts(plan, snapshot)
        const counts = structuredClone(observed)
        // Each counter advances only after the corresponding successful DB write.
        for (const op of plan.additions) {
          const { id: virtual, ...value } = structuredClone(op.value)
          if (!Number.isSafeInteger(virtual) || virtual! >= 0 || ids.has(virtual!)) throw new LureMasterApplyError('ID_RESOLUTION', '追加計画の仮IDが不正です')
          if (op.table !== 'lureManufacturers') {
            const parent = parentOf[op.table], row = value as Record<string, unknown>
            const parentId = resolveLureMasterId(row[parent.field] as number, parent.table, ids)
            if (!await database.table(parent.table).get(parentId)) throw new LureMasterApplyError('ID_RESOLUTION', '参照先の親レコードがありません')
            row[parent.field] = parentId
          }
          const actual = await database.table(op.table).add(value)
          if (typeof actual !== 'number' || !Number.isSafeInteger(actual) || actual <= 0) throw new LureMasterApplyError('ID_RESOLUTION', 'DB採番が不正です')
          ids.set(virtual!, { table: op.table, id: actual }); counts[op.table].added++
        }
        const current = await readLureMasterSnapshot(database)
        for (const row of plan.rows) {
          if (row.catalog === 'hold') continue
          const variantId = resolveLureMasterId(row.plannedVariantId, 'lureVariants', ids)
          const variant = current.lureVariants.find(v => v.id === variantId), model = current.lureModels.find(m => m.id === variant?.modelId)
          const parent = current.lureSeries.find(p => p.id === model?.seriesId), maker = current.lureManufacturers.find(m => m.id === parent?.manufacturerId)
          if (!variant || !model || !parent || !maker) throw new LureMasterApplyError('ID_RESOLUTION', 'カラーの親子参照を解決できません')
          if (row.ownership === 'add') {
            if (!selected.includePurchases || !row.color.purchase) throw new Error('所有追加オプションが一致しません')
            await database.myLures.add({ variantId, active: true, ownershipStatus: 'owned' }); counts.myLures.added++
          }
          if (row.visual === 'photo' || row.visual === 'name') {
            const id = prepared.ids.get(row.plannedVariantId!)
            if (!id || !row.appearance) throw new Error('代表配色の追加計画が不正です')
            const identity = visualIdentityForVariant(variant, model, parent, maker)
            const profile: LureVisualProfile = { id, variantId, identity, naturalKey: visualNaturalKey(identity), appearance: structuredClone(row.appearance),
              origin: row.visual === 'photo' ? 'photo' : 'name', confirmed: row.visual === 'photo', userEdited: false, revision: 1,
              updatedAt: new Date().toISOString(), evidence: structuredClone(row.visualEvidence) }
            validateVisualRecord('lureVisualProfiles', profile)
            validateVisualReferences([profile], [], current)
            await database.lureVisualProfiles.add(profile); counts.lureVisualProfiles.added++; current.lureVisualProfiles.push(profile)
          }
        }
        const added = Object.values(counts).reduce((n, c) => n + c.added, 0)
        // Pending source notes are not invented color records; they remain in details.
        const status = plan.heldColors ? 'succeeded_with_holds' : added ? 'succeeded' : 'no_changes'
        const history = await finishLureMasterImport(run, { status, counts, details: holdDetails(plan) }, database)
        return { plan, counts, history }
      })
    } catch (cause) {
      const code = cause instanceof LureMasterApplyError ? cause.code : 'APPLY_FAILED'
      try {
        await finishLureMasterImport(run, { status: 'failed', counts: observed, details: checked ? holdDetails(checked) : [],
          error: { code, message: String(cause).slice(0, 4000) } }, database)
      } catch (historyError) {
        throw new LureMasterApplyError('HISTORY_WRITE_FAILED', '更新は完了していません。失敗履歴の保存もできませんでした', cause, run.id, historyError)
      }
      throw new LureMasterApplyError(code, cause instanceof Error ? cause.message : String(cause), cause, run.id)
    }
  }
  async function apply(token: string, options: LureMasterOptions = {}) {
    if (Dexie.currentTransaction) throw new LureMasterApplyError('NESTED_APPLY', '更新は既存トランザクションの外から実行してください')
    const manager = locks()
    // IDB transactions provide correctness even on browsers without Web Locks; recovery stays disabled there.
    return manager ? manager.request(lockName, { mode: 'exclusive' }, () => execute(token, options, true)) : execute(token, options, false)
  }
  return { preview, apply, recoverInterrupted, lockName }
}

const defaultUpdater = createLureMasterUpdater()
export const applyLureMaster = defaultUpdater.apply
export const recoverInterruptedLureMasterImports = defaultUpdater.recoverInterrupted
