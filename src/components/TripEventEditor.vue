<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { db, type FishingTrip, type TripEvent, type WeatherObservation } from '../db/database'
import { eventDateTime, saveTripEvent, type EventInput } from '../utils/tripEvents'
import WeatherObservationInput from './WeatherObservationInput.vue'
const props = defineProps<{ trip: FishingTrip; event?: TripEvent; weather?: boolean; previous?: WeatherObservation }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()
const trip = structuredClone(toRaw(props.trip)), original = props.event ? structuredClone(toRaw(props.event)) : undefined
const initialOccurredAt = trip.endedAt ? new Date(trip.startedAt) : new Date()
const draft = ref<EventInput>({ type: original?.type ?? (props.weather ? 'weather' : 'stocking'), dateTime: original ? original.timePrecision === 'unknown' ? '' : eventDateTime(new Date(original.occurredAt)) : trip.endedAt ? eventDateTime(new Date(Math.ceil(new Date(trip.startedAt).getTime() / 60000) * 60000)) : eventDateTime(new Date()), weatherObservation: original?.weatherObservation, note: original?.note ?? '', zoneId: original?.zoneId ?? '' })
const dialog = ref<HTMLDialogElement>(), busy = ref(false), error = ref('')
const zones = ref<{ id: string; name: string }[]>([])
onMounted(async () => {
  dialog.value?.showModal()
  try { zones.value = trip.facilityId ? (await db.zones.where('facilityId').equals(trip.facilityId).toArray()).map(z => ({ id: z.id, name: typeof z.name === 'string' ? z.name : z.id })) : [] }
  catch { error.value = 'エリアを読み込めませんでした。' }
})
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await saveTripEvent(trip, { ...structuredClone(toRaw(draft.value)), initialOccurredAt }, original); emit('saved') }
  catch (e) { error.value = e instanceof Error ? e.message : '保存できませんでした。' }
  finally { busy.value = false }
}
</script>
<template>
  <dialog ref="dialog" aria-labelledby="event-editor-title" @cancel.prevent="!busy && emit('cancel')">
    <h2 id="event-editor-title">{{ original ? 'イベントを編集' : 'イベント追加' }}</h2>
    <form @submit.prevent="save">
      <label>イベント種別<select v-model="draft.type" :disabled="busy"><option value="stocking">放流</option><option value="pellet">ペレット</option><option value="weather">気象・環境</option></select></label>
      <label>発生日時（日本時間）<input v-model="draft.dateTime" type="datetime-local" required :disabled="busy" /></label>
      <WeatherObservationInput v-if="draft.type === 'weather'" v-model="draft.weatherObservation" :previous="previous" :disabled="busy" />
      <label>対象エリア<select v-model="draft.zoneId" :disabled="busy"><option value="">指定なし</option><option v-if="original?.zoneId && !zones.some(z => z.id === original?.zoneId)" :value="original.zoneId">{{ original.zoneName || original.zoneId }}（保存済み）</option><option v-for="zone in zones" :key="zone.id" :value="zone.id">{{ zone.name }}</option></select></label>
      <label>メモ<textarea v-model="draft.note" rows="3" :disabled="busy" /></label>
      <p v-if="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="busy">保存</button>
      <button type="button" :disabled="busy" @click="emit('cancel')">キャンセル</button>
    </form>
  </dialog>
</template>
<style scoped>
dialog { box-sizing:border-box; width:min(520px,calc(100% - 24px)); max-height:85dvh; overflow:auto; padding:20px; border:0; border-radius:18px; }
dialog::backdrop { background:rgb(0 0 0 / 45%); } label { display:grid; gap:6px; margin:12px 0; }
input,select,textarea,button { box-sizing:border-box; width:100%; min-width:0; min-height:44px; padding:10px; font:inherit; border:1px solid #ccd3d8; border-radius:8px; background:white; color:inherit; }
button { margin-top:10px; } [role=alert] { color:#9b2424; }
</style>
