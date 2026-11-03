<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import type { CatchRecord, FishingTrip, TripEvent, TripSummaryMvp } from '../db/database'
import { buildTripReport, defaultReportOptions, rateLabel, reportPage, reportShareText } from '../utils/tripReport'
import { saveTripMvp } from '../utils/tripReportStorage'
import { downloadReport, renderReportPng, shareReport } from '../utils/reportImage'
import TripReportCard from './TripReportCard.vue'
const props = defineProps<{ trip: FishingTrip; catches: CatchRecord[]; events: TripEvent[]; disabled?: boolean }>()
const emit = defineEmits<{ saved: [trip: FishingTrip] }>()
const report = computed(() => buildTripReport(props.trip, props.catches, props.events))
const draft = ref<TripSummaryMvp>({ name: props.trip.summaryMvp?.name ?? '', color: props.trip.summaryMvp?.color ?? '', provisional: props.trip.summaryMvp?.provisional ?? false })
const saving = ref(false), mvpStatus = ref(''), error = ref('')
const mode = ref<'summary' | 'lures'>('summary'), page = ref(0), options = ref({ ...defaultReportOptions })
const pagination = computed(() => reportPage(report.value, mode.value, page.value))
const generating = ref(false), sharing = ref(false), imageUrl = ref(''), file = ref<File>(), imageStatus = ref('')
const stage = ref<HTMLElement>()
const shareText = computed(() => reportShareText(report.value))
const xUrl = computed(() => `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText.value)}`)
let revision = 0
function invalidate() {
  revision++
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''; file.value = undefined; imageStatus.value = ''
}
watch([report, mode, page, options], invalidate, { deep: true, flush: 'sync' })
watch(() => props.trip.summaryMvp, value => {
  draft.value = { name: value?.name ?? '', color: value?.color ?? '', provisional: value?.provisional ?? false }
  mvpStatus.value = ''
}, { deep: true })
onBeforeUnmount(invalidate)
function chooseCandidate(event: Event) {
  const row = report.value.rows.find(row => row.key === (event.target as HTMLSelectElement).value)
  if (row) draft.value = { name: row.name, color: row.color, provisional: false }
}
async function saveMvp(clear = false) {
  if (saving.value) return
  saving.value = true; error.value = ''; mvpStatus.value = ''
  try {
    const value = clear ? undefined : { name: draft.value.name.trim(), color: draft.value.color?.trim() || undefined, provisional: draft.value.provisional }
    const trip = await saveTripMvp(structuredClone(toRaw(props.trip)), value)
    emit('saved', trip)
    await nextTick()
    mvpStatus.value = clear ? '指定を解除しました。自動候補を表示します。' : 'MVPを保存しました'
  } catch (e) { error.value = e instanceof Error ? e.message : 'MVPを保存できませんでした。' }
  finally { saving.value = false }
}
async function generate() {
  if (generating.value) return
  invalidate(); const requestedRevision = revision
  generating.value = true; error.value = ''
  try {
    await nextTick()
    const element = stage.value?.querySelector<HTMLElement>('[data-report-card]')
    if (!element) throw new Error('画像の準備ができていません。')
    const blob = await renderReportPng(element)
    if (revision !== requestedRevision) { imageStatus.value = '内容が変更されました。画像を作成し直してください。'; return }
    file.value = new File([blob], `fishing-log-${report.value.date}-${mode.value}${mode.value === 'lures' ? `-${pagination.value.page + 1}` : ''}.png`, { type: 'image/png' })
    imageUrl.value = URL.createObjectURL(file.value)
    imageStatus.value = '画像を作成しました。保存・共有できます。'
  } catch (e) { error.value = e instanceof Error ? e.message : '画像を作成できませんでした。' }
  finally { generating.value = false }
}
function saveImage() {
  if (!file.value) return
  downloadReport(file.value, imageUrl.value)
  imageStatus.value = 'PNGの保存を開始しました。プレビュー画像の長押しでも保存できます。'
}
async function share() {
  if (!file.value || sharing.value) return
  sharing.value = true; error.value = ''
  try {
    const result = await shareReport(file.value, shareText.value, imageUrl.value)
    imageStatus.value = result === 'shared' ? '共有先へ画像を渡しました。投稿は共有先で確認してください。' : result === 'cancelled' ? '共有をキャンセルしました。' : '画像の共有を利用できないためPNGの保存を開始しました。文面をコピーして画像を添付できます。'
  } catch { error.value = '共有できませんでした。「画像で保存」または画像の長押しをお試しください。' }
  finally { sharing.value = false }
}
async function copyText() {
  try { await navigator.clipboard.writeText(shareText.value); imageStatus.value = '投稿文をコピーしました' }
  catch { imageStatus.value = '投稿文を選択してコピーしてください。' }
}
</script>
<template>
  <section class="summary-panel" aria-label="釣行サマリー">
    <h2>釣行サマリー</h2>
    <p>{{ report.date }} ・ {{ report.area }}</p>
    <p>天気：{{ report.weather }} ／ 釣行時間：{{ report.durationLabel }}</p>
    <div class="summary-totals"><strong>キャッチ {{ report.catchCount }}匹</strong><strong>バラシ {{ report.lostCount }}回</strong>
      <span v-if="report.catchRate !== null">釣果時速 {{ rateLabel(report.catchRate) }}匹/時</span>
      <span v-if="report.responseRate !== null">反応時速 {{ rateLabel(report.responseRate) }}回/時</span>
    </div>
    <p v-if="report.durationMs === null">終了時刻と有効な釣行時間が確定すると時速を表示します。</p>
    <p v-else>釣果時速＝キャッチ数÷釣行時間。反応時速＝（キャッチ＋バラシ）÷釣行時間。</p>
    <p v-if="report.outsideCount">釣行時間外に記録されたキャッチ{{ report.outsideCount }}匹も含みます。</p>
    <div class="mvp-display"><h3>MVPルアー</h3>
      <p v-if="report.mvp"><strong>{{ report.mvp.name }}</strong> {{ report.mvp.color }} {{ report.mvp.provisional ? '（暫定）' : '' }}<br /><small>{{ report.mvp.origin === 'user' ? 'ユーザー指定' : '自動候補（キャッチ数を優先）' }}</small></p>
      <p v-else>未設定</p>
    </div>
    <details><summary>MVPを指定・編集</summary>
      <label>記録したルアーから選ぶ<select :disabled="saving || disabled" @change="chooseCandidate"><option value="">候補を選択</option><option v-for="row in report.rows" :key="row.key" :value="row.key">{{ row.name }} / {{ row.color || 'カラー未記録' }}</option></select></label>
      <label>MVPルアー名<input v-model="draft.name" maxlength="200" :disabled="saving || disabled" /></label>
      <label>MVPカラー<input v-model="draft.color" maxlength="200" :disabled="saving || disabled" /></label>
      <label class="check"><input v-model="draft.provisional" type="checkbox" :disabled="saving || disabled" />カラーは暫定</label>
      <div class="actions"><button type="button" :disabled="saving || disabled" @click="saveMvp()">MVPを保存</button><button type="button" :disabled="saving || disabled || !trip.summaryMvp" @click="saveMvp(true)">指定を解除</button></div>
      <p v-if="mvpStatus" role="status">{{ mvpStatus }}</p>
    </details>
    <details><summary>ルアー別釣果表（{{ report.rows.length }}件）</summary>
      <div class="table-scroll"><table aria-label="ルアー別釣果表"><thead><tr><th>ルアー / カラー</th><th>キャッチ</th><th>バラシ</th></tr></thead><tbody><tr v-for="row in report.rows" :key="row.key"><td>{{ row.name }}<small>{{ row.color }}</small></td><td>{{ row.catches }}</td><td>{{ row.lost }}</td></tr></tbody></table></div>
      <p v-if="!report.rows.length">釣果・バラシの記録はありません。</p>
    </details>
    <details class="export"><summary>サマリー画像・共有</summary>
      <label>画像の種類<select v-model="mode" :disabled="generating || sharing"><option value="summary">釣行サマリー</option><option value="lures">ルアー別釣果表（全件）</option></select></label>
      <label v-if="mode === 'lures' && pagination.pageCount > 1">出力ページ<select v-model.number="page" :disabled="generating || sharing"><option v-for="n in pagination.pageCount" :key="n" :value="n - 1">{{ n }} / {{ pagination.pageCount }}</option></select></label>
      <fieldset v-if="mode === 'summary'" :disabled="generating || sharing"><legend>画像に含める項目</legend><label class="check"><input v-model="options.mvp" type="checkbox" />MVP</label><label class="check"><input v-model="options.table" type="checkbox" />ルアー別釣果表（上位8件）</label><label class="check"><input v-model="options.memo" type="checkbox" />釣行メモの抜粋</label><label class="check"><input v-model="options.weather" type="checkbox" />気象ログの要約</label></fieldset>
      <p>1080 × 1350pxのPNGを作成します。設定や記録を変えた場合は作成し直してください。</p>
      <button type="button" :disabled="generating || sharing" @click="generate">{{ generating ? '画像を作成中…' : '画像プレビューを作成' }}</button>
      <img v-if="imageUrl" :src="imageUrl" class="preview" alt="釣行レポートPNGのプレビュー" width="1080" height="1350" />
      <div class="actions"><button type="button" :disabled="!file || generating || sharing" @click="saveImage">画像で保存</button><button type="button" :disabled="!file || generating || sharing" @click="share">共有</button></div>
      <p v-if="imageStatus" role="status">{{ imageStatus }}</p>
      <p>iPhoneではプレビュー画像の長押しから保存することもできます。共有先でXを選ぶか、画像を保存して投稿画面に添付してください。</p>
      <label>投稿文<textarea readonly rows="4" :value="shareText" /></label>
      <button type="button" @click="copyText">投稿文をコピー</button>
      <a :href="xUrl" target="_blank" rel="noopener noreferrer">Xの投稿画面を開く（文面のみ）</a>
    </details>
    <p v-if="error" role="alert">{{ error }}</p>
    <div ref="stage" class="render-stage" data-report-stage aria-hidden="true" inert><TripReportCard :report="report" :options="options" :mode="mode" :page="pagination.page" /></div>
  </section>
</template>
<style scoped>
.summary-panel { min-width:0; padding:18px; margin:14px 0; border-radius:16px; background:var(--surface,#fff); color:var(--text); overflow-wrap:anywhere; } h2 { margin-top:0; } p { font-size:14px; line-height:1.7; } .summary-totals { display:flex; flex-wrap:wrap; gap:10px 20px; padding:14px; background:#e8f3ed; color:#174e3d; border-radius:10px; } .mvp-display { border-left:4px solid #ad8644; padding-left:14px; margin:16px 0; } .mvp-display h3 { margin-bottom:4px; } summary { min-height:44px; cursor:pointer; padding:10px 0; box-sizing:border-box; } label { display:grid; gap:6px; margin:10px 0; font-size:14px; } input,select,textarea,button { box-sizing:border-box; width:100%; min-width:0; min-height:44px; padding:10px; font:inherit; border:1px solid #aab4be; border-radius:8px; background:var(--surface,#fff); color:inherit; } .check { display:flex; align-items:center; min-height:44px; gap:8px; } .check input { width:22px; height:22px; min-height:22px; } .actions { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; } .actions button { flex:1; min-width:120px; } fieldset { min-width:0; border:1px solid #ccd8d0; border-radius:8px; } .table-scroll { overflow-x:auto; } table { width:100%; border-collapse:collapse; font-size:14px; } th,td { padding:10px 6px; border-bottom:1px solid #d5dfd8; text-align:left; } td small { display:block; } td:first-child { min-width:140px; } th:not(:first-child) { white-space:nowrap; } .preview { display:block; width:100%; height:auto; margin:14px 0; border:1px solid #ccd8d0; border-radius:8px; } a { display:block; min-height:44px; padding:12px 0; color:var(--text); } [role=alert] { color:#9b2424; } .render-stage { position:fixed; left:-12000px; top:0; width:1080px; pointer-events:none; }
</style>
