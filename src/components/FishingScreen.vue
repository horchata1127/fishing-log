<script setup lang="ts">
import { computed, ref } from "vue"
import TackleSnapshotDetails from './TackleSnapshotDetails.vue'
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
}>()

const emit = defineEmits<{
  home: []
  addCatch: []
  endTrip: []
  recordEvent: [type: TripEventType]
  updateEvent: [event: TripEvent, dateTime: string]
  editTackles: []
}>()

const editingEventId = ref<number | null>(null)
const eventDateTime = ref('')

function toLocalDateTime(date: Date) {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function beginEdit(event: TripEvent) {
  editingEventId.value = event.id ?? null
  eventDateTime.value = toLocalDateTime(event.occurredAt)
}

function saveEdit(event: TripEvent) {
  if (!eventDateTime.value) return
  emit('updateEvent', event, eventDateTime.value)
  editingEventId.value = null
}

const sortedEvents = computed(() => [...props.events].sort((a,b) => new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime()))

const catchCount = computed(() => props.catches.length)

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
    <button class="back-button" @click="emit('home')">
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
    </div>
  </section>

  <button
    v-if="!trip.endedAt"
    class="catch-button"
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
    <p class="event-hint">ボタンを押した時刻で記録するで。あとから時刻も修正できるよ。</p>
    <p v-if="!sortedEvents.length" class="event-hint">イベントはまだ記録されてへんで。</p>
    <div v-for="event in sortedEvents" :key="event.id" class="event-entry">
      <div class="event-entry-head">
        <strong>{{ event.type === 'stocking' ? '🐟 放流' : '🟤 ペレット' }}</strong>
        <span>{{ new Date(event.occurredAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) }}</span>
        <button type="button" class="edit-time" @click="beginEdit(event)">時刻修正</button>
      </div>
      <div v-if="editingEventId === event.id" class="event-editor">
        <input v-model="eventDateTime" type="datetime-local" aria-label="イベントの日時" />
        <button type="button" @click="saveEdit(event)">保存</button>
        <button type="button" @click="editingEventId = null">やめる</button>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>現在のセッティング</h2>
    <button v-if="!trip.endedAt" type="button" class="back-button" @click="emit('editTackles')">持参セットを追加・変更</button>

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

    <div class="setting">
      <span>タックル</span>
      <strong>{{ lastCatch?.tackleSnapshot?.setName ?? '未指定' }}</strong>
    </div>
    <TackleSnapshotDetails v-if="lastCatch?.tackleSnapshot" :snapshot="lastCatch.tackleSnapshot" />
  </section>

  <section
    v-if="catches.length"
    class="card history" aria-label="釣果履歴"
  >
    <h2>今日の釣果</h2>

    <div
      v-for="(record, index) in [...catches].reverse()"
      :key="record.id"
      class="catch-row"
    >
      <div>
        <strong>
          {{ catches.length - index }}匹目
        </strong>

        <small
          v-if="
            record.lureName ||
            record.lureColor ||
            record.rangeLevel ||
            record.retrieveSpeed ||
            record.action
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
              record.retrieveSpeed ||
              record.action
            "
            class="catch-condition"
          >
            <template v-if="record.rangeLevel">
              {{ record.rangeLevel }}
            </template>

            <template v-if="record.retrieveSpeed">
              ・{{ record.retrieveSpeed }}
            </template>

            <template v-if="record.action">
              ・{{ record.action }}
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
    class="end-button"
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
  color: #7b8792;
  font-size: 12px;
}

.trip-card h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.trip-card p {
  margin: 0 0 4px;
  color: #69747e;
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
  color: #69747e;
}

.setting strong {
  text-align: right;
}

.history {
  margin-top: 24px;
}

.catch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 13px 0;
  border-top: 1px solid #edf0f2;
}

.catch-lure {
  display: block;
  margin-top: 4px;
  color: #69747e;
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
.event-hint { font-size:12px; color:#69747e; margin:12px 0; }
.event-entry { border-top:1px solid #edf0f2; padding:12px 0; }
.event-entry-head { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
.event-entry-head span { margin-left:auto; }
.edit-time { border:1px solid #d9dee3; border-radius:8px; background:white; color:#13795b; padding:7px; }
.event-editor { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
.event-editor input { min-width:190px; flex:1; padding:8px; border:1px solid #d9dee3; border-radius:8px; }
.event-editor button { padding:8px; border:1px solid #d9dee3; border-radius:8px; background:white; color:#13795b; }
@media(max-width:360px) { .event-buttons { grid-template-columns:1fr; } }
</style>
