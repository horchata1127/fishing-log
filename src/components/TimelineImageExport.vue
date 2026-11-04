<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { FishingTrip } from '../db/database'
import { markerLabels } from '../utils/tripTimeline'
import { defaultTimelineImageOptions, type TimelineModel } from '../utils/timelineImage'
import { downloadReport, renderTimelinePng, shareReport } from '../utils/reportImage'
import TimelineImageCard from './TimelineImageCard.vue'
const props = defineProps<{ trip: FishingTrip; model: TimelineModel; scope: string; weatherError?: string }>()
const options = ref({ ...defaultTimelineImageOptions })
const expanded = ref(false)
const stage = ref<HTMLElement>(), imageUrl = ref(''), file = ref<File>()
const generating = ref(false), sharing = ref(false), status = ref(''), error = ref('')
let revision = 0, disposed = false
function invalidate() {
  revision++
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''; file.value = undefined; status.value = ''; error.value = ''
}
watch([() => props.trip, () => props.model, () => props.scope, () => props.weatherError, options], invalidate, { deep: true, flush: 'sync' })
onBeforeUnmount(() => { disposed = true; invalidate() })
async function generate() {
  if (generating.value || sharing.value) return
  invalidate(); const requestedRevision = revision
  generating.value = true
  try {
    await nextTick()
    const element = stage.value?.querySelector<HTMLElement>('[data-timeline-image-card]')
    if (!element) throw new Error('画像の準備ができていません。')
    const blob = await renderTimelinePng(element)
    if (disposed) return
    if (revision !== requestedRevision) { status.value = '内容が変更されました。画像を作成し直してください。'; return }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(props.trip.fishingDate ?? '') ? props.trip.fishingDate : 'undated'
    file.value = new File([blob], `fishing-log-${date}-timeline.png`, { type: 'image/png' })
    imageUrl.value = URL.createObjectURL(file.value)
    status.value = 'タイムライン画像を作成しました。保存・共有できます。'
  } catch (e) { if (!disposed) error.value = e instanceof Error ? e.message : 'タイムライン画像を作成できませんでした。' }
  finally { generating.value = false }
}
function save() {
  if (!file.value || generating.value || sharing.value) return
  downloadReport(file.value, imageUrl.value)
  status.value = 'タイムラインPNGの保存を開始しました。プレビュー画像の長押しでも保存できます。'
}
async function share() {
  if (!file.value || generating.value || sharing.value) return
  sharing.value = true; error.value = ''
  const requestedRevision = revision
  try {
    const result = await shareReport(file.value, `${props.trip.fishingDate ?? ''} ${props.trip.fishingAreaName}｜釣果・環境タイムライン`, imageUrl.value)
    if (disposed || revision !== requestedRevision) return
    status.value = result === 'shared' ? '共有先へタイムライン画像を渡しました。' : result === 'cancelled' ? '共有をキャンセルしました。' : '画像の共有を利用できないためタイムラインPNGの保存を開始しました。'
  } catch { if (!disposed) error.value = '共有できませんでした。画像の保存かプレビュー画像の長押しをお試しください。' }
  finally { sharing.value = false }
}
</script>

<template>
  <section class="timeline-export" aria-label="タイムライン画像出力">
    <details @toggle="expanded = ($event.target as HTMLDetailsElement).open"><summary>タイムライン画像を保存・共有</summary>
      <p>釣れたタイミングと環境の流れを、サマリーとは別の1枚の画像にします。現在のエリア絞り込みを反映し、画面の拡大率に関係なく表示範囲全体を出力します。</p>
      <p>釣果・バラシのエリア：{{ scope }}</p>
      <fieldset :disabled="generating || sharing"><legend>タイムライン画像に含める項目</legend>
        <label><input v-model="options.temperature" type="checkbox" />気温線</label>
        <label v-for="(label, kind) in markerLabels" :key="kind"><input v-model="options[kind]" type="checkbox" />{{ label }}</label>
        <label><input v-model="options.memo" type="checkbox" />釣行メモの抜粋</label>
      </fieldset>
      <p>横1080px・縦1600px以上のPNGです。高さは記録数と文章量に合わせて拡張します。凡例・表示範囲・注記を含み、画像内のスクロールはありません。</p>
      <button type="button" :disabled="generating || sharing" @click="generate">{{ generating ? 'タイムライン画像を作成中…' : 'タイムライン画像プレビューを作成' }}</button>
      <img v-if="imageUrl" :src="imageUrl" class="timeline-image-preview" alt="タイムラインPNGのプレビュー" />
      <div class="image-actions">
        <button type="button" :disabled="!file || generating || sharing" @click="save">タイムライン画像を保存</button>
        <button type="button" :disabled="!file || generating || sharing" @click="share">タイムライン画像を共有</button>
      </div>
      <p v-if="status" role="status">{{ status }}</p><p v-if="error" role="alert">{{ error }}</p>
      <p>iPhoneではプレビュー画像の長押しからも保存できます。共有に対応しない環境ではPNGを保存します。設定や記録を変えた場合は画像を作成し直してください。</p>
    </details>
    <div v-if="expanded" ref="stage" class="timeline-image-stage" data-timeline-image-stage aria-hidden="true" inert>
      <TimelineImageCard :trip="trip" :model="model" :options="options" :scope="scope" :weather-error="weatherError" />
    </div>
  </section>
</template>

<style scoped>
.timeline-export { min-width:0; margin-top:20px; border-top:1px solid #cbd3d9; padding-top:8px; }
summary { cursor:pointer; min-height:44px; padding:10px 0; font-weight:700; } p { font-size:14px; line-height:1.7; } fieldset { display:flex; flex-wrap:wrap; gap:6px 18px; min-width:0; padding:12px; border:1px solid #aab4be; border-radius:8px; }
label { display:flex; align-items:center; gap:8px; min-height:44px; font-size:14px; } input { width:22px; height:22px; } button { box-sizing:border-box; width:100%; min-width:0; min-height:44px; padding:10px; font:inherit; color:var(--text); background:var(--surface,#fff); border:1px solid #aab4be; border-radius:8px; } button:disabled { opacity:.5; }
.image-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; } .image-actions button { flex:1; min-width:120px; } .timeline-image-preview { display:block; max-width:100%; width:100%; height:auto; margin:14px 0; border:1px solid #cbd3d9; } [role=alert] { color:#9b2424; }
.timeline-image-stage { position:fixed; left:-12000px; top:0; width:1080px; pointer-events:none; }
</style>
