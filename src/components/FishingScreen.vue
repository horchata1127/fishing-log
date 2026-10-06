<script setup lang="ts">
import { computed } from "vue"
import type {
  CatchRecord,
  FishingStyle,
  FishingTrip,
} from "../db/database"

const props = defineProps<{
  trip: FishingTrip
  catches: CatchRecord[]
}>()

const emit = defineEmits<{
  home: []
  addCatch: []
  endTrip: []
}>()

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

  <section class="card">
    <h2>現在のセッティング</h2>

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
      <strong>未選択</strong>
    </div>
  </section>

  <section
    v-if="catches.length"
    class="card history"
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