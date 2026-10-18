<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { CatchRecord, FishingTrip, TripWeatherHour, TripWeatherLocation, TripWeatherRequest } from '../db/database'
import { lostDistanceLabels } from '../db/database'
import { buildCatchSummary, buildTripTimeline, formatTimelineTime, layoutTimelineMarkers, markerLabels, markerSymbols, type TimelineEvent, type TimelineMarker } from '../utils/tripTimeline'
import HourlyCatchChart from './HourlyCatchChart.vue'
import WeatherAttribution from './WeatherAttribution.vue'

const props = defineProps<{ trip: FishingTrip; catches: CatchRecord[]; events: TimelineEvent[]; hours: TripWeatherHour[]; requests: TripWeatherRequest[]; location?: TripWeatherLocation; weatherError?: string }>()
const zone = ref('all'), includeUnset = ref(true), zoom = ref(1), viewport = ref(340)
const scroll = ref<HTMLElement>(), dialog = ref<HTMLDialogElement>(), selected = ref<TimelineMarker | null>(null)
const model = computed(() => buildTripTimeline(props.trip, props.catches, props.events, props.hours, zone.value, includeUnset.value))
const summary = computed(() => buildCatchSummary(props.trip, props.catches, zone.value, includeUnset.value))
const width = computed(() => Math.max(300, viewport.value) * zoom.value)
const layout = computed(() => model.value.range ? layoutTimelineMarkers(model.value.markers, model.value.range.start, model.value.range.end, width.value) : null)
const clipId = computed(() => `timeline-plot-${props.trip.id ?? 'unknown'}`)
const x = (time: number) => 84 + (time - model.value.range!.start) / (model.value.range!.end - model.value.range!.start) * (width.value - 112)
const temperatures = computed(() => model.value.segments.flatMap(segment => segment.map(p => p.temperatureC)))
const low = computed(() => temperatures.value.length ? Math.floor(Math.min(...temperatures.value) - 1) : 0)
const high = computed(() => temperatures.value.length ? Math.ceil(Math.max(...temperatures.value) + 1) : 1)
const y = (temperature: number) => 142 - (temperature - low.value) / (high.value - low.value) * 106
const paths = computed(() => model.value.segments.filter(s => s.length > 1).map(segment => segment.map((point, index) => `${index ? 'L' : 'M'}${x(point.timestamp)},${y(point.temperatureC)}`).join(' ')))
const points = computed(() => model.value.segments.flat().filter(p => model.value.range && p.timestamp >= model.value.range.start && p.timestamp <= model.value.range.end))
const ticks = computed(() => model.value.range ? Array.from({ length: viewport.value < 500 ? 3 : 5 }, (_, index) => {
  const count = viewport.value < 500 ? 2 : 4
  return model.value.range!.start + (model.value.range!.end - model.value.range!.start) * index / count
}) : [])
const usedRequests = computed(() => {
  const ids = new Set(props.hours.filter(h => h.tripId === props.trip.id).map(h => h.requestId))
  return props.requests.filter(r => r.tripId === props.trip.id && ids.has(r.id!))
})
const unknownEvents = computed(() => model.value.unknown.filter(m => m.kind === 'stocking' || m.kind === 'pellet'))
const unknownCatches = computed(() => model.value.unknown.filter(m => m.kind === 'catch' || m.kind === 'lost'))
const selectedCatch = computed(() => selected.value && ['catch','lost'].includes(selected.value.kind) ? selected.value.record as CatchRecord : null)
const selectedEvent = computed(() => selected.value && ['stocking','pellet'].includes(selected.value.kind) ? selected.value.record as TimelineEvent : null)
const markerTitle = (marker: TimelineMarker) => `${markerLabels[marker.kind]} ${marker.timestamp === null ? '時刻不明' : `${marker.precision === 'approximate' ? '約 ' : ''}${formatTimelineTime(marker.timestamp)}`}`
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!scroll.value) return
  viewport.value = scroll.value.clientWidth
  observer = new ResizeObserver(entries => { const entry = entries[0]; if (entry && entry.contentRect.width > 0) viewport.value = entry.contentRect.width })
  observer.observe(scroll.value)
})
onUnmounted(() => observer?.disconnect())
function close() { dialog.value?.close(); selected.value = null }
async function select(marker: TimelineMarker) { selected.value = marker; await nextTick(); dialog.value?.showModal() }
watch(() => props.trip.id, () => { close(); zone.value = 'all'; includeUnset.value = true; zoom.value = 1 })
watch(model, value => { if (selected.value && ![...value.markers, ...value.unknown, ...value.outside].some(m => m.key === selected.value!.key)) close() })
</script>

<template>
  <section class="card timeline" aria-label="統合タイムライン">
    <h2>統合タイムライン</h2>
    <div class="catch-summary" aria-label="釣行全体の釣果サマリー">
      <strong>総釣果：{{ summary.total }}匹</strong>
      <span>平均釣果ペース：{{ summary.pace === null ? '算出不可' : `${summary.pace.toFixed(2)}匹/時` }}</span>
      <span v-if="zone !== 'all'">表示中：{{ summary.displayed }}匹／全体：{{ summary.total }}匹</span>
    </div>
    <p v-if="summary.pace === null">{{ summary.paceReason === 'missing-end' ? '終了時刻が未設定のため算出不可です。釣行中も現在時刻で補完しません。' : '開始・終了時刻が不正・欠損、逆転、または経過時間が0のため算出不可です。' }}</p>
    <p v-else>平均は釣行の開始〜終了の経過時間と全体の釣果数から算出します。</p>
    <p v-if="summary.outsideCount">釣行時間外の釣果{{ summary.outsideCount }}匹も、元の記録時刻で集計に含めます。</p>
    <p>横軸は日本時間（JST）。マーカーをタップすると記録の詳細を確認できます。</p>
    <div class="controls">
      <label v-if="model.zones.length">釣果・バラシのエリア
        <select v-model="zone"><option value="all">すべてのエリア</option><option value="unset">エリア未設定のみ</option><option v-for="item in model.zones" :key="item.key" :value="item.key">{{ item.label }}（{{ item.count }}件）</option></select>
      </label>
      <label v-if="zone !== 'all' && zone !== 'unset'" class="check"><input v-model="includeUnset" type="checkbox" />エリア未設定も含める</label>
      <label>タイムラインの拡大率<select v-model.number="zoom"><option :value="1">全体（1倍）</option><option :value="2">2倍</option><option :value="4">4倍</option></select></label>
    </div>
    <p v-if="zone !== 'all'">絞り込みは釣果・バラシだけに適用します。気温と放流・ペレット散布は共通です。</p>
    <ul class="legend" aria-label="タイムラインの凡例"><li class="temperature">━ 気温（℃）</li><li v-for="(label, kind) in markerLabels" :key="kind" :class="kind">{{ markerSymbols[kind] }} {{ label }}</li><li>破線・「約」：概算時刻</li></ul>
    <p v-if="weatherError" role="alert">{{ weatherError }} 釣果・イベントは表示できます。</p>
    <p v-if="!temperatures.length">保存済み気温データはありません。釣果・イベントのみ表示します。</p>
    <p v-if="model.range">表示範囲：{{ formatTimelineTime(model.range.start) }} 〜 {{ formatTimelineTime(model.range.end) }} JST</p>
    <p v-if="model.range?.reason === 'records'">開始・終了時刻が揃わないため、保存済みの記録時刻などから表示範囲を決めています。実際の釣行時間を補完したものではありません。</p>
    <p v-if="model.range?.reason === 'calendar'">開始・終了時刻と記録時刻がないため、保存済み釣行日の1日分を表示します。</p>
    <p v-if="!model.range">有効な日時がないため時間軸を表示できません。元の記録は変更しません。</p>
    <p v-if="zoom > 1">グラフ内を横にスクロールできます。</p>
    <div ref="scroll" class="timeline-scroll" role="region" aria-label="タイムライングラフ（日本時間）" tabindex="0">
      <div v-if="model.range && layout" class="canvas" :style="{ width: `${width}px`, height: `${layout.height}px` }">
        <svg :width="width" :height="layout.height" aria-hidden="true">
          <defs><clipPath :id="clipId"><rect x="84" y="24" :width="width - 112" height="132" /></clipPath></defs>
          <template v-for="tick in ticks" :key="tick"><line :x1="x(tick)" y1="24" :x2="x(tick)" :y2="layout.height - 30" class="grid" /><text :x="x(tick)" :y="layout.height - 9" text-anchor="middle">{{ formatTimelineTime(tick, true) }}</text></template>
          <template v-if="temperatures.length"><text x="8" y="20">気温 ℃</text><template v-for="t in [low, (low + high) / 2, high]" :key="t"><text x="76" :y="y(t) + 4" text-anchor="end">{{ t.toFixed(1) }}</text><line x1="84" :y1="y(t)" :x2="width - 28" :y2="y(t)" class="grid" /></template></template>
          <g :clip-path="`url(#${clipId})`"><path v-for="(path, index) in paths" :key="index" :d="path" class="temperature-line" /><circle v-for="p in points" :key="p.timestamp" :cx="x(p.timestamp)" :cy="y(p.temperatureC)" r="3" class="temperature-point" /></g>
          <template v-for="lane in layout.lanes" :key="lane.kind"><text x="6" :y="lane.y + 4">{{ markerLabels[lane.kind] }}</text><line x1="84" :y1="lane.y" :x2="width - 28" :y2="lane.y" class="grid" /></template>
        </svg>
        <button v-for="item in layout.markers" :key="item.marker.key" type="button" :class="['timeline-marker', item.marker.kind, { approximate: item.marker.precision === 'approximate' }]"
          :data-timestamp="item.marker.timestamp" :data-marker-key="item.marker.key" :aria-label="markerTitle(item.marker)" :title="markerTitle(item.marker)"
          :style="{ left: `${item.x - 22}px`, top: `${item.y - 22}px` }" @click="select(item.marker)">{{ item.marker.precision === 'approximate' ? '約' : '' }}{{ markerSymbols[item.marker.kind] }}</button>
      </div>
    </div>
    <p>線は保存済みの毎正時のモデル推定値を直線で結んでいます。欠損や時間の抜けでは線を切ります。釣果時刻の気温の算出・実測表示は行いません。</p>
    <HourlyCatchChart :key="trip.id" :trip-id="trip.id" :bins="summary.bins" :total="summary.displayed" :unknown-count="summary.unknownCount" :period-too-long="summary.periodTooLong" />
    <div v-if="model.unknown.length" class="unplaced">
      <template v-if="unknownEvents.length"><h3>時刻不明イベント</h3><p>時刻を補完せず、時間軸の外に表示します。</p><button v-for="m in unknownEvents" :key="m.key" type="button" @click="select(m)">{{ markerTitle(m) }}：{{ (m.record as TimelineEvent).note || 'メモなし' }}</button></template>
      <template v-if="unknownCatches.length"><h3>時刻不明の釣果・バラシ</h3><button v-for="m in unknownCatches" :key="m.key" type="button" @click="select(m)">{{ markerTitle(m) }}</button></template>
    </div>
    <details v-if="model.outside.length"><summary>釣行時間外の記録（{{ model.outside.length }}件）</summary><button v-for="m in model.outside" :key="m.key" type="button" @click="select(m)">{{ markerTitle(m) }}</button></details>
    <details v-if="usedRequests.length"><summary>グラフの気象取得地点とモデル格子点</summary><div v-for="request in usedRequests" :key="request.id">
      <p>利用地点：{{ request.location.latitude }}, {{ request.location.longitude }}（手動設定）</p>
      <p v-if="request.response">モデル格子点：{{ request.response.latitude }}, {{ request.response.longitude }}／標高 {{ request.response.elevation ?? '不明' }}m</p>
      <p>取得期間：{{ request.startDayJst }} 〜 {{ request.endDayJst }}。取得日時：{{ request.fetchedAt ? formatTimelineTime(Date.parse(request.fetchedAt)) : '未記録' }} JST</p>
      <p v-if="location && (request.location.latitude !== location.latitude || request.location.longitude !== location.longitude)">現在の手動地点と異なる、前回取得地点の気象データを表示しています。</p>
    </div></details>
    <WeatherAttribution />
    <dialog v-if="selected" ref="dialog" class="marker-dialog" aria-labelledby="timeline-record-title" @cancel.prevent="close">
      <h3 id="timeline-record-title">{{ markerTitle(selected) }}</h3>
      <p v-if="selected.precision === 'approximate'">概算時刻の記録です。正確な時刻とは区別して表示しています。</p>
      <p v-if="selected.timestamp === null">正確な時刻は記録されていません。</p>
      <dl v-if="selectedCatch"><dt>ルアー</dt><dd>{{ selectedCatch.lureName || '未記録' }} {{ selectedCatch.lureColor || '' }}</dd><dt>魚種</dt><dd>{{ selectedCatch.fishSpecies || '未記録' }}</dd><dt>エリア</dt><dd>{{ selectedCatch.locationSnapshot?.zoneName || '未設定' }}</dd><dt>施設</dt><dd>{{ selectedCatch.locationSnapshot?.facilityName || '未記録' }}</dd><template v-if="selectedCatch.fishSizeCm !== undefined"><dt>全長</dt><dd>{{ selectedCatch.fishSizeCm }} cm</dd></template><template v-if="selectedCatch.lostDistance"><dt>バラシの距離</dt><dd>{{ lostDistanceLabels[selectedCatch.lostDistance] }}</dd></template><dt>メモ</dt><dd>{{ selectedCatch.memo || 'なし' }}</dd></dl>
      <p v-if="selectedEvent">{{ selectedEvent.note || 'メモなし' }}</p>
      <button type="button" autofocus @click="close">記録の詳細を閉じる</button>
    </dialog>
  </section>
</template>

<style scoped>
.timeline { min-width:0; padding:18px; border-radius:16px; background:var(--surface, #fff); color:var(--text); overflow-wrap:anywhere; }
.catch-summary { display:flex; flex-wrap:wrap; gap:6px 14px; padding:10px; border:1px solid #d3dadd; border-radius:8px; font-size:14px; }
h2 { margin-top:0; font-size:19px; } p { font-size:13px; line-height:1.65; } .controls { display:grid; gap:10px; } label { display:grid; gap:5px; font-size:14px; } select { width:100%; min-height:44px; font:inherit; color:var(--text); background:var(--surface, #fff); border:1px solid #aab4be; border-radius:8px; } .check { display:flex; align-items:center; min-height:44px; } .check input { width:22px; height:22px; }
.legend { display:flex; flex-wrap:wrap; gap:8px 14px; padding:0; list-style:none; font-size:13px; } .temperature { color:#a34111; } .catch { color:#126652; } .lost { color:#a12d40; } .stocking { color:#2857a0; } .pellet { color:#795012; }
.timeline-scroll { max-width:100%; overflow-x:auto; overscroll-behavior-x:contain; border:1px solid #d3dadd; border-radius:8px; } .canvas { position:relative; } svg { display:block; } svg text { fill:var(--text); font-size:11px; } .grid { stroke:#cbd3d9; stroke-width:1; stroke-dasharray:3 3; } .temperature-line { fill:none; stroke:#c56832; stroke-width:2.5; } .temperature-point { fill:#c56832; }
.timeline-marker { position:absolute; width:44px; height:44px; min-height:44px; border:2px solid currentColor; border-radius:9px; background:var(--surface, #fff); font-size:20px; cursor:pointer; padding:0; touch-action:manipulation; } .timeline-marker.approximate { border-style:dashed; font-size:15px; } button:focus-visible, select:focus-visible, .timeline-scroll:focus-visible { outline:3px solid #288e7f; outline-offset:2px; }
.unplaced button, details button, .marker-dialog button { display:block; width:100%; min-height:44px; margin:8px 0; padding:10px; font:inherit; color:var(--text); background:var(--surface, #fff); border:1px solid #aab4be; border-radius:8px; } summary { cursor:pointer; min-height:44px; padding-top:8px; }
.marker-dialog { box-sizing:border-box; width:calc(100% - 28px); max-width:480px; max-height:calc(100dvh - 32px); overflow-y:auto; padding:20px; color:var(--text); background:var(--surface, #fff); border:1px solid #aab4be; border-radius:16px; overflow-wrap:anywhere; } .marker-dialog::backdrop { background:rgb(0 0 0 / 45%); } dt { font-size:13px; margin-top:8px; } dd { margin:0; font-weight:700; }
</style>
