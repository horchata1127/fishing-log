<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { weatherTripRange, type FishingTrip } from '../db/database'
import { fetchTripWeather, readTripWeather, saveWeatherLocation } from '../utils/tripWeather'
import WeatherAttribution from './WeatherAttribution.vue'

const props = defineProps<{ trip: FishingTrip }>()
const view = ref<Awaited<ReturnType<typeof readTripWeather>>>({ location: undefined, hours: [], requests: [] })
const latitude = ref(''), longitude = ref(''), busy = ref(false), message = ref(''), error = ref('')
const controller = ref<AbortController>()
const range = computed(() => { try { return weatherTripRange(props.trip) } catch { return null } })
const latest = computed(() => view.value.requests.at(-1))
const savedRequest = computed(() => view.value.requests.find(r => r.id === view.value.hours[0]?.requestId))
const locationChanged = computed(() => latitude.value.trim() === '' || longitude.value.trim() === '' ||
  Number(latitude.value) !== view.value.location?.latitude || Number(longitude.value) !== view.value.location?.longitude)
const dataLocationChanged = computed(() => savedRequest.value && view.value.location &&
  (savedRequest.value.location.latitude !== view.value.location.latitude || savedRequest.value.location.longitude !== view.value.location.longitude))
const dataPeriodChanged = computed(() => savedRequest.value && (savedRequest.value.tripStartedAt !== new Date(props.trip.startedAt).toISOString() ||
  savedRequest.value.tripEndedAt !== (props.trip.endedAt ? new Date(props.trip.endedAt).toISOString() : undefined)))
const statusLabels = { pending: '前回の取得が未完了です。手動で再試行できます。', complete: '取得済み', partial: '一部欠損・未提供あり', unavailable: 'アーカイブ提供待ち・再試行可能', error: '取得失敗・再試行可能', superseded: '別の取得操作により保存を中止' }
const displayTime = (value: number | string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
const value = (n: number | null) => n === null ? '—' : String(n)
async function load() {
  if (!props.trip.id) return
  view.value = await readTripWeather(props.trip.id)
}
watch(() => props.trip.id, async () => {
  controller.value?.abort(); error.value = ''; message.value = ''
  try { await load(); latitude.value = view.value.location ? String(view.value.location.latitude) : ''; longitude.value = view.value.location ? String(view.value.location.longitude) : '' }
  catch { error.value = '保存済み気象データを読み込めませんでした。' }
}, { immediate: true })
onUnmounted(() => controller.value?.abort())
async function saveLocation() {
  if (busy.value || !props.trip.id) return
  error.value = ''; message.value = ''
  if (!latitude.value.trim() || !longitude.value.trim()) { error.value = '緯度・経度の両方を入力してください。'; return }
  busy.value = true
  try { await saveWeatherLocation(props.trip.id, Number(latitude.value), Number(longitude.value)); await load(); message.value = '手動地点を保存しました。気象の取得には下のボタンを押してください。' }
  catch (e) { error.value = e instanceof Error ? e.message : '地点を保存できませんでした。' }
  finally { busy.value = false }
}
async function retrieve() {
  if (busy.value || !props.trip.id || locationChanged.value) return
  busy.value = true; error.value = ''; message.value = ''; controller.value = new AbortController()
  try { await fetchTripWeather(props.trip.id, { signal: controller.value.signal }); message.value = '過去の気象データを保存しました。' }
  catch (e) { error.value = e instanceof Error ? e.message : '通信できませんでした。保存済みデータは保持しています。' }
  finally { try { await load() } catch { error.value = '気象データの再読み込みに失敗しました。画面を開き直してください。' }; busy.value = false; controller.value = undefined }
}
</script>

<template>
  <section class="card weather-panel" aria-label="気象データ">
    <details>
      <summary>気象データ</summary>
      <p><strong>対象施設：</strong>{{ trip.fishingAreaName }}</p>
      <p v-if="range">対象釣行日（日本時間）：{{ range.startDayJst }}<template v-if="range.endDayJst !== range.startDayJst"> 〜 {{ range.endDayJst }}</template></p>
      <p v-else role="alert">釣行の開始・終了日時を確認してください。</p>
      <p v-if="range && trip.fishingDate !== range.startDayJst" class="notice">保存済み日付 {{ trip.fishingDate }} と開始日時の日本時間の日付が異なります。気象は {{ range.startDayJst }} を基準に取得します。元の記録は変更しません。</p>
      <p v-if="!trip.endedAt">釣行中は開始日のみを対象にします。終了後に再取得すると終了日まで含みます。自動通信は行いません。</p>
      <p role="status">取得状態：{{ busy ? '処理中…' : latest ? statusLabels[latest.status] : '未取得' }}</p>
      <p v-if="latest?.message && !error">{{ latest.message }}</p>
      <form @submit.prevent="saveLocation">
        <p>手動地点（WGS84）。未承認の施設座標は使用しません。</p>
        <label>緯度<input v-model="latitude" type="text" inputmode="decimal" autocomplete="off" :disabled="busy" placeholder="緯度（-90〜90）" /></label>
        <label>経度<input v-model="longitude" type="text" inputmode="decimal" autocomplete="off" :disabled="busy" placeholder="経度（-180〜180）" /></label>
        <button type="submit" :disabled="busy || !range">地点を保存</button>
      </form>
      <p v-if="view.location">使用座標：{{ view.location.latitude }}, {{ view.location.longitude }}（手動設定）</p>
      <p v-if="locationChanged && view.location">入力を変更した場合は、先に地点を保存してください。</p>
      <p>無料APIは非商用利用向けです。取得時に地点座標と対象日をOpen-Meteoへ送信します。データの提供に数日かかることがあります。</p>
      <p v-if="view.hours.length">再取得に成功すると、この釣行の保存済み気象を更新します。取得失敗時は保持します。</p>
      <button type="button" :disabled="busy || !view.location || locationChanged || !range" @click="retrieve">{{ view.hours.length ? '過去の気象データを再取得' : '過去の気象データを取得' }}</button>
      <button v-if="busy && controller" type="button" @click="controller.abort()">取得を中止</button>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
      <template v-if="savedRequest">
        <p>最終取得日時：{{ displayTime(savedRequest.fetchedAt!) }} JST</p>
        <p>保存済みデータの利用地点：{{ savedRequest.location.latitude }}, {{ savedRequest.location.longitude }}（手動）</p>
        <p v-if="savedRequest.response">モデルのグリッド地点：{{ savedRequest.response.latitude }}, {{ savedRequest.response.longitude }}／標高 {{ savedRequest.response.elevation ?? '不明' }}m／{{ savedRequest.response.timezone }}（UTC+9）</p>
        <p>保存期間：{{ savedRequest.startDayJst }} 〜 {{ savedRequest.endDayJst }}。欠損 {{ savedRequest.missingValues }}項目／未提供 {{ savedRequest.missingHours }}時間。</p>
        <p v-if="dataLocationChanged || dataPeriodChanged" class="notice">保存済み気象は現在の地点・釣行期間と異なります。再取得するまで、前回の地点・期間のデータを表示します。</p>
      </template>
      <p>時刻は日本時間（JST）。降水量は表示時刻までの直前1時間の合計、地表気圧は海面更正気圧とは異なります。</p>
      <div v-if="view.hours.length" class="weather-table" tabindex="0" role="region" aria-label="時間別気象データ（横にスクロール）">
        <table><caption>時間別気象データ</caption><thead><tr><th scope="col">時刻 JST</th><th scope="col">気温 ℃</th><th scope="col">降水量 mm</th><th scope="col">風速 m/s</th><th scope="col">湿度 %</th><th scope="col">地表気圧 hPa</th><th scope="col">天気コード</th></tr></thead>
          <tbody><tr v-for="hour in view.hours" :key="hour.timestamp"><th scope="row">{{ displayTime(hour.timestamp) }}</th><td>{{ value(hour.temperatureC) }}</td><td>{{ value(hour.precipitationMm) }}</td><td>{{ value(hour.windSpeedMs) }}</td><td>{{ value(hour.relativeHumidityPct) }}</td><td>{{ value(hour.surfacePressureHpa) }}</td><td>{{ value(hour.weatherCode) }}</td></tr></tbody>
        </table>
      </div>
      <WeatherAttribution />
    </details>
  </section>
</template>
<style scoped>
.weather-panel { min-width:0; overflow-wrap:anywhere; } summary { cursor:pointer; font-size:18px; font-weight:700; min-height:44px; padding-top:10px; }
form { display:grid; gap:10px; } label { display:grid; gap:5px; } input { box-sizing:border-box; width:100%; min-height:44px; padding:10px; font:inherit; border:1px solid #ccd3d8; border-radius:8px; }
button { min-height:44px; width:100%; padding:10px; margin-top:8px; font:inherit; border:1px solid #ccd3d8; border-radius:8px; background:white; color:var(--text); } button:disabled { opacity:.55; }
.weather-table { max-width:100%; overflow-x:auto; } table { border-collapse:collapse; white-space:nowrap; font-size:13px; } th,td { border-bottom:1px solid #ddd; padding:10px; text-align:right; } caption { text-align:left; font-weight:700; } .notice { border-left:3px solid #997329; padding-left:10px; } [role=alert] { color:#9b2424; }
</style>
