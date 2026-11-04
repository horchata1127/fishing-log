<script setup lang="ts">
import { computed, useId } from 'vue'
import type { FishingTrip } from '../db/database'
import { markerLabels, markerSymbols } from '../utils/tripTimeline'
import { buildTimelineImage, timelineImageColors, timelineTemperatureNote, timelineLogicalWidth,
  type TimelineImageOptions, type TimelineModel } from '../utils/timelineImage'
const props = defineProps<{ trip: FishingTrip; model: TimelineModel; options: TimelineImageOptions; scope: string; weatherError?: string }>()
const image = computed(() => buildTimelineImage(props.trip, props.model, props.options))
const clipId = `timeline-image-${useId().replace(/:/g, '')}`
</script>

<template>
  <article class="timeline-image-card" data-timeline-image-card>
    <header><strong>FISHING LOG</strong><span>TIMELINE</span></header>
    <p class="trip-date">{{ image.date }}</p>
    <h1>{{ image.area }}</h1>
    <h2>釣果・環境タイムライン</h2>
    <p class="range">表示範囲：{{ image.rangeLabel }}</p>
    <p v-if="image.rangeNote">{{ image.rangeNote }}</p>
    <p>釣果・バラシのエリア：{{ scope }}</p>
    <ul class="image-legend" data-image-legend>
      <li :style="{ color: timelineImageColors.temperature }">━ 気温（℃）{{ options.temperature ? '' : '［非表示］' }}</li>
      <li v-for="(label, kind) in markerLabels" :key="kind" :style="{ color: timelineImageColors[kind] }">{{ markerSymbols[kind] }} {{ label }}{{ options[kind] ? '' : '［非表示］' }}</li>
      <li>破線・「約」：概算時刻</li>
    </ul>
    <p v-if="weatherError" class="image-notice">{{ weatherError }}（保存済みの記録だけを表示）</p>
    <p v-if="options.temperature && !image.hasTemperature">保存済み気温なし。気温線は描画していません。</p>
    <svg v-if="image.range && image.layout" class="image-graph" role="img" aria-label="出力用タイムライングラフ"
      :width="968" :height="(image.layout.height + 18) * 2" :viewBox="`0 0 ${timelineLogicalWidth} ${image.layout.height + 18}`">
      <defs><clipPath :id="clipId"><rect x="84" y="24" :width="timelineLogicalWidth - 112" height="132" /></clipPath></defs>
      <template v-for="tick in image.ticks" :key="tick.timestamp">
        <line :x1="tick.x" y1="24" :x2="tick.x" :y2="image.layout.height - 30" class="image-grid" />
        <text :x="tick.x" :y="image.layout.height - 10" text-anchor="middle">{{ tick.day }}</text>
        <text :x="tick.x" :y="image.layout.height + 5" text-anchor="middle">{{ tick.time }}</text>
      </template>
      <template v-if="image.hasTemperature">
        <text x="8" y="20">気温 ℃</text>
        <template v-for="t in [image.low, (image.low + image.high) / 2, image.high]" :key="t">
          <text x="76" :y="image.y(t) + 4" text-anchor="end">{{ t.toFixed(1) }}</text>
          <line x1="84" :y1="image.y(t)" :x2="timelineLogicalWidth - 28" :y2="image.y(t)" class="image-grid" />
        </template>
      </template>
      <g :clip-path="`url(#${clipId})`">
        <path v-for="(path, index) in image.paths" :key="index" :d="path" class="image-temperature-line" />
        <circle v-for="point in image.points" :key="point.timestamp" :cx="image.x(point.timestamp)" :cy="image.y(point.temperatureC)" r="3" :fill="timelineImageColors.temperature" />
      </g>
      <template v-for="lane in image.layout.lanes" :key="lane.kind">
        <text x="6" :y="lane.y + 4">{{ markerLabels[lane.kind] }}</text>
        <line x1="84" :y1="lane.y" :x2="timelineLogicalWidth - 28" :y2="lane.y" class="image-grid" />
      </template>
      <g v-for="item in image.layout.markers" :key="item.marker.key" class="image-marker" :data-kind="item.marker.kind" :data-key="item.marker.key"
        :transform="`translate(${item.x},${item.y})`" :style="{ color: timelineImageColors[item.marker.kind] }">
        <rect x="-22" y="-22" width="44" height="44" rx="9" fill="#ffffff" stroke="currentColor" stroke-width="2" :stroke-dasharray="item.marker.precision === 'approximate' ? '4 3' : undefined" />
        <text y="7" text-anchor="middle" class="image-marker-symbol" :style="{ fontSize: item.marker.precision === 'approximate' ? '15px' : '20px' }">{{ item.marker.precision === 'approximate' ? '約' : '' }}{{ markerSymbols[item.marker.kind] }}</text>
      </g>
    </svg>
    <p v-if="!image.markers.length">表示範囲内の表示対象レコードはありません。</p>
    <section class="image-notes">
      <p>{{ timelineTemperatureNote }}</p>
      <p v-if="options.weather">☁ は手入力の気象・環境観測です。モデル推定気温とは別の記録です。</p>
      <p v-if="image.hasTemperature">Weather data by Open-Meteo.com（https://open-meteo.com/）<br />CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）<br />Historical Weather API / Best Match。保存済み取得値を整形してJST表示。現地の実測値ではありません。</p>
    </section>
    <section v-if="image.eventDetails.length"><h2>放流・ペレット・気象／環境の記録</h2><ul class="image-details"><li v-for="row in image.eventDetails" :key="row.key">{{ row.text }}</li></ul></section>
    <section v-if="image.unplaced.length"><h2>時刻不明・表示範囲外の記録</h2><p>時刻を補完・移動せず、時間軸の外に表示しています。</p><ul class="image-details"><li v-for="row in image.unplaced" :key="row.key">{{ row.text }}</li></ul></section>
    <section v-if="image.memo"><h2>釣行メモ（抜粋）</h2><p class="memo">{{ image.memo }}</p></section>
    <footer>Fishing Log · 保存済みデータから作成 · JST</footer>
  </article>
</template>

<style scoped>
.timeline-image-card { box-sizing:border-box; width:1080px; min-height:1600px; padding:48px 56px; background:#f4f8f5; color:#20332f; font-family:Arial,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif; font-size:24px; line-height:1.6; overflow-wrap:anywhere; }
header { display:flex; justify-content:space-between; border-bottom:3px solid #26735e; padding-bottom:18px; letter-spacing:3px; font-size:23px; } header span { color:#55766b; }
.trip-date { color:#55766b; margin:20px 0 4px; } h1 { font-size:38px; line-height:1.5; margin:0 0 12px; } h2 { font-size:27px; margin:18px 0 10px; } p { margin:12px 0; } .range { font-weight:bold; }
.image-legend { display:flex; flex-wrap:wrap; gap:10px 26px; list-style:none; padding:16px; border:1px solid #cbd3d9; border-radius:8px; font-size:24px; } .image-legend li { white-space:nowrap; }
.image-graph { display:block; width:968px; background:#ffffff; border-radius:8px; } .image-graph text { fill:#20332f; font-family:Arial,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif; font-size:11px; }
.image-grid { stroke:#cbd3d9; stroke-width:1; stroke-dasharray:3 3; } .image-temperature-line { fill:none; stroke:#c56832; stroke-width:2.5; } .image-marker-symbol { fill:currentColor !important; }
.image-notes { font-size:22px; color:#455c54; border-bottom:1px solid #cbd3d9; padding-bottom:16px; } .image-details { padding-left:30px; } .image-details li { margin:12px 0; } .memo { white-space:pre-wrap; } .image-notice { color:#8c3030; } footer { margin-top:32px; padding-top:14px; border-top:1px solid #cbd3d9; color:#55766b; font-size:21px; }
</style>
