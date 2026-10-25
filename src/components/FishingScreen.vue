<script setup lang="ts">
import { computed, ref } from "vue"
import { isCatch, countResults, lostDistanceLabels, actionLengthLabel } from "../db/database"
import TackleSnapshotDetails from './TackleSnapshotDetails.vue'
import TripWeatherPanel from './TripWeatherPanel.vue'
import TripTimeline from './TripTimeline.vue'
import TripEventEditor from './TripEventEditor.vue'
import { deleteTripEvent } from '../utils/tripEvents'
import { formatTimelineTime, timelineTimestamp } from '../utils/tripTimeline'
import type { readTripWeather } from '../utils/tripWeather'
const timelineWeather = ref<Awaited<ReturnType<typeof readTripWeather>>>({ location: undefined, hours: [], requests: [] })
const timelineWeatherError = ref('')
import type {
  CatchRecord,
  FishingStyle,
  FishingTrip,
  TripEvent,
  TripEventType,
} from "../db/database"

const props = defineProps<{
  trip: FishingTrip
  catches: CatchRecord[]
  events: TripEvent[]
  locationBusy?: boolean
}>()

const emit = defineEmits<{
  editInformation: []
  editFacility: []
  home: []
  addCatch: []
  editCatch: [record: CatchRecord]
  deleteCatch: [record: CatchRecord]
  endTrip: []
  recordEvent: [type: TripEventType]
  eventsChanged: []
  editTackles: []
}>()

const editingEvent = ref<TripEvent>()
const eventEditorOpen = ref(false)
const eventBusy = ref(false)
function eventTimeLabel(event: TripEvent) {
  const timestamp = event.timePrecision === 'unknown' ? null : timelineTimestamp(event.occurredAt)
  return timestamp === null ? '時刻不明' : `${event.timePrecision === 'approximate' ? '約 ' : ''}${formatTimelineTime(timestamp)}`
}
function openEvent(event?: TripEvent) { editingEvent.value = event; eventEditorOpen.value = true }
function eventSaved() { eventEditorOpen.value = false; emit('eventsChanged') }
async function removeEvent(event: TripEvent) {
  if (eventBusy.value || !confirm('このイベントを削除しますか？')) return
  eventBusy.value = true
  try { await deleteTripEvent(event); emit('eventsChanged') }
  catch (e) { alert(e instanceof Error ? e.message : '削除できませんでした。') }
  finally { eventBusy.value = false }
}

const sortedEvents = computed(() => [...props.events].sort((a,b) => new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime()))

const catchCount = computed(() => props.catches.filter(isCatch).length)
const results = computed(() => countResults(props.catches))
const lureResults = computed(() => {
  const groups = new Map<string, { label: string; catches: number; lost: number }>()
  for (const row of props.catches) {
    const key = row.lureVariantId !== undefined ? `variant:${row.lureVariantId}` : row.lureId !== undefined ? `owned:${row.lureId}` : JSON.stringify([row.lureName, row.lureColor])
    const group = groups.get(key) ?? { label: [row.lureName || 'ルアー不明', row.lureColor].filter(Boolean).join('・'), catches: 0, lost: 0 }
    if (isCatch(row)) group.catches++; else group.lost++
    groups.set(key, group)
  }
  return [...groups.values()]
})
const fishCounts = computed(() => {
  const names = new Map<string, number>()
  const groups = new Map<string, number>()
  for (const row of props.catches.filter(isCatch)) {
    const name = row.fishSpecies || '魚種未設定'
    const group = row.fishSpeciesGroup || '分類未設定'
    names.set(name, (names.get(name) ?? 0) + 1)
    groups.set(group, (groups.get(group) ?? 0) + 1)
  }
  return { names: [...names], groups: [...groups] }
})

const lastCatch = computed(() => {
  if (props.catches.length === 0) {
    return null
  }

  return props.catches[props.catches.length - 1]
})

function formatDate(date: string) {
  return date.replaceAll("-", "/")
}

function fishingStyleName(style: FishingStyle) {
  switch (style) {
    case "AREA_TROUT":
      return "エリアトラウト"
    case "CHUBBING":
      return "チャビング"
    case "NATIVE_TROUT":
      return "ネイティブトラウト"
    case "BASS":
      return "バス"
    default:
      return "その他"
  }
}
</script>

<template>
  <header class="header">
    <button class="back-button" :disabled="locationBusy" @click="emit('home')">
      ← ホーム
    </button>

    <span class="status">
      {{ trip.endedAt ? "終了" : "釣行中" }}
    </span>
  </header>

  <section class="trip-card">
    <div>
      <span class="label">釣り場</span>

      <h2>
        {{ trip.fishingAreaName }}
      </h2>

      <p>
        {{ formatDate(trip.fishingDate) }}
      </p>

      <small>
        {{ fishingStyleName(trip.fishingStyle ?? "AREA_TROUT") }}
      </small>
    </div>

    <div class="count-area">
      <span class="label">本日の釣果</span>

      <strong>
        {{ catchCount }}
      </strong>

      <span>匹</span>
      <p>キャッチ {{ catchCount }}匹／バラシ {{ results.lost }}回</p>
      <p v-for="(label, key) in lostDistanceLabels" :key="key">{{ label }}：{{ results.distances[key] }}回</p>
    </div>
  </section>

  <button v-if="trip.endedAt" type="button" class="back-button" :disabled="locationBusy" @click="emit('editInformation')">釣行情報を編集</button>
  <p v-if="trip.weather">天気：{{ trip.weather }}</p>
  <slot name="location" />
  <section class="card" aria-label="釣り場・施設"><h2>釣り場・施設</h2><p>現在の施設名：{{ trip.fishingAreaName }}</p><p>施設ID：{{ trip.facilityId || '未設定' }}</p><button class="back-button" type="button" :disabled="locationBusy" @click="emit('editFacility')">施設を設定・変更</button></section>
  <button
    v-if="!trip.endedAt"
    class="catch-button" :disabled="locationBusy"
    @click="emit('addCatch')"
  >
    🎣 釣れた！
  </button>

  <section class="card event-card">
    <h2>📣 放流・ペレット記録</h2>
    <div v-if="!trip.endedAt" class="event-buttons">
      <button type="button" class="event-button stocking" @click="emit('recordEvent', 'stocking')">🐟 放流を記録</button>
      <button type="button" class="event-button pellet" @click="emit('recordEvent', 'pellet')">🟤 ペレットを記録</button>
    </div>
    <button type="button" class="edit-catch" :disabled="locationBusy || eventBusy" @click="openEvent()">イベント追加</button>
    <p class="event-hint">日時は日本時間です。記録後も種別・日時・エリア・メモを編集できます。</p>
    <p v-if="!sortedEvents.length" class="event-hint">イベントはまだ記録されてへんで。</p>
    <div v-for="event in sortedEvents" :key="event.id" class="event-entry">
      <div class="event-entry-head">
        <strong>{{ event.type === 'stocking' ? '🐟 放流' : '🟤 ペレット' }}</strong>
        <span>{{ eventTimeLabel(event) }}</span>
        <button type="button" class="edit-catch" :disabled="locationBusy || eventBusy" @click="openEvent(event)">編集</button>
        <button type="button" class="edit-catch" :disabled="locationBusy || eventBusy" @click="removeEvent(event)">削除</button>
      </div>
      <p v-if="event.zoneId">{{ event.zoneName || event.zoneId }}</p>
      <p v-if="event.note">{{ event.note }}</p>
    </div>
  </section>

  <section class="card">
    <h2>現在のセッティング</h2>
    <button v-if="!trip.endedAt" type="button" class="back-button" :disabled="locationBusy" @click="emit('editTackles')">持参セットを追加・変更</button>

    <div class="setting">
      <span>ルアー</span>
      <strong>{{ lastCatch?.lureName || "未選択" }}</strong>
    </div>

    <div class="setting">
      <span>カラー</span>
      <strong>{{ lastCatch?.lureColor || "未選択" }}</strong>
    </div>

    <div class="setting">
      <span>レンジ</span>
      <strong>{{ lastCatch?.rangeLevel || "未選択" }}</strong>
    </div>

    <div class="setting">
      <span>巻き速度</span>
      <strong>{{ lastCatch?.retrieveSpeed || "未選択" }}</strong>
    </div>

    <div class="setting">
      <span>アクション</span>
      <strong>{{ lastCatch?.action || "未選択" }}</strong>
    </div>
    <div v-if="lastCatch" class="setting">
      <span>アクションの長さ</span>
      <strong>{{ actionLengthLabel(lastCatch.actionLength) }}</strong>
    </div>

    <div class="setting">
      <span>タックル</span>
      <strong>{{ lastCatch?.tackleSnapshot?.setName ?? '未指定' }}</strong>
    </div>
    <TackleSnapshotDetails v-if="lastCatch?.tackleSnapshot" :snapshot="lastCatch.tackleSnapshot" />
  </section>

  <TripEventEditor v-if="eventEditorOpen" :trip="trip" :event="editingEvent" @saved="eventSaved" @cancel="eventEditorOpen = false" />
  <TripTimeline :key="trip.id" :trip="trip" :catches="catches" :events="events" :hours="timelineWeather.hours" :requests="timelineWeather.requests" :location="timelineWeather.location" :weather-error="timelineWeatherError" />
  <TripWeatherPanel :key="trip.id" :trip="trip" @loaded="timelineWeather = $event; timelineWeatherError = ''" @load-error="timelineWeatherError = $event" />

  <section
    v-if="catches.length"
    class="card history" aria-label="釣果履歴"
  >
    <h2>今日の釣果</h2>
    <details><summary>ルアー別キャッチ・バラシ</summary>
      <p v-for="(item, index) in lureResults" :key="index">{{ item.label }}：キャッチ {{ item.catches }}匹／バラシ {{ item.lost }}回</p>
    </details>
    <details><summary>魚種・分類別の釣果数</summary>
      <p v-for="[name, count] in fishCounts.names" :key="name">{{ name }}：{{ count }}匹</p>
      <p v-for="[group, count] in fishCounts.groups" :key="group">{{ group }}：{{ count }}匹</p>
    </details>

    <div
      v-for="record in [...catches].reverse()"
      :key="record.id"
      class="catch-row"
    >
      <button type="button" class="edit-catch" :disabled="locationBusy" @click="emit('editCatch', record)">編集</button>
      <button type="button" class="edit-catch" :disabled="locationBusy" @click="emit('deleteCatch', record)">削除</button>
      <div>
        <strong>
          {{ record.resultType === 'lost' ? 'バラシ' : 'キャッチ' }} {{ record.resultType === 'lost' && record.lostDistance ? lostDistanceLabels[record.lostDistance] : '' }}
          <span v-if="isCatch(record)">{{ catches.slice(0, catches.indexOf(record) + 1).filter(isCatch).length }}匹目</span>
        </strong>
        <p>{{ record.fishSpecies || '魚種未設定' }}{{ record.fishSpeciesGroup ? `（${record.fishSpeciesGroup}）` : '' }}{{ record.fishSizeCm !== undefined ? ` / ${record.fishSizeCm}cm` : '' }}</p>
        <p v-if="record.locationSnapshot">{{ record.locationSnapshot.facilityName }}{{ record.locationSnapshot.zoneName ? ` / ${record.locationSnapshot.zoneName}` : '' }}</p>
        <p v-if="trip.facilityId && record.facilityId !== trip.facilityId && (record.zoneId || record.locationSnapshot?.zoneName)">旧施設・所属未確認のエリア（保存済みの所属を保持）</p>
        <p v-if="record.memo">{{ record.memo }}</p>
        <p class="catch-action">アクション: {{ record.action || '未選択' }} / 長さ: {{ actionLengthLabel(record.actionLength) }}</p>

        <small
          v-if="
            record.lureName ||
            record.lureColor ||
            record.rangeLevel ||
            record.retrieveSpeed
          "
          class="catch-lure"
        >
          <span>
            {{ record.lureName || "ルアー未選択" }}

            <template v-if="record.lureColor">
              ・{{ record.lureColor }}
            </template>
          </span>

          <span
            v-if="
              record.rangeLevel ||
              record.retrieveSpeed
            "
            class="catch-condition"
          >
            <template v-if="record.rangeLevel">
              {{ record.rangeLevel }}
            </template>

            <template v-if="record.retrieveSpeed">
              ・{{ record.retrieveSpeed }}
            </template>

          </span>
        </small>
        <TackleSnapshotDetails v-if="record.tackleSnapshot" :snapshot="record.tackleSnapshot" />
      </div>

      <span>
        {{
          record.caughtAt.toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })
        }}
      </span>
    </div>
  </section>

  <button
    v-if="!trip.endedAt"
    class="end-button" :disabled="locationBusy"
    @click="emit('endTrip')"
  >
    釣行を終了
  </button>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.status {
  padding: 7px 12px;
  border-radius: 999px;
  background: #e5f7ee;
  color: #087443;
  font-size: 13px;
  font-weight: 700;
}

.card,
.trip-card {
  padding: 20px;
  border: 1px solid #e4e8ec;
  border-radius: 18px;
  background: white;
  box-shadow: 0 8px 30px rgb(0 0 0 / 5%);
}

.card h2 {
  margin-top: 0;
  font-size: 19px;
}

.trip-card {
  display: flex;
  justify-content: space-between;
  gap: 20px;
}

.label {
  display: block;
  margin-bottom: 5px;
  color: var(--text-muted);
  font-size: 12px;
}

.trip-card h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.trip-card p {
  margin: 0 0 4px;
  color: var(--text-muted);
}

.trip-card small {
  color: #13795b;
  font-weight: 700;
}

.count-area {
  min-width: 100px;
  text-align: center;
}

.count-area strong {
  font-size: 48px;
  line-height: 1;
}

.catch-button {
  width: 100%;
  margin: 24px 0;
  padding: 24px;
  border: 0;
  border-radius: 18px;
  background: #13795b;
  color: white;
  font-size: 26px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 20px rgb(19 121 91 / 25%);
}

.catch-button:active {
  transform: scale(0.98);
}

.setting {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 0;
  border-top: 1px solid #edf0f2;
}

.setting span {
  color: var(--text-muted);
}

.setting strong {
  text-align: right;
}

.history {
  margin-top: 24px;
}

.catch-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 13px 0;
  border-top: 1px solid #edf0f2;
}

.catch-lure {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-weight: 400;
}

.catch-condition {
  display: block;
  margin-top: 3px;
  color: #13795b;
  font-weight: 700;
}

.back-button {
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: #13795b;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.end-button {
  width: 100%;
  margin-top: 24px;
  padding: 15px;
  border: 1px solid #d9dee3;
  border-radius: 14px;
  background: white;
  color: #5d6872;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 480px) {
  .trip-card {
    align-items: center;
  }

  .trip-card h2 {
    font-size: 17px;
  }

  .count-area strong {
    font-size: 42px;
  }
}
</style>
<style scoped>
.event-card { margin-top: 12px; }
.event-buttons { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:12px 0; }
.event-button { min-height:58px; border:0; border-radius:12px; font-size:15px; font-weight:800; cursor:pointer; }
.event-button.stocking { background:#e7f4fd; color:#155e82; }
.event-button.pellet { background:#fff0dc; color:#885014; }
.event-hint { font-size:12px; color:var(--text-muted); margin:12px 0; }
.event-entry { border-top:1px solid #edf0f2; padding:12px 0; overflow-wrap:anywhere; }
.event-entry-head { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
.event-entry-head span { margin-left:auto; }
@media(max-width:360px) { .event-buttons { grid-template-columns:1fr; } }
</style>

<style scoped>
.edit-catch { min-width:44px; min-height:44px; border:1px solid #13795b; border-radius:10px; background:white; color:#13795b; }
</style>
