<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from 'vue'
import { db, type LureMasterHistoryRecord } from '../db/database'
import { lureMasterManifest } from '../data/lureMasterManifest'
import { lureMasterDevelopmentHistory, developmentDocumentUrl } from '../data/lureMasterDevelopmentHistory'
import { previewLureMaster } from '../utils/lureMasterPreview'
import { applyLureMaster } from '../utils/lureMasterApply'
import type { LureMasterPlan } from '../utils/lureMasterPlanner'
import { exportBackup } from '../utils/backup'
import { groupMasterPlan, plannedAdditions, masterCountLabels, importStatusLabels, localImportTime, lureMasterPlanCsv } from '../utils/lureMasterPresentation'
import LegacyLureCatalogPanel from './LegacyLureCatalogPanel.vue'

const emit = defineEmits<{ back: [] }>()
const view = ref<'main' | 'development' | 'history' | 'legacy'>('main')
const busy = ref(false), includePurchases = ref(false), backupSaved = ref(false), confirming = ref(false)
const plan = shallowRef<LureMasterPlan | null>(null), result = shallowRef<Awaited<ReturnType<typeof applyLureMaster>> | null>(null)
const error = ref(''), message = ref(''), modelPage = ref(0), historyPage = ref(0), historyCount = ref(0)
const historyRows = shallowRef<LureMasterHistoryRecord[]>([]), detailLimits = ref<Record<string, number>>({})
const resultHeading = ref<HTMLElement | null>(null)
const legacy = ref<{ busy: boolean; preview: unknown } | null>(null)
const working = computed(() => busy.value || !!legacy.value?.busy)
defineExpose({ busy: working, preview: computed(() => plan.value ?? legacy.value?.preview ?? null) })
const models = computed(() => plan.value ? groupMasterPlan(plan.value) : [])
const visibleModels = computed(() => models.value.slice(modelPage.value * 5, (modelPage.value + 1) * 5))
const additions = computed(() => plan.value ? plannedAdditions(plan.value) : null)
const purchaseTargets = lureMasterManifest.targets.flatMap(t => t.colors.filter(c => c.purchase).map(c => `${t.manufacturer} / ${t.model} / ${c.label}`))
const rowLabels = { add: '追加', keep: '保持', hold: '保留' }
function clearPlan() { plan.value = null; confirming.value = false; backupSaved.value = false; modelPage.value = 0 }
function cancel() { if (working.value) return; clearPlan(); message.value = '更新を取り消しました。データは変更していません。' }
async function check() {
  if (working.value) return
  clearPlan(); result.value = null; error.value = ''; message.value = ''; busy.value = true
  try { plan.value = await previewLureMaster({ includePurchases: includePurchases.value }) }
  catch (e) { error.value = `差分確認に失敗しました。再確認してください。${String(e)}` }
  finally { busy.value = false }
}
async function prepare() {
  if (working.value || !plan.value) return
  busy.value = true; error.value = ''; backupSaved.value = false
  try { await exportBackup(); confirming.value = true }
  catch (e) { error.value = `バックアップを作成できなかったため更新を開始しませんでした。保存先を確認して再試行してください。${String(e)}` }
  finally { busy.value = false }
}
async function apply() {
  const checked = plan.value
  if (working.value || !checked || !confirming.value || !backupSaved.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    result.value = await applyLureMaster(checked.comparisonToken, { includePurchases: includePurchases.value })
    clearPlan(); await nextTick(); resultHeading.value?.focus()
  } catch (e) {
    result.value = null; clearPlan()
    const code = e && typeof e === 'object' && 'code' in e ? e.code : ''
    error.value = code === 'STALE_PREVIEW' ? 'データまたは条件が変わりました。もう一度事前確認してください。'
      : code === 'HISTORY_WRITE_FAILED' ? '更新は完了していません。履歴の保存にも失敗しました。空き容量・保存状態を確認してから再プレビューしてください。'
      : `更新に失敗しました。再プレビューして現在の差分を確認してください。${String(e)}`
  } finally { busy.value = false }
}
async function loadHistory() {
  busy.value = true; error.value = ''
  try {
    await db.transaction('r', db.lureMasterImportHistory, async () => {
      historyCount.value = await db.lureMasterImportHistory.count()
      historyRows.value = await db.lureMasterImportHistory.orderBy('sequence').reverse().offset(historyPage.value * 5).limit(5).toArray()
    })
  } catch (e) { error.value = `取り込み履歴を読み込めませんでした。${String(e)}` }
  finally { busy.value = false }
}
async function show(next: typeof view.value) {
  if (working.value) return
  clearPlan(); view.value = next; error.value = ''; message.value = ''
  if (next === 'history') { historyPage.value = 0; await loadHistory() }
}
async function historyMove(delta: number) { if (working.value) return; historyPage.value += delta; await loadHistory() }
function downloadPlan() {
  if (!plan.value || working.value) return
  try {
    const url = URL.createObjectURL(new Blob([lureMasterPlanCsv(plan.value)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'LURE_MASTER_PLAN.csv'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { error.value = `CSVを保存できませんでした。${String(e)}` }
}
</script>

<template>
  <section class="master-screen" aria-label="ルアーマスター管理">
    <header><h1>ルアーマスター管理</h1><button :disabled="working" @click="clearPlan(); emit('back')">← ホーム</button></header>
    <button v-if="view !== 'main'" :disabled="working" @click="show('main')">← マスター管理に戻る</button>
    <p v-if="working" role="status">処理中です…画面を閉じずにお待ちください。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="view === 'main'">
      <p>アプリ同梱マスター版：<strong>{{ lureMasterManifest.masterVersion }}</strong></p>
      <p class="note">「最新版」はこのアプリに同梱された版です。ネットワーク上の最新版を確認する機能ではありません。</p>
      <label class="option"><input v-model="includePurchases" type="checkbox" :disabled="working" @change="check" />RC33の購入指定もマイルアーへ登録する</label>
      <details><summary>購入指定11個の対象</summary><ul><li v-for="target in purchaseTargets" :key="target">{{ target }}</li></ul><p>既存所有は非アクティブ・未確認でも保持し、追加や状態の補正はしません。</p></details>
      <button class="primary" :disabled="working" @click="check">最新版との差分を確認</button>
      <section v-if="plan" aria-label="統一マスターの差分プレビュー" class="panel">
        <h2>{{ confirming ? '更新の最終確認' : '追加予定（未適用）' }}</h2>
        <p>対象版：{{ plan.masterVersion }} · 所有オプション：{{ plan.options.includePurchases ? 'ON' : 'OFF' }}</p>
        <table><thead><tr><th>対象</th><th>追加予定</th></tr></thead><tbody><tr v-for="(label, name) in masterCountLabels" :key="name"><th>{{ label }}</th><td>{{ additions?.[name] }}</td></tr></tbody></table>
        <p>既存カラー {{ plan.retainedColors }}件保持・保留 {{ plan.heldColors }}色</p>
        <p>既存所有保持 {{ plan.retainedOwned }}個・既存代表配色保持 {{ plan.rows.filter(r => r.visual === 'keep').length }}件</p>
        <p>公式画像配色 {{ plan.photoColors }}件・名称推定 {{ plan.provisionalColors }}件・未確認 {{ plan.unknownColors }}件</p>
        <p class="note">確認済みの不足分だけ追加します。既存のマスター・所有・釣行・釣果・配色は上書き・削除しません。未確認の商品・カラーは保留します。</p>
        <template v-if="!confirming">
          <details><summary>モデル別の予定・保留理由・出典（{{ models.length }}モデル）</summary>
            <article v-for="model in visibleModels" :key="model.key" class="model" :data-model="model.model">
              <h3>{{ model.manufacturer }} / {{ model.series }} / {{ model.model }}</h3>
              <p>追加 {{ model.rows.filter(r => r.catalog === 'add').length }}色・保持 {{ model.rows.filter(r => r.catalog === 'keep').length }}色・保留 {{ model.rows.filter(r => r.catalog === 'hold').length }}色</p>
              <details><summary>カラー・根拠</summary><ul><li v-for="(row, index) in model.rows.slice(0, 20)" :key="index">
                {{ row.color.label }}：{{ rowLabels[row.catalog] }} {{ row.reason }}<br />元RC：{{ row.color.sources.map(s => s.revision).join('・') }}
                <a v-if="row.color.sourceUrl" :href="row.color.sourceUrl" target="_blank" rel="noopener noreferrer">出典</a>
              </li></ul><p v-if="model.rows.length > 20">先頭20色を表示しています。全色は差分CSVで確認できます。</p></details>
            </article>
            <nav aria-label="モデルのページ"><button :disabled="working || modelPage === 0" @click="modelPage--">前のモデル</button><span>{{ modelPage + 1 }} / {{ Math.ceil(models.length / 5) || 1 }}</span><button :disabled="working || (modelPage + 1) * 5 >= models.length" @click="modelPage++">次のモデル</button></nav>
          </details>
          <details><summary>別途の要確認注記 {{ plan.pending.length }}件</summary><ul><li v-for="(item, index) in plan.pending" :key="index">{{ item.revision }} / {{ item.detail.series }} / {{ item.detail.name }}：{{ item.detail.reason }}</li></ul></details>
          <button :disabled="working" @click="downloadPlan">差分予定をCSVで保存</button>
          <button class="primary" :disabled="working" @click="prepare">更新前のバックアップを保存</button>
        </template>
        <template v-else>
          <p>バックアップのダウンロードを開始しました。保存完了を自動では確認できません。「ファイル」等で保存実体を確認してください。</p>
          <label class="option"><input v-model="backupSaved" type="checkbox" :disabled="working" />バックアップファイルが保存されていることを確認しました</label>
          <button class="primary" :disabled="working || !backupSaved" @click="apply">確認して更新を実行</button>
        </template>
        <button :disabled="working" @click="cancel">更新を取り消す</button>
      </section>
      <section v-if="result" aria-label="マスター更新結果" class="panel">
        <h2 ref="resultHeading" tabindex="-1">更新結果</h2><p role="status">{{ importStatusLabels[result.history.status] }}</p>
        <p>対象版：{{ result.history.masterVersion }} · 実行日時：{{ localImportTime(result.history.completedAt) }}</p>
        <table><thead><tr><th>対象</th><th>実追加</th><th>保持</th><th>保留</th></tr></thead><tbody><tr v-for="(label, name) in masterCountLabels" :key="name"><th>{{ label }}</th><td>{{ result.counts[name].added }}</td><td>{{ result.counts[name].retained }}</td><td>{{ result.counts[name].held }}</td></tr></tbody></table>
        <p v-if="result.counts.lureVariants.held">追加0件でも確認待ちは保留のままです。</p>
        <button @click="show('history')">今回の取り込み履歴を確認</button>
      </section>
      <nav class="links" aria-label="マスターの関連画面">
        <button :disabled="working" @click="show('development')">開発履歴</button>
        <button :disabled="working" @click="show('history')">取り込み履歴</button>
        <button :disabled="working" @click="show('legacy')">旧形式データの取り込み</button>
      </nav>
    </template>
    <section v-else-if="view === 'development'" aria-label="ルアーマスター開発履歴">
      <h2>開発履歴</h2><p>開発内容の記録です。この端末への取り込み日時・適用状態を示すものではありません。概要は圏外でも閲覧できます。</p>
      <details v-for="entry in lureMasterDevelopmentHistory" :key="entry.rc" :data-rc="entry.rc"><summary>RC{{ entry.rc }} {{ entry.title }}</summary>
        <p>{{ entry.catalog }}</p><p>{{ entry.features }}</p><p>保留・注意：{{ entry.pending }}</p>
        <p v-for="doc in entry.documents" :key="doc"><a :href="developmentDocumentUrl(doc)" target="_blank" rel="noopener noreferrer">関連資料：{{ doc }}</a>（オンライン時）</p>
      </details>
    </section>
    <section v-else-if="view === 'history'" aria-label="ルアーマスター取り込み履歴">
      <h2>取り込み履歴</h2><p>日時は端末ローカル時刻です。RC34より前の適用日時は推測しません。過去の成功履歴から現在の適用状態は判断せず、差分確認を行ってください。</p>
      <p v-if="!working && historyCount === 0">この端末には取り込み履歴がありません</p>
      <article v-for="row in historyRows" :key="row.id" class="panel" :data-history-id="row.id">
        <h3>{{ row.kind === 'restore' ? 'バックアップ復元' : importStatusLabels[row.status] }}</h3>
        <p>実行日時：{{ localImportTime(row.startedAt) }} · 完了：{{ localImportTime(row.completedAt) }}</p>
        <template v-if="row.kind === 'import'">
          <p>対象版：{{ row.masterVersion }} · 所有オプション：{{ row.options.includePurchases ? 'ON' : 'OFF' }}</p>
          <table><thead><tr><th>対象</th><th>実追加</th><th>保持</th><th>保留</th></tr></thead><tbody><tr v-for="(label, name) in masterCountLabels" :key="name"><th>{{ label }}</th><td>{{ row.counts[name].added }}</td><td>{{ row.counts[name].retained }}</td><td>{{ row.counts[name].held }}</td></tr></tbody></table>
          <p v-if="row.error">{{ row.error.code }}：{{ row.error.message }}</p>
          <details v-if="row.details?.length"><summary>保留理由・出典 {{ row.details.length }}件</summary><ul><li v-for="(detail, index) in row.details.slice(0, detailLimits[row.id] ?? 10)" :key="index">{{ detail.naturalKey }}：{{ detail.reason }}</li></ul><button v-if="row.details.length > (detailLimits[row.id] ?? 10)" @click="detailLimits[row.id] = (detailLimits[row.id] ?? 10) + 10">理由をさらに10件表示</button></details>
          <details><summary>実行情報</summary><p>SHA-256：{{ row.manifestHash }}</p><p>照合規則版：{{ row.matchingVersion }}</p></details>
        </template>
        <p v-else>復元元：バックアップv{{ row.sourceBackupVersion }}（出力 {{ localImportTime(row.sourceExportedAt) }}）。データ文脈を切り替えました。</p>
        <details><summary>対象データ文脈</summary><p>{{ row.contextId }}</p><p v-if="row.kind === 'restore' && row.previousContextId">復元前：{{ row.previousContextId }}</p></details>
      </article>
      <nav v-if="historyCount" aria-label="取り込み履歴のページ"><button :disabled="working || historyPage === 0" @click="historyMove(-1)">新しい履歴</button><span>{{ historyPage + 1 }} / {{ Math.ceil(historyCount / 5) }}</span><button :disabled="working || (historyPage + 1) * 5 >= historyCount" @click="historyMove(1)">古い履歴</button></nav>
      <button :disabled="working" @click="loadHistory">履歴を再読み込み</button>
    </section>
    <LegacyLureCatalogPanel v-else ref="legacy" />
  </section>
</template>

<style scoped>
.master-screen { width: 100%; max-width: 760px; margin: auto; color: #263c36; overflow-wrap: anywhere; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; } h1 { font-size: 1.35rem; } h2 { font-size: 1.15rem; } h3 { font-size: 1rem; }
button, summary, .option { min-height: 44px; } button { padding: 10px 14px; border: 1px solid #c5d4ce; border-radius: 9px; background: #fff; color: #214b3c; margin: 6px 4px 6px 0; font-weight: 600; cursor: pointer; max-width: 100%; white-space: normal; } button:disabled { opacity: .5; cursor: default; }
.primary { background: #235f4b; color: white; width: 100%; } .option { display: flex; align-items: center; gap: 10px; padding: 8px 0; } input { width: 22px; height: 22px; flex-shrink: 0; }
.panel, .model { padding: 12px; border: 1px solid #d7e1db; border-radius: 12px; background: #fff; margin: 12px 0; } .model { background: #f5f8f6; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; } th, td { padding: 8px 5px; border-bottom: 1px solid #e2e8e4; text-align: left; } p { line-height: 1.6; } .note { font-size: .85rem; color: #586960; }
details { margin: 8px 0; } summary { padding: 10px 0; cursor: pointer; } ul { padding-left: 20px; } li { margin: 8px 0; } nav { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .links { margin-top: 18px; } [role="alert"] { color: #9a3524; background: #fff0eb; padding: 12px; border-radius: 9px; }
</style>
