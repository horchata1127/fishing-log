import 'fake-indexeddb/auto'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { localTypeScript } from './load-local-typescript.mjs'

const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/audit-rc38.mjs BACKUP.json [OUTPUT.json]')
const bytes = await readFile(input), backup = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
const loader = await localTypeScript()
try {
  const { lureMasterManifest } = await loader.load('src/data/lureMasterManifest.ts')
  const { planLureMaster } = await loader.load('src/utils/lureMasterPlanner.ts')
  const targets = lureMasterManifest.targets.filter(t => t.revisions.includes('RC38'))
  const snapshot = Object.fromEntries(['lureManufacturers', 'lureSeries', 'lureModels', 'lureVariants', 'myLures', 'lureVisualProfiles'].map(k => [k, backup.data[k] ?? []]))
  const plan = planLureMaster(snapshot, {}, { ...lureMasterManifest, targets, pending: [] })
  const trips = backup.data.trips.filter(t => t.fishingDate === '2026-11-03' && t.fishingAreaName === '多摩湖駅前フィッシングエリア')
  const candidates = backup.data.catches.filter(c => trips.some(t => t.id === c.tripId) && c.lureName === 'MOCA SR-SS').map(c => ({
    id: c.id, tripId: c.tripId, caughtAt: c.caughtAt, resultType: c.resultType ?? 'catch',
    before: { lureId: c.lureId, lureVariantId: c.lureVariantId, lureName: c.lureName, lureColor: c.lureColor },
    proposed: { lureName: 'MOCA DR-F Rattle 2HOOK', lureColor: 'さちおの茶', ids: '適用先端末で作成されたvariantと所有IDを通常編集画面で選択' },
    status: c.lureVariantId === 324 ? '4キャッチと同じ所有IDの関連バラシ候補。本人確認後に個別編集' : '別カラー・別所有ID。変更対象と断定せず個別確認',
  }))
  const result = {
    checkedAt: '2026-11-04', inputSha256: createHash('sha256').update(bytes).digest('hex'), backupVersion: backup.version,
    totals: { addedModels: plan.addedModels, addedColors: plan.addedColors, retainedColors: plan.retainedColors, heldColors: plan.heldColors },
    ambiguousModel: snapshot.lureModels.find(m => m.id === 128),
    ambiguousColors: snapshot.lureVariants.filter(v => v.modelId === 128),
    targets: targets.map(t => ({ model: t.model, weightG: t.weight, lengthMm: t.length, buoyancy: t.buoyancy, rattle: t.rattle,
      colors: plan.rows.filter(r => r.targetKey === t.key).map(r => ({ name: r.color.name, code: r.color.code, jan: r.color.jan, sourceUrl: r.color.sourceUrl, colorClass: r.color.colorClass, action: r.catalog, existingId: r.existingId, reason: r.reason })) })),
    trips: trips.map(t => ({ id: t.id, summaryMvp: t.summaryMvp ?? null })), candidates,
    automaticCatchEdits: false, automaticOwnership: false,
  }
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ totals: result.totals, candidateIds: candidates.map(c => c.id), trips: result.trips }))
} finally { await loader.close() }
