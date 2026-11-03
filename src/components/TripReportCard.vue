<script setup lang="ts">
import { computed, onMounted, onUpdated, ref } from 'vue'
import { excerpt, rateLabel, reportPage, type TripReport, type ReportOptions } from '../utils/tripReport'
const props = defineProps<{ report: TripReport; options: ReportOptions; mode: 'summary' | 'lures'; page: number }>()
const content = computed(() => reportPage(props.report, props.mode, props.page))
const body = ref<HTMLElement>(), footer = ref<HTMLElement>(), scale = ref(1)
function fit() {
  if (!body.value || !footer.value) return
  const available = footer.value.offsetTop - body.value.offsetTop - 16
  const next = Math.min(1, Math.floor(available / Math.max(1, body.value.scrollHeight) * 1000) / 1000)
  if (next !== scale.value) scale.value = next
}
onMounted(fit)
onUpdated(fit)
</script>
<template>
  <article class="report-card" :class="{ 'lure-report': mode === 'lures' }" data-report-card>
    <div ref="body" class="report-content" :style="{ transform: `scale(${scale})` }">
    <header>
      <div class="brand">FISHING LOG <span>{{ mode === 'summary' ? 'TRIP REPORT' : 'LURE REPORT' }}</span></div>
      <p class="date">{{ report.date }} <span v-if="mode === 'lures'">・ {{ content.page + 1 }} / {{ content.pageCount }}</span></p>
      <h1>{{ excerpt(report.area, 44) }}</h1>
      <p class="conditions">天気：{{ excerpt(report.weather, 36) }}　｜　釣行時間：{{ report.durationLabel }}</p>
    </header>
    <div class="totals">
      <div><span>キャッチ</span><strong>{{ report.catchCount }}<small> 匹</small></strong></div>
      <div><span>バラシ</span><strong>{{ report.lostCount }}<small> 回</small></strong></div>
      <div v-if="report.catchRate !== null"><span>釣果時速</span><strong>{{ rateLabel(report.catchRate) }}<small> 匹/時</small></strong></div>
      <div v-if="report.responseRate !== null"><span>反応時速</span><strong>{{ rateLabel(report.responseRate) }}<small> 回/時</small></strong></div>
    </div>
    <section v-if="options.mvp && mode === 'summary'" class="mvp">
      <h2>MVP <span>{{ report.mvp?.origin === 'user' ? 'ユーザー指定' : report.mvp ? '自動候補' : '未設定' }}{{ report.mvp?.provisional ? ' ・ 暫定' : '' }}</span></h2>
      <p>{{ excerpt(report.mvp?.name || '未設定', 36) }}</p>
      <small v-if="report.mvp?.color">{{ excerpt(report.mvp.color, 40) }}</small>
    </section>
    <section v-if="options.table || mode === 'lures'" class="lures" :class="{ standalone: mode === 'lures' }">
      <h2>ルアー別釣果 <span>全{{ report.rows.length }}件</span></h2>
      <table><thead><tr><th>ルアー / カラー</th><th>キャッチ</th><th>バラシ</th></tr></thead>
        <tbody><tr v-for="row in content.rows" :key="row.key"><td><div>{{ excerpt(row.name, 28) }}</div><small v-if="row.color">{{ excerpt(row.color, 30) }}</small></td><td>{{ row.catches }}</td><td>{{ row.lost }}</td></tr></tbody>
      </table>
      <p v-if="!content.rows.length" class="empty">釣果・バラシの記録はありません</p>
      <p v-if="content.omitted" class="omitted">ほか{{ content.omitted }}件：キャッチ{{ content.omittedCatch }}匹 / バラシ{{ content.omittedLost }}回（全件はルアー表画像へ）</p>
    </section>
    <section v-if="options.memo && mode === 'summary' && report.memo" class="note"><h2>釣行メモ（抜粋）</h2><p>{{ excerpt(report.memo, 76) }}</p></section>
    <section v-if="options.weather && mode === 'summary' && report.weatherSummary" class="note"><h2>気象・環境（観測の要約）</h2><p>{{ excerpt(report.weatherSummary, 68) }}</p></section>
    </div>
    <footer ref="footer">Fishing Log <span>{{ mode === 'lures' ? `ルアー表 ${content.page + 1}/${content.pageCount}` : '釣りの記録を、次の一投へ。' }}</span></footer>
  </article>
</template>
<style scoped>
.report-card { box-sizing:border-box; width:1080px; height:1350px; padding:50px 56px 70px; position:relative; overflow:hidden; background:#f4f8f5; color:#163c32; font-family:"Yu Gothic","Hiragino Kaku Gothic ProN",Meiryo,sans-serif; text-align:left; }
.brand { font-size:23px; letter-spacing:3px; font-weight:800; border-bottom:3px solid #1e7055; padding-bottom:16px; } .brand span { float:right; font-size:18px; letter-spacing:2px; color:#557267; }
.date { margin:18px 0 10px; color:#557267; font-size:24px; } h1 { font-size:38px; line-height:1.3; height:100px; margin:0; overflow:hidden; overflow-wrap:anywhere; word-break:break-all; } .conditions { font-size:22px; margin:2px 0 18px; }
.totals { display:flex; background:#174e3d; color:#fff; border-radius:16px; padding:20px 16px; margin:12px 0 18px; } .totals div { flex:1; padding:0 12px; } .totals span { display:block; font-size:20px; } .totals strong { display:block; font-size:44px; line-height:1.5; } .totals small { font-size:18px; font-weight:400; }
h2 { margin:0 0 8px; font-size:23px; line-height:1.4; } h2 span { font-size:18px; font-weight:400; margin-left:14px; } .mvp { margin:0 0 18px; padding:14px 22px; background:#e4eee4; border-left:6px solid #ad8644; border-radius:8px; } .mvp p { margin:0; font-size:26px; line-height:1.4; } .mvp small { display:block; font-size:21px; line-height:1.5; }
table { width:100%; border-collapse:collapse; table-layout:fixed; background:#fff; font-size:22px; } th { padding:8px 12px; font-size:18px; background:#e2eae5; text-align:left; } th:first-child { width:69%; } th:not(:first-child),td:not(:first-child) { width:15.5%; text-align:center; font-weight:700; } td { padding:4px 12px; border-bottom:1px solid #dae4dd; vertical-align:middle; line-height:25px; } td div { max-height:50px; overflow:hidden; overflow-wrap:anywhere; word-break:break-all; } td small { display:block; font-size:16px; line-height:20px; color:#52685e; height:20px; overflow:hidden; } .standalone td { padding-top:6px; padding-bottom:6px; }
.note { margin-top:14px; } .note h2 { font-size:20px; margin:0 0 4px; } .note p { margin:0; font-size:20px; line-height:1.5; } .empty,.omitted { font-size:18px; margin:8px 0; } footer { position:absolute; left:56px; right:56px; bottom:26px; border-top:1px solid #b6c9ba; padding-top:12px; font-size:17px; color:#557267; } footer span { float:right; }
.lure-report h1 { height:80px; font-size:32px; } .lure-report .date { font-size:20px; margin:12px 0 6px; } .lure-report .conditions { font-size:20px; margin:2px 0 8px; } .lure-report .totals { padding:10px 16px; margin:8px 0 14px; } .lure-report .totals span { font-size:16px; } .lure-report .totals strong { font-size:32px; line-height:1.4; }
.report-card:not(.lure-report) h1 { font-size:34px; line-height:1.3; height:90px; }
.report-card:not(.lure-report) .totals { padding-top:16px; padding-bottom:16px; }
.report-card:not(.lure-report) .totals strong { font-size:40px; line-height:1.4; }
.report-card:not(.lure-report) .mvp { padding-top:12px; padding-bottom:12px; margin-bottom:14px; }
.report-card:not(.lure-report) .mvp p { font-size:24px; line-height:1.3; } .report-card:not(.lure-report) .mvp small { font-size:19px; line-height:1.4; }
.note p { font-size:18px; line-height:1.5; } .note { margin-top:10px; }
.report-content { transform-origin:top center; }
</style>
