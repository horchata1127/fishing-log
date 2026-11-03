<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CatchHourBucket, TimelineMarker } from '../utils/tripTimeline'
import { formatTimelineTime } from '../utils/tripTimeline'
import { observationLabel } from '../db/database'
const props = defineProps<{ bins: CatchHourBucket[]; tripId?: number; total: number; unknownCount: number; periodTooLong: boolean; weatherMarkers?: TimelineMarker[] }>()
const emit = defineEmits<{ selectWeather: [marker: TimelineMarker] }>()
const weatherLayout = computed(() => {
  const lanes: number[] = []
  const markers = []
  for (const marker of props.weatherMarkers ?? []) {
    if (marker.timestamp === null) continue
    const index = props.bins.findIndex(bin => bin.timestamp !== null && marker.timestamp! >= bin.timestamp && marker.timestamp! < bin.timestamp + 3600000)
    if (index < 0) continue
    const x = (index + (marker.timestamp - props.bins[index]!.timestamp!) / 3600000) * 76
    let lane = lanes.findIndex(last => x - last >= 46)
    if (lane < 0) lane = lanes.length
    lanes[lane] = x
    markers.push({ marker, x, top: lane * 46, label: `${formatTimelineTime(marker.timestamp)} ${observationLabel(marker.record.weatherObservation)}` })
  }
  return { markers, height: lanes.length * 46 }
})
const selectedKey = ref('')
const maximum = computed(() => Math.max(1, ...props.bins.map(bin => bin.count)))
const selected = computed(() => props.bins.find(bin => bin.key === selectedKey.value))
const title = (bin: CatchHourBucket) => `${bin.dayJst ? `${bin.dayJst} ` : ''}${bin.label}：${bin.count}匹`
watch(() => props.tripId, () => { selectedKey.value = '' })
</script>

<template>
  <section class="hourly-catches" aria-label="時間帯別釣果">
    <h3>時間帯別釣果（JST）</h3>
    <p>表示中の合計：{{ total }}匹。棒をタップすると時間帯と匹数を確認できます。</p>
    <p v-if="unknownCount">時刻不明の{{ unknownCount }}匹は時刻を補完せず、別の棒に表示します。</p>
    <p v-if="periodTooLong">保存日時の範囲が366日を超えるため、時間帯の描画を省略し「期間過大」に合計を表示します。元の日時は変更しません。</p>
    <p v-if="!bins.length">時間帯を決められる日時がありません。釣果時刻や釣行の開始・終了日時を確認してください。</p>
    <div v-else class="hour-scroll" role="region" aria-label="時間帯別釣果グラフ（横にスクロール）" tabindex="0">
      <div class="hour-content">
      <div class="bars">
        <button v-for="bin in bins" :key="bin.key" type="button" class="hour-bar" :class="{ selected: selectedKey === bin.key }" :aria-label="title(bin)" :aria-pressed="selectedKey === bin.key"
          :data-hour="bin.key" :data-count="bin.count" @click="selectedKey = bin.key">
          <span class="count">{{ bin.count }}匹</span>
          <svg width="36" height="100" aria-hidden="true"><line x1="0" y1="98" x2="36" y2="98" /><rect x="5" :y="98 - bin.count / maximum * 92" width="26" :height="bin.count / maximum * 92" rx="3" /></svg>
          <span v-if="bin.dayJst" class="day">{{ bin.dayJst }}</span><span>{{ bin.label }}</span>
        </button>
      </div>
      <div v-if="weatherLayout.markers.length" class="hour-weather" :style="{ height: `${weatherLayout.height}px` }" role="region" aria-label="釣果グラフの気象イベント">
        <button v-for="item in weatherLayout.markers" :key="item.marker.key" type="button" :aria-label="item.label" :title="item.label" :data-timestamp="item.marker.timestamp" :style="{ left: `${item.x}px`, top: `${item.top}px` }" @click="emit('selectWeather', item.marker)">☁</button>
      </div>
      </div>
    </div>
    <p v-if="weatherLayout.markers.length">☁ は記録した気象・環境。時間帯の中の発生時刻に配置しています。タップで詳細を確認できます。</p>
    <p :role="selected ? 'status' : undefined" aria-live="polite">{{ selected ? title(selected) : '時間帯は日本時間の毎時00分〜59分で集計します。' }}</p>
  </section>
</template>

<style scoped>
.hourly-catches { margin-top:16px; min-width:0; } h3 { font-size:16px; margin-bottom:8px; } p { font-size:13px; line-height:1.65; }
.hour-scroll { max-width:100%; overflow-x:auto; overscroll-behavior-x:contain; border:1px solid #d3dadd; border-radius:8px; }
.bars { display:flex; align-items:stretch; width:max-content; min-width:100%; }
.hour-bar { flex:0 0 76px; box-sizing:border-box; width:76px; min-height:192px; display:flex; align-items:center; flex-direction:column; justify-content:flex-end; gap:5px; padding:10px 3px; border:0; border-right:1px solid #e4e8ec; background:var(--surface,#fff); color:var(--text); font:inherit; font-size:13px; cursor:pointer; touch-action:manipulation; }
.hour-bar.selected { background:#e5f7ee; color:#126652; } .count { font-weight:700; } .day { font-size:11px; white-space:nowrap; } rect { fill:#237d69; } line { stroke:#80918b; }
.hour-bar:focus-visible,.hour-scroll:focus-visible { outline:3px solid #288e7f; outline-offset:-3px; }
.hour-content { width:max-content; min-width:100%; padding-right:44px; } .hour-weather { position:relative; } .hour-weather button { position:absolute; box-sizing:border-box; width:44px; height:44px; border:1px solid #5267a0; border-radius:8px; background:var(--surface,#fff); color:var(--text); font-size:20px; }
</style>
