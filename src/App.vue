<script setup lang="ts">
import LureCatalogImportPanel from './LureCatalogImportPanel.vue'
import OfflineStatus from './components/OfflineStatus.vue'
import FacilityPicker from './components/FacilityPicker.vue'
import { changeCurrentZone, loadLocationChoices, type CatchLocationSelection } from './utils/tripLocations'
import { offline } from './pwa'
import { onMounted, onUnmounted, ref } from 'vue'
import CatchModal from './components/CatchModal.vue'
import FishingScreen from './components/FishingScreen.vue'
import MyLuresScreen from './components/MyLuresScreen.vue'
import TackleManagementScreen from './components/TackleManagementScreen.vue'
import TripTackleSelector from './components/TripTackleSelector.vue'
import FishSpeciesScreen from './components/FishSpeciesScreen.vue'
import TripDeleteDialog from './components/TripDeleteDialog.vue'
import { getTripDeletionSummary, deleteFishingTrip, type TripDeletionSummary } from './utils/tripDeletion'
import { loadFishChoices, defaultFishSpeciesId } from './utils/fishSpecies'
import { availableTackleSets, createTrip, updateTripTackles, suggestTackleSetId } from './utils/tackleManagement'
import { exportBackup, importBackup } from './utils/backup'
import { loadLureChoices, updateCatch, registerCatch, registerSameAsPrevious,
  type LureOption, type LureSelection, type RecentLure } from './utils/catchRegistration'
import {
  db,
  databaseConnection,
  subscribeDatabaseConnection,
  type CatchRecord,
  type FishingStyle,
  type FishingTrip,
  type TripEvent,
  type TripEventType,
  type TackleSet,
  type FishSpecies,
} from './db/database'

type Screen = 'home' | 'new-trip' | 'fishing' | 'my-lures' | 'tackles' | 'fish-species'
const connectionState = ref(databaseConnection.state)
const unsubscribeConnection = subscribeDatabaseConnection(state => { connectionState.value = state })
onUnmounted(unsubscribeConnection)
const catalogPanel = ref<{ busy: boolean; preview: unknown } | null>(null)
const backingUp = ref(false)
const fishChoices = ref<FishSpecies[]>([])
const catchFishSpeciesId = ref<string>()
const catchFishSize = ref('')
const availableSets = ref<TackleSet[]>([])
const tripSetSelection = ref<number[]>([])
const catchTackleOptions = ref<TackleSet[]>([])
const catchTackleSetId = ref<number | undefined>()
const editingTripTackles = ref(false)
const savingTrip = ref(false)
const newTripFacilityId = ref<string>(), newTripZoneId = ref<string>()
const catchZoneId = ref<string>(), catchLocation = ref<CatchLocationSelection>()
const locationBusy = ref(false), savingLocation = ref(false), locationRefresh = ref(0)

const myLureOptions = ref<LureOption[]>([])
const catalogOptions = ref<LureOption[]>([])
const recentLures = ref<RecentLure[]>([])
const savingCatch = ref(false)
const restoringData = ref(false)
const tripDeletionSummary = ref<TripDeletionSummary | null>(null)
const preparingTripDeletion = ref(false)
const deletingTrip = ref(false)
const tripDeletionError = ref('')
const tripDeletionNotice = ref('')

async function requestTripDeletion() {
  const id = currentTrip.value?.id
  if (!id || tripDeletionSummary.value || preparingTripDeletion.value || deletingTrip.value || savingCatch.value || savingTrip.value ||
      showCatchForm.value || editingTripTackles.value) return
  preparingTripDeletion.value = true
  tripDeletionError.value = ''
  tripDeletionNotice.value = ''
  try {
    const summary = await getTripDeletionSummary(id)
    if (screen.value === 'fishing' && currentTrip.value?.id === id) tripDeletionSummary.value = summary
  } catch (error) {
    alert(error instanceof Error ? error.message : '削除対象を確認できませんでした。')
  } finally { preparingTripDeletion.value = false }
}

function cancelTripDeletion() {
  if (deletingTrip.value) return
  tripDeletionSummary.value = null
  tripDeletionError.value = ''
}

async function confirmTripDeletion() {
  const summary = tripDeletionSummary.value
  if (!summary || deletingTrip.value) return
  deletingTrip.value = true
  tripDeletionError.value = ''
  try {
    await deleteFishingTrip(summary.trip.id, summary)
  } catch (error) {
    tripDeletionError.value = error instanceof Error ? error.message : 'データベースへのアクセスに失敗しました。'
    deletingTrip.value = false
    return
  }
  // The transaction has committed. Leave the deleted detail even if refresh fails.
  trips.value = trips.value.filter(trip => trip.id !== summary.trip.id)
  tripDeletionSummary.value = null
  goHome()
  pendingCaughtAt.value = null
  catchSelection.value = null
  catchTackleSetId.value = undefined
  myLureOptions.value = []
  recentLures.value = []
  tripDeletionNotice.value = '釣行と関連記録を削除しました。'
  try {
    await Promise.all([loadTrips(), loadMyLureOptions()])
  } catch (error) {
    console.error('削除後の画面更新に失敗しました', error)
    tripDeletionNotice.value = '削除は完了しました。画面の更新に失敗したため、再読み込みしてください。'
  } finally { deletingTrip.value = false }
}

function openMyLures() {
  screen.value = 'my-lures'
}

async function backupData() {
  if (restoringData.value) return
  backingUp.value = true
  try {
    await exportBackup()
  } catch (error) {
    console.error('バックアップに失敗しました', error)
    alert('バックアップに失敗したで。')
  } finally { backingUp.value = false }
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
    'バックアップから復元すると、現在の釣行・釣果・ルアー・魚種・タックルなどの記録は置き換わるで。\n端末に追加した施設・エリアは残して、バックアップに含まれる施設・エリアを追加するで。\n同じ施設・エリアIDで内容が違う場合は、何も変更せず復元を中止するで。公式マスターは古い状態には戻さへん。\nほんまに復元する？'
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
  catchTackleSetId.value = undefined
  fishChoices.value = []
  catchFishSpeciesId.value = undefined
  catchFishSize.value = ''
  catchTackleOptions.value = []
  availableSets.value = []
  tripSetSelection.value = []
  editingTripTackles.value = false
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
const editingCatch = ref<CatchRecord | null>(null)
const catchMemo = ref('')
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

async function openNewTrip() {
  newTripFacilityId.value = undefined; newTripZoneId.value = undefined
  newTripArea.value = ''
  newTripDate.value = new Date().toISOString().slice(0, 10)
  newTripStyle.value = 'AREA_TROUT'
  newTripWeather.value = ''
  tripSetSelection.value = []
  try {
    availableSets.value = await availableTackleSets()
    screen.value = 'new-trip'
  } catch (error) { alert(error instanceof Error ? error.message : String(error)) }
}

async function startTrip() {
  if (savingTrip.value || locationBusy.value) return
  if (!newTripFacilityId.value && !newTripArea.value.trim()) {
    alert('釣り場を入力してな！')
    return
  }

  const trip: FishingTrip = {
    fishingAreaName: newTripArea.value.trim(),
    fishingDate: newTripDate.value,
    fishingStyle: newTripStyle.value,
    weather: newTripWeather.value || undefined,
    startedAt: new Date(),
    tackleSetIds: [...tripSetSelection.value],
    ...(newTripFacilityId.value ? { facilityId: newTripFacilityId.value } : {}),
    ...(newTripZoneId.value ? { currentZoneId: newTripZoneId.value } : {}),
  }
  savingTrip.value = true
  try {
    if (trip.facilityId) {
      const selected = await loadLocationChoices(trip.facilityId)
      trip.fishingAreaName = selected.facility!.name
    }
    const id = await createTrip(trip)
    currentTrip.value = { ...trip, id }
    catches.value = []
    tripEvents.value = []
    screen.value = 'fishing'
    try { await loadTrips() }
    catch (error) {
      console.error('釣行保存後の一覧更新に失敗しました', error)
      alert('釣行は保存済みです。一覧の更新に失敗しました。再読み込みしてください。')
    }
  } catch (error) { alert(error instanceof Error ? error.message : String(error)) }
  finally { savingTrip.value = false }
}

async function editTripTackles() {
  if (!currentTrip.value || currentTrip.value.endedAt) return
  try {
    availableSets.value = await availableTackleSets()
    tripSetSelection.value = [...(currentTrip.value.tackleSetIds ?? [])]
    editingTripTackles.value = true
  } catch (error) { alert(error instanceof Error ? error.message : String(error)) }
}

async function saveTripTackles() {
  if (savingTrip.value || !currentTrip.value?.id) return
  savingTrip.value = true
  try {
    // 停止済みのセットは候補から除外。変更画面で確認して保存する。
    const allowed = new Set(availableSets.value.map(set => set.id))
    const ids = tripSetSelection.value.filter(id => allowed.has(id))
    await updateTripTackles(currentTrip.value.id, ids)
    currentTrip.value = { ...currentTrip.value, tackleSetIds: ids }
    editingTripTackles.value = false
    await loadTrips()
  } catch (error) { alert(error instanceof Error ? error.message : String(error)) }
  finally { savingTrip.value = false }
}

async function openTrip(trip: FishingTrip) {
  currentTrip.value = trip

  await loadCatches()
  await loadTripEvents()

  screen.value = 'fishing'
}

async function editCatch(record: CatchRecord) {
  if (savingCatch.value || showCatchForm.value || locationBusy.value || !currentTrip.value?.id) return
  try {
    await loadMyLureOptions()
    fishChoices.value = await loadFishChoices()
    if (record.fishSpeciesId && !fishChoices.value.some(f => f.fish_id === record.fishSpeciesId)) {
      const retained = await db.fishSpecies.get(record.fishSpeciesId)
      if (retained) fishChoices.value.push(retained)
    }
    catchTackleOptions.value = await availableTackleSets(currentTrip.value)
    if (record.tackleSetId && !catchTackleOptions.value.some(t => t.id === record.tackleSetId)) {
      const retained = await db.tackleSets.get(record.tackleSetId)
      if (retained) catchTackleOptions.value.push(retained)
    }
    editingCatch.value = record
    pendingCaughtAt.value = new Date(record.caughtAt)
    catchSelection.value = null
    catchLureName.value = record.lureName ?? ''
    catchLureColor.value = record.lureColor ?? ''
    catchRange.value = record.rangeLevel ?? ''
    catchRetrieveSpeed.value = record.retrieveSpeed ?? ''
    catchAction.value = record.action ?? ''
    catchMemo.value = record.memo ?? ''
    catchFishSpeciesId.value = record.fishSpeciesId
    catchFishSize.value = record.fishSizeCm === undefined ? '' : String(record.fishSizeCm)
    catchTackleSetId.value = record.tackleSetId
    catchZoneId.value = record.zoneId
    catchLocation.value = currentTrip.value.facilityId ? { expectedFacilityId: currentTrip.value.facilityId, expectedCurrentZoneId: currentTrip.value.currentZoneId, zoneId: record.zoneId } : undefined
    showCatchForm.value = true
  } catch (error) { alert(error instanceof Error ? error.message : String(error)) }
}

async function addCatch() {
  if (savingCatch.value || showCatchForm.value || locationBusy.value || savingLocation.value) return
  /*
   * 「釣れた！」を押した瞬間に時刻を確保。
   * 入力に時間がかかっても、この時刻は変わらない。
   */
  editingCatch.value = null
  catchMemo.value = ''
  pendingCaughtAt.value = new Date()

  catchSelection.value = null
  catchLureName.value = ''
  catchLureColor.value = ''
  catchRange.value = ''
  catchRetrieveSpeed.value = ''
  catchAction.value = ''

  try {
    const trip = currentTrip.value?.id ? await db.trips.get(currentTrip.value.id) : undefined
    if (!trip || trip.endedAt) throw new Error('釣行が存在しないか終了しています。')
    await loadLocationChoices(trip.facilityId, trip.currentZoneId)
    currentTrip.value = trip
    catchZoneId.value = trip.currentZoneId
    catchLocation.value = { expectedFacilityId: trip.facilityId, expectedCurrentZoneId: trip.currentZoneId, zoneId: trip.currentZoneId }
    await loadMyLureOptions()
    fishChoices.value = await loadFishChoices()
    catchFishSpeciesId.value = trip.fishingStyle === 'AREA_TROUT' ? defaultFishSpeciesId(fishChoices.value) : undefined
    catchFishSize.value = ''
    catchTackleOptions.value = await availableTackleSets(currentTrip.value ?? undefined)
    catchTackleSetId.value = suggestTackleSetId(catches.value, catchTackleOptions.value)
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
  if (savingCatch.value || locationBusy.value || savingLocation.value || !currentTrip.value?.id || !pendingCaughtAt.value) return
  savingCatch.value = true
  try {
    if (sameAsPrevious) {
      await registerSameAsPrevious(currentTrip.value.id, pendingCaughtAt.value, catchLocation.value ? { ...catchLocation.value, zoneId: catchZoneId.value } : undefined)
    } else {
      const selection = catchSelection.value?.kind === 'manual' || !catchSelection.value
        ? { kind: 'manual' as const, lureName: catchLureName.value, lureColor: catchLureColor.value }
        : catchSelection.value
      const input = { tripId: currentTrip.value.id, caughtAt: pendingCaughtAt.value,
        location: editingCatch.value && catchZoneId.value === editingCatch.value.zoneId ? undefined : catchLocation.value ? { ...catchLocation.value, zoneId: catchZoneId.value } : undefined,
        tackleSetId: catchTackleSetId.value,
        fishSpeciesId: catchFishSpeciesId.value,
        fishSizeCm: catchFishSize.value.trim() ? Number(catchFishSize.value) : undefined,
        rangeLevel: catchRange.value || undefined, retrieveSpeed: catchRetrieveSpeed.value || undefined,
        action: catchAction.value || undefined, memo: catchMemo.value || undefined }
      if (editingCatch.value?.id) {
        await updateCatch(editingCatch.value.id, input, catchSelection.value ? selection : undefined)
      } else await registerCatch(input, selection)
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : '釣果の保存に失敗しました。')
    savingCatch.value = false
    return
  }
  showCatchForm.value = false
  editingCatch.value = null
  pendingCaughtAt.value = null
  catchSelection.value = null
  catchTackleSetId.value = undefined
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
  if (locationBusy.value || savingLocation.value) return
  if (savingCatch.value) return
  showCatchForm.value = false
  editingCatch.value = null
  pendingCaughtAt.value = null
  catchSelection.value = null
  catchTackleSetId.value = undefined
}

async function endTrip() {
  if (locationBusy.value || savingLocation.value) return
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
  if (locationBusy.value || savingLocation.value) return
  currentTrip.value = null
  catches.value = []
  tripEvents.value = []
  showCatchForm.value = false
  editingTripTackles.value = false

  screen.value = 'home'
}

async function deleteAllData() {
  const ok = confirm(
    '開発用データを全部削除するで。\n釣行・釣果・マイルアー・タックル・魚種も全部消えるで。\nほんまに削除する？'
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
      db.rods,
      db.reels,
      db.lines,
      db.tackleSets,
      db.fishSpecies,
    ],
    async () => {
      await db.catches.clear()
      await db.tackleSets.clear()
      await db.fishSpecies.clear()
      await db.reels.clear()
      await db.rods.clear()
      await db.lines.clear()
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
async function selectCurrentZone(zoneId: string | undefined) {
  if (!currentTrip.value?.id || savingLocation.value) return
  savingLocation.value = true
  try {
    await changeCurrentZone(currentTrip.value.id, zoneId, currentTrip.value.currentZoneId)
    currentTrip.value = (await db.trips.get(currentTrip.value.id)) ?? null
  } catch (error) { alert(error instanceof Error ? error.message : String(error)) }
  finally { savingLocation.value = false; locationRefresh.value++ }
}
</script>

<template>
  <p v-if="restoringData" role="status">バックアップを復元しています…</p>
  <main class="app" :inert="restoringData || offline.updating" :aria-busy="restoringData || offline.updating">
    <OfflineStatus :safe="screen === 'home' && !locationBusy && !savingLocation && !backingUp && !catalogPanel?.busy && !catalogPanel?.preview && !restoringData && !savingTrip && !savingCatch && !preparingTripDeletion && !deletingTrip && !tripDeletionSummary && !showCatchForm && !editingTripTackles" />
    <p v-if="connectionState === 'changed'" role="alert">別の画面でデータベースが更新されたため、この画面からは保存できません。入力中の内容をメモしてから、この画面を手動で再読み込みしてください。</p>
    <p v-else-if="connectionState === 'blocked'" role="alert">別のFishing Log画面がデータベースの更新を待たせています。その画面の入力を保存して閉じてください。自動で再読み込みはしません。</p>
    <!-- ホーム -->
    <template v-if="screen === 'home'">
      <p v-if="tripDeletionNotice" role="status">{{ tripDeletionNotice }}</p>
      <header class="header">
        <div>
          <p class="app-name">MY FISHING LOG</p>
          <h1>🎣 Fishing Log</h1>
        </div>
      </header>

      <button class="primary-button" @click="openNewTrip">＋ 新しい釣行を開始</button>

      <button class="secondary-button" @click="openMyLures">🎣 マイルアー</button>
      <button class="secondary-button" @click="screen = 'tackles'">タックル管理</button>
      <button class="secondary-button" @click="screen = 'fish-species'">魚種マスター管理</button>

      <button class="backup-button" @click="backupData">
        📦 データをバックアップ
      </button>

      <label class="restore-button">
        📥 バックアップから復元

        <input class="restore-input" data-testid="restore-backup" type="file" accept=".json,application/json" @change="restoreData" />
      </label>

<!-- ルアーマスタ取り込み -->
<section class="card">
  <LureCatalogImportPanel ref="catalogPanel" />
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
    <TackleManagementScreen v-else-if="screen === 'tackles'" @back="goHome" />
    <FishSpeciesScreen v-else-if="screen === 'fish-species'" @back="goHome" />

    <!-- 新規釣行 -->
    <template v-else-if="screen === 'new-trip'">
      <button class="back-button" :disabled="locationBusy || savingLocation" @click="goHome">← 戻る</button>

      <header class="page-header">
        <p class="app-name">NEW FISHING TRIP</p>
        <h1>新しい釣行</h1>
      </header>

      <section class="card form-card">
        <FacilityPicker v-model:facility-id="newTripFacilityId" v-model:zone-id="newTripZoneId" :disabled="savingTrip" @busy="locationBusy = $event" />
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

      <TripTackleSelector v-model="tripSetSelection" :sets="availableSets" :inert="savingTrip" />
      <button class="primary-button" :disabled="savingTrip || locationBusy" @click="startTrip">🎣 釣行開始</button>
    </template>

    <!-- 釣行中 -->

    <FishingScreen v-else-if="screen === 'fishing' && currentTrip" :trip="currentTrip" :catches="catches" :events="tripEvents" :location-busy="locationBusy || savingLocation" @home="goHome"
      @add-catch="addCatch" @edit-catch="editCatch" @edit-tackles="editTripTackles" @record-event="recordTripEvent" @update-event="updateTripEvent" @end-trip="endTrip">
      <template #location><FacilityPicker v-if="currentTrip.facilityId" :key="locationRefresh" fixed :facility-id="currentTrip.facilityId" :trip-id="currentTrip.id"
        :zone-id="currentTrip.currentZoneId" :retained-zone-id="currentTrip.currentZoneId" zone-label="現在のエリア" :disabled="!!currentTrip.endedAt || savingLocation || showCatchForm"
        @update:zone-id="selectCurrentZone" @busy="locationBusy = $event" /></template>
    </FishingScreen>

    <button v-if="screen === 'fishing' && currentTrip" type="button" class="delete-trip-button"
      :disabled="preparingTripDeletion || deletingTrip || savingCatch || savingTrip || locationBusy || savingLocation || showCatchForm || editingTripTackles"
      @click="requestTripDeletion">{{ preparingTripDeletion ? '削除対象を確認中…' : 'この釣行を削除' }}</button>

    <TripDeleteDialog v-if="tripDeletionSummary" :summary="tripDeletionSummary" :busy="deletingTrip" :error="tripDeletionError"
      @cancel="cancelTripDeletion" @confirm="confirmTripDeletion" />

    <div v-if="editingTripTackles" class="tackle-overlay">
      <section class="card tackle-dialog" role="dialog" aria-label="持参セットを変更" aria-modal="true" :inert="savingTrip">
        <h2>持参セットを変更</h2>
        <p>使用停止中のセットは保存時に候補から外します。過去の釣果は変わりません。</p>
        <TripTackleSelector v-model="tripSetSelection" :sets="availableSets" />
        <button class="secondary-button" @click="saveTripTackles">保存</button>
        <button class="back-button" @click="editingTripTackles = false">キャンセル</button>
      </section>
    </div>

    <!-- 釣果入力モーダル -->
    <CatchModal v-if="showCatchForm && pendingCaughtAt" :caught-at="pendingCaughtAt" :editing="!!editingCatch" @update:caught-at="pendingCaughtAt = $event" v-model:memo="catchMemo"
      :location-busy="locationBusy || savingLocation"
      :fish-choices="fishChoices" v-model:fish-species-id="catchFishSpeciesId" v-model:fish-size="catchFishSize"
      :tackle-sets="catchTackleOptions" v-model:tackle-set-id="catchTackleSetId"
      :catalog="catalogOptions" :recent-lures="recentLures" :selection="catchSelection" :saving="savingCatch"
      :has-previous-catch="!editingCatch && catches.length > 0" :my-lures="myLureOptions" v-model:lure-name="catchLureName"
      v-model:lure-color="catchLureColor" v-model:range="catchRange" v-model:retrieve-speed="catchRetrieveSpeed"
      v-model:action="catchAction" @select-lure="selectLure" @save="saveCatch"
      @same-as-previous="saveSameAsPrevious" @cancel="cancelCatch">
      <template #location><FacilityPicker v-if="catchLocation?.expectedFacilityId" fixed :facility-id="catchLocation.expectedFacilityId" :trip-id="currentTrip?.id"
        v-model:zone-id="catchZoneId" :retained-zone-id="editingCatch?.zoneId ?? catchLocation.expectedCurrentZoneId" zone-label="今回のエリア" :disabled="savingCatch" @busy="locationBusy = $event" /></template>
    </CatchModal>
  </main>
</template>

<style scoped>
.delete-trip-button { width:100%; min-height:44px; margin-top:24px; padding:12px; border:1px solid #9b2424; border-radius:10px; background:#fff; color:#9b2424; font:inherit; font-weight:700; cursor:pointer; }
.delete-trip-button:disabled { opacity:.65; cursor:default; }
.tackle-overlay { position:fixed; inset:0; z-index:110; padding:18px; background:rgb(0 0 0 / 45%); display:flex; align-items:center; justify-content:center; }
.tackle-dialog { width:min(100%,520px); max-height:85vh; overflow-y:auto; }
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
  color: var(--text-muted);
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
  color: var(--text-muted);
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
  color: var(--text-muted);
}

.form-card label {
  display: block;
  margin-bottom: 20px;
}

.form-card label:last-child {
  margin-bottom: 0;
}

.form-card input[type="date"] {
  -webkit-appearance: none;
  appearance: none;
}

.form-card label>span {
  display: block;
  margin-bottom: 7px;
  color: var(--text-muted);
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
