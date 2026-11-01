import { db, emptyLureMasterHistoryCounts, validateLureMasterHistoryRecord, lureMasterHistoryValue,
  lureMasterHistoryHead, nextLureMasterHistorySequence, mergeLureMasterHistory, type LureMasterImportRecord } from '../db/database'

export type LureMasterImportIdentity = Pick<LureMasterImportRecord, 'masterVersion' | 'manifestHash' | 'matchingVersion' | 'options' | 'executionProtocol'>
export type LureMasterImportOutcome = Pick<LureMasterImportRecord, 'counts'> & {
  status: Exclude<LureMasterImportRecord['status'], 'running'>
  details?: LureMasterImportRecord['details']; error?: LureMasterImportRecord['error']
}

/** Explicit storage API only; nothing calls it at startup or from the Phase 1 preview. */
export async function startLureMasterImport(identity: LureMasterImportIdentity, database = db): Promise<LureMasterImportRecord> {
  return database.transaction('rw', database.lureMasterImportHistory, async () => {
    const rows = mergeLureMasterHistory([], await database.lureMasterImportHistory.toArray())
    const row: LureMasterImportRecord = { masterVersion: identity.masterVersion, manifestHash: identity.manifestHash,
      matchingVersion: identity.matchingVersion, options: structuredClone(identity.options), id: crypto.randomUUID(), kind: 'import',
      contextId: lureMasterHistoryHead(rows)?.contextId ?? crypto.randomUUID(), sequence: nextLureMasterHistorySequence(rows),
      startedAt: new Date().toISOString(), status: 'running', counts: emptyLureMasterHistoryCounts(),
      ...(identity.executionProtocol ? { executionProtocol: identity.executionProtocol } : {}) }
    validateLureMasterHistoryRecord(row)
    await database.lureMasterImportHistory.add(row)
    return structuredClone(row)
  })
}

/** Can join a future enclosing apply transaction. It never writes master/owned/visual data itself.
 * Interrupted is explicit: a future caller must establish exclusivity before declaring another run abandoned.
 */
export async function finishLureMasterImport(expected: LureMasterImportRecord, outcome: LureMasterImportOutcome, database = db): Promise<LureMasterImportRecord> {
  return database.transaction('rw', database.lureMasterImportHistory, async () => {
    const stored = await database.lureMasterImportHistory.get(expected.id)
    if (!stored || stored.kind !== 'import' || stored.status !== 'running' || lureMasterHistoryValue(stored) !== lureMasterHistoryValue(expected)) throw new Error('更新履歴が変更されました')
    const rows = await database.lureMasterImportHistory.toArray()
    if (outcome.status !== 'failed' && outcome.status !== 'interrupted' && lureMasterHistoryHead(rows)?.contextId !== stored.contextId) throw new Error('復元によりデータ文脈が変わりました')
    // Device clocks can move backwards; preserve the actual observation rather than invent a completion time.
    const completedAt = new Date().toISOString()
    const row: LureMasterImportRecord = { ...stored, status: outcome.status, counts: structuredClone(outcome.counts), completedAt,
      ...(outcome.details === undefined ? {} : { details: structuredClone(outcome.details) }),
      ...(outcome.error === undefined ? {} : { error: structuredClone(outcome.error) }) }
    validateLureMasterHistoryRecord(row)
    await database.lureMasterImportHistory.put(row)
    return structuredClone(row)
  })
}
