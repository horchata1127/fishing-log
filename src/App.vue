<script setup lang="ts">
import LureCatalogImportPanel from './LureCatalogImportPanel.vue'
import { onMounted, ref } from 'vue'
import CatchModal from './components/CatchModal.vue'
import FishingScreen from './components/FishingScreen.vue'
import MyLuresScreen from './components/MyLuresScreen.vue'
import { exportBackup, importBackup } from './utils/backup'
import { loadLureChoices, registerCatch, registerSameAsPrevious,
  type LureOption, type LureSelection, type RecentLure } from './utils/catchRegistration'
import {
  db,
  type CatchRecord,
  type FishingStyle,
  type FishingTrip,
  type TripEvent,
  type TripEventType,
} from './db/database'

type Screen = 'home' | 'new-trip' | 'fishing' | 'my-lures'

const myLureOptions = ref<LureOption[]>([])
const catalogOptions = ref<LureOption[]>([])
const recentLures = ref<RecentLure[]>([])
const savingCatch = ref(false)
const restoringData = ref(false)

function openMyLures() {
  screen.value = 'my-lures'
}

async function backupData() {
  if (restoringData.value) return
  try {
    await exportBackup()
  } catch (error) {
    console.error('バックアップに失敗しました', error)
    alert('バックアップに失敗したで。')
  }
}

async function restoreData(event: Event) {
  const input = event.target as HTMLInputElement
  if (restoringData.value) {
    input.value = ''
    return
  }
  const file = input.files?.[0]

  if (!file) {
    return
  }

  const ok = confirm(
    'バックアップから復元すると、現在のデータはすべて置き換わるで。\nほんまに復元する？'
  )

  if (!ok) {
    input.value = ''
    return
  }

  restoringData.value = true
  try {
    await importBackup(file)
  } catch (error) {
    console.error('復元に失敗しました', error)

    const message =
      error instanceof Error
        ? error.message
        : 'バックアップの復元に失敗しました'

    alert(message)
    input.value = ''
    restoringData.value = false
    return
  }

  // 復元済みDBに、以前開いていた釣行や入力状態を持ち越さない。
  input.value = ''
  goHome()
  pendingCaughtAt.value = null
  catchSelection.value = null
  catchLureName.value = ''
  catchLureColor.value = ''
  catchRange.value = ''
  catchRetrieveSpeed.value = ''
  catchAction.value = ''
  trips.value = []
  myLureOptions.value = []
  catalogOptions.value = []
  recentLures.value = []
  try {
    await Promise.all([loadTrips(), loadMyLureOptions()])
    alert('バックアップから復元したで！')
  } catch (error) {
    console.error('復元後の画面更新に失敗しました', error)
    alert('データの復元は完了したで。画面の更新に失敗したので、再読み込みしてな。')
  } finally {
    restoringData.value = false
  }
}

function openLureDetail(id: number) {
  console.log('選択したマイルアーID:', id)
}

const screen = ref<Screen>('home')

const trips = ref<FishingTrip[]>([])
const catches = ref<CatchRecord[]>([])
const tripEvents = ref<TripEvent[]>([])
const currentTrip = ref<FishingTrip | null>(null)

// 新規釣行
const newTripArea = ref('')
const newTripDate = ref(new Date().toISOString().slice(0, 10))
const newTripStyle = ref<FishingStyle>('AREA_TROUT')
const newTripWeather = ref('')

// 釣果入力
const showCatchForm = ref(false)
const pendingCaughtAt = ref<Date | null>(null)
const catchLureName = ref('')
const catchLureColor = ref('')
const catchRange = ref('')
const catchRetrieveSpeed = ref('')
const catchAction = ref('')
const catchSelection = ref<LureSelection | null>(null)

function selectLure(selection: LureSelection) {
  catchSelection.value = selection
}

function formatDate(date: string) {
  return date.replaceAll('-', '/')
}

function fishingStyleName(style: FishingStyle) {
  switch (style) {
    case 'AREA_TROUT':
      return 'エリアトラウト'
    case 'CHUBBING':
      return 'チャビング'
    case 'NATIVE_TROUT':
      return 'ネイティブトラウト'
    case 'BASS':
      return 'バス'
    default:
      return 'その他'
  }
}

async function loadTrips() {
  trips.value = await db.trips
    .orderBy('startedAt')
    .reverse()
    .toArray()
}

async function loadCatches() {
  if (!currentTrip.value?.id) {
    catches.value = []
    return
  }

  catches.value = await db.catches
    .where('tripId')
    .equals(currentTrip.value.id)
    .sortBy('caughtAt')
}

async function loadTripEvents() {
  const tripId = currentTrip.value?.id
  tripEvents.value = tripId
    ? await db.tripEvents.where('tripId').equals(tripId).sortBy('occurredAt')
    : []
}

async function recordTripEvent(type: TripEventType) {
  const tripId = currentTrip.value?.id
  if (!tripId || currentTrip.value?.endedAt) return
  // ボタンを押した瞬間の時刻を使う
  const occurredAt = new Date()
  try {
    await db.tripEvents.add({ tripId, type, occurredAt })
    await loadTripEvents()
  } catch (error) {
    console.error('イベント記録に失敗しました', error)
    alert('記録できへんかった。もう一度試してな。')
  }
}

async function updateTripEvent(event: TripEvent, dateTime: string) {
  if (!event.id || !currentTrip.value?.id || event.tripId !== currentTrip.value.id) return
  const occurredAt = new Date(dateTime)
  if (!Number.isFinite(occurredAt.getTime())) {
    alert('日時を確認してな。')
    return
  }
  const startedAt = new Date(currentTrip.value.startedAt)
  if (occurredAt < startedAt) {
    alert('釣行開始より前の日時にはできへんで。')
    return
  }
  if (currentTrip.value.endedAt && occurredAt > new Date(currentTrip.value.endedAt)) {
    alert('釣行終了より後の日時にはできへんで。')
    return
  }
  try {
    await db.tripEvents.update(event.id, { occurredAt })
    await loadTripEvents()
  } catch (error) {
    console.error('イベント時刻の更新に失敗しました', error)
    alert('時刻の修正に失敗したで。')
  }
}

async function loadMyLureOptions() {
  const options = await loadLureChoices()
  myLureOptions.value = options.owned
  catalogOptions.value = options.catalog
  recentLures.value = options.recent
}

function openNewTrip() {
  newTripArea.value = ''
  newTripDate.value = new Date().toISOString().slice(0, 10)
  newTripStyle.value = 'AREA_TROUT'
  newTripWeather.value = ''

  screen.value = 'new-trip'
}

async function startTrip() {
  if (!newTripArea.value.trim()) {
    alert('釣り場を入力してな！')
    return
  }

  const trip: FishingTrip = {
    fishingAreaName: newTripArea.value.trim(),
    fishingDate: newTripDate.value,
    fishingStyle: newTripStyle.value,
    weather: newTripWeather.value || undefined,
    startedAt: new Date(),
  }

  const id = await db.trips.add(trip)

  currentTrip.value = {
    ...trip,
    id,
  }

  catches.value = []
  tripEvents.value = []

  await loadTrips()

  screen.value = 'fishing'
}

async function openTrip(trip: FishingTrip) {
  currentTrip.value = trip

  await loadCatches()
  await loadTripEvents()

  screen.value = 'fishing'
}

async function addCatch() {
  if (savingCatch.value || showCatchForm.value) return
  /*
   * 「釣れた！」を押した瞬間に時刻を確保。
   * 入力に時間がかかっても、この時刻は変わらない。
   */
  pendingCaughtAt.value = new Date()

  catchSelection.value = null
  catchLureName.value = ''
  catchLureColor.value = ''
  catchRange.value = ''
  catchRetrieveSpeed.value = ''
  catchAction.value = ''

  try {
    await loadMyLureOptions()
    showCatchForm.value = true
  } catch (error) {
    pendingCaughtAt.value = null
    alert(error instanceof Error ? error.message : 'ルアー候補を読み込めませんでした。')
  }
}

async function saveCatch() {
  await commitCatch(false)
}

async function saveSameAsPrevious() {
  await commitCatch(true)
}

async function commitCatch(sameAsPrevious: boolean) {
  if (savingCatch.value || !currentTrip.value?.id || !pendingCaughtAt.value) return
  savingCatch.value = true
  try {
    if (sameAsPrevious) {
      await registerSameAsPrevious(currentTrip.value.id, pendingCaughtAt.value)
    } else {
      const selection = catchSelection.value?.kind === 'manual' || !catchSelection.value
        ? { kind: 'manual' as const, lureName: catchLureName.value, lureColor: catchLureColor.value }
        : catchSelection.value
      await registerCatch({ tripId: currentTrip.value.id, caughtAt: pendingCaughtAt.value,
        rangeLevel: catchRange.value || undefined, retrieveSpeed: catchRetrieveSpeed.value || undefined,
        action: catchAction.value || undefined }, selection)
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : '釣果の保存に失敗しました。')
    savingCatch.value = false
    return
  }
  showCatchForm.value = false
  pendingCaughtAt.value = null
  catchSelection.value = null
  try {
    await Promise.all([loadCatches(), loadMyLureOptions()])
  } catch (error) {
    console.error('保存後の画面更新に失敗しました', error)
    alert('釣果は保存済みです。画面を再読み込みしてください。')
  } finally {
    savingCatch.value = false
  }
}

function cancelCatch() {
  if (savingCatch.value) return
  showCatchForm.value = false
  pendingCaughtAt.value = null
  catchSelection.value = null
}

async function endTrip() {
  if (!currentTrip.value?.id) {
    return
  }

  const ok = confirm('この釣行を終了する？')

  if (!ok) {
    return
  }

  const endedAt = new Date()

  await db.trips.update(currentTrip.value.id, {
    endedAt,
  })

  currentTrip.value = null
  catches.value = []
  tripEvents.value = []

  await loadTrips()

  screen.value = 'home'
}

function goHome() {
  currentTrip.value = null
  catches.value = []
  tripEvents.value = []
  showCatchForm.value = false

  screen.value = 'home'
}

async function deleteAllData() {
  const ok = confirm(
    '開発用データを全部削除するで。\n釣行・釣果・マイルアーも全部消えるで。\nほんまに削除する？'
  )

  if (!ok) {
    return
  }

  await db.transaction(
    'rw',
    [
      db.trips,
      db.catches,
      db.tripEvents,
      db.lureManufacturers,
      db.lureSeries,
      db.lureModels,
      db.lureVariants,
      db.myLures,
    ],
    async () => {
      await db.catches.clear()
      await db.tripEvents.clear()
      await db.myLures.clear()
      await db.lureVariants.clear()
      await db.lureModels.clear()
      await db.lureSeries.clear()
      await db.lureManufacturers.clear()
      await db.trips.clear()
    }
  )

  currentTrip.value = null
  catches.value = []
  myLureOptions.value = []
  tripEvents.value = []

  await loadTrips()

  screen.value = 'home'
}

onMounted(async () => {
  await loadTrips()
})
</script>

<template>
  <p v-if="restoringData" role="status">バックアップを復元しています…</p>
  <main class="app" :inert="restoringData" :aria-busy="restoringData">
    <!-- ホーム -->
    <template v-if="screen === 'home'">
      <header class="header">
        <div>
          <p class="app-name">MY FISHING LOG</p>
          <h1>🎣 Fishing Log</h1>
        </div>
      </header>

      <button class="primary-button" @click="openNewTrip">＋ 新しい釣行を開始</button>

      <button class="secondary-button" @click="openMyLures">🎣 マイルアー</button>

      <button class="backup-button" @click="backupData">
        📦 データをバックアップ
      </button>

      <label class="restore-button">
        📥 バックアップから復元

        <input class="restore-input" type="file" accept=".json,application/json" @change="restoreData" />
      </label>

<!-- ルアーマスタ取り込み -->
<section class="card">
  <LureCatalogImportPanel />
</section>


      <section class="card">
        <h2>最近の釣行</h2>

        <p v-if="trips.length === 0" class="empty">まだ釣行記録がないで。</p>

        <button v-for="trip in trips" :key="trip.id" class="trip-row" @click="openTrip(trip)">
          <div>
            <strong>
              {{ trip.fishingAreaName }}
            </strong>

            <span>
              {{ formatDate(trip.fishingDate) }}
            </span>
          </div>

          <div class="trip-type">
            {{ fishingStyleName(trip.fishingStyle ?? "AREA_TROUT") }}
          </div>
        </button>
      </section>

      <button class="delete-button" @click="deleteAllData">開発用：全データ削除</button>
    </template>

    <!-- マイルアー -->
    <MyLuresScreen v-else-if="screen === 'my-lures'" @back="goHome" @select-lure="openLureDetail" />

    <!-- 新規釣行 -->
    <template v-else-if="screen === 'new-trip'">
      <button class="back-button" @click="goHome">← 戻る</button>

      <header class="page-header">
        <p class="app-name">NEW FISHING TRIP</p>
        <h1>新しい釣行</h1>
      </header>

      <section class="card form-card">
        <label>
          <span>釣行日</span>

          <input v-model="newTripDate" type="date" />
        </label>

        <label>
          <span>釣り場</span>

          <input v-model="newTripArea" type="text" placeholder="例：白馬八方ニレ池" />
        </label>

        <label>
          <span>釣りスタイル</span>

          <select v-model="newTripStyle">
            <option value="AREA_TROUT">エリアトラウト</option>

            <option value="CHUBBING">チャビング</option>

            <option value="NATIVE_TROUT">ネイティブトラウト</option>

            <option value="BASS">バス</option>

            <option value="OTHER">その他</option>
          </select>
        </label>

        <label>
          <span>天気</span>

          <select v-model="newTripWeather">
            <option value="">未入力</option>
            <option value="晴れ">晴れ</option>
            <option value="曇り">曇り</option>
            <option value="雨">雨</option>
            <option value="雪">雪</option>
          </select>
        </label>
      </section>

      <button class="primary-button" @click="startTrip">🎣 釣行開始</button>
    </template>

    <!-- 釣行中 -->

    <FishingScreen v-else-if="screen === 'fishing' && currentTrip" :trip="currentTrip" :catches="catches" :events="tripEvents" @home="goHome"
      @add-catch="addCatch" @record-event="recordTripEvent" @update-event="updateTripEvent" @end-trip="endTrip" />

    <!-- 釣果入力モーダル -->
    <CatchModal v-if="showCatchForm && pendingCaughtAt" :caught-at="pendingCaughtAt"
      :catalog="catalogOptions" :recent-lures="recentLures" :selection="catchSelection" :saving="savingCatch"
      :has-previous-catch="catches.length > 0" :my-lures="myLureOptions" v-model:lure-name="catchLureName"
      v-model:lure-color="catchLureColor" v-model:range="catchRange" v-model:retrieve-speed="catchRetrieveSpeed"
      v-model:action="catchAction" @select-lure="selectLure" @save="saveCatch"
      @same-as-previous="saveSameAsPrevious" @cancel="cancelCatch" />
  </main>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.restore-button {
  display: block;
  width: 100%;
  margin: 0 0 24px;
  padding: 14px;
  box-sizing: border-box;
  border: 1px solid #d9dee3;
  border-radius: 14px;
  background: white;
  color: #17212b;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
}

.restore-button:active {
  transform: scale(0.98);
}

.restore-input {
  display: none;
}



.backup-button {
  width: 100%;
  margin: 0 0 24px;
  padding: 14px;
  border: 1px solid #d9dee3;
  border-radius: 14px;
  background: white;
  color: #17212b;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.backup-button:active {
  transform: scale(0.98);
}

.app {
  width: min(100%, 620px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 24px 18px 60px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #17212b;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-header {
  margin: 24px 0;
}

.app-name {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #73808c;
}

h1 {
  margin: 3px 0 0;
  font-size: 26px;
}

h2 {
  margin-top: 0;
  font-size: 19px;
}

.card {
  padding: 20px;
  border: 1px solid #e4e8ec;
  border-radius: 18px;
  background: white;
  box-shadow: 0 8px 30px rgb(0 0 0 / 5%);
}

.primary-button {
  width: 100%;
  margin: 24px 0;
  padding: 20px;
  border: 0;
  border-radius: 18px;
  background: #13795b;
  color: white;
  font-size: 20px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 20px rgb(19 121 91 / 25%);
}

.primary-button:active {
  transform: scale(0.98);
}

.trip-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border: 0;
  border-top: 1px solid #edf0f2;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.trip-row strong {
  display: block;
  margin-bottom: 4px;
  font-size: 16px;
}

.trip-row span {
  color: #69747e;
  font-size: 13px;
}

.trip-type {
  padding: 6px 9px;
  border-radius: 8px;
  background: #eef7f3;
  color: #13795b;
  font-size: 12px;
  font-weight: 700;
}

.empty {
  color: #7b8792;
}

.form-card label {
  display: block;
  margin-bottom: 20px;
}

.form-card label:last-child {
  margin-bottom: 0;
}

.form-card label>span {
  display: block;
  margin-bottom: 7px;
  color: #69747e;
  font-size: 13px;
  font-weight: 700;
}

input,
select {
  width: 100%;
  padding: 13px;
  border: 1px solid #d9dee3;
  border-radius: 10px;
  background: white;
  color: #17212b;
  font: inherit;
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

.delete-button {
  display: block;
  margin: 30px auto 0;
  padding: 8px;
  border: 0;
  background: transparent;
  color: #b04b4b;
  font-size: 12px;
  cursor: pointer;
}

.secondary-button {
  width: 100%;
  margin: 0 0 24px;
  padding: 16px;
  border: 1px solid #13795b;
  border-radius: 18px;
  background: white;
  color: #13795b;
  font-size: 17px;
  font-weight: 800;
  cursor: pointer;
}

.secondary-button:active {
  transform: scale(0.98);
}
</style>
