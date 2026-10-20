<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import type { FishingTrip, FishingStyle } from '../db/database'
import { saveTripInformation, validateTripInformation, type TripInformation } from '../utils/tripEditing'

const props = defineProps<{ trip: FishingTrip }>()
const emit = defineEmits<{ saved: [trip: FishingTrip]; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
// Detached draft: cancel and preview never write to IndexedDB.
const original = structuredClone(toRaw(props.trip)) as FishingTrip
const draft = ref<TripInformation>({ fishingDate: original.fishingDate, fishingAreaName: original.fishingAreaName,
  fishingStyle: original.fishingStyle ?? 'AREA_TROUT', weather: original.weather })
const styles: Record<FishingStyle, string> = { AREA_TROUT: 'エリアトラウト', CHUBBING: 'チャビング', NATIVE_TROUT: 'ネイティブトラウト', BASS: 'バス', OTHER: 'その他' }
const reviewing = ref(false), busy = ref(false), error = ref('')
onMounted(() => dialog.value?.showModal())
function review() {
  error.value = ''
  try { validateTripInformation(draft.value); reviewing.value = true }
  catch (e) { error.value = e instanceof Error ? e.message : '入力を確認してください。' }
}
async function save() {
  if (busy.value || !reviewing.value) return
  busy.value = true; error.value = ''
  try { emit('saved', await saveTripInformation(original, { ...draft.value })) }
  catch (e) { error.value = e instanceof Error ? e.message : '保存できませんでした。' }
  finally { busy.value = false }
}
</script>
<template>
  <dialog ref="dialog" aria-label="釣行情報を編集" :aria-busy="busy" @cancel.prevent="!busy && emit('cancel')">
    <h2>{{ reviewing ? '変更内容を確認' : '釣行情報を編集' }}</h2>
    <p>釣行日は端末の暦日です。日付を変更しても開始・終了時刻や釣果時刻は変わりません。</p>
    <form v-if="!reviewing" @submit.prevent="review">
      <label>釣行日<input v-model="draft.fishingDate" type="date" required /></label>
      <label>釣り場<input v-model="draft.fishingAreaName" required :readonly="!!trip.facilityId" /></label>
      <p v-if="trip.facilityId">施設の変更は、この画面を閉じて「施設を設定・変更」から行えます。</p>
      <label>釣りスタイル<select v-model="draft.fishingStyle" aria-label="釣りスタイル"><option v-for="(label, value) in styles" :key="value" :value="value">{{ label }}</option></select></label>
      <label>天気<select v-model="draft.weather" aria-label="天気"><option :value="undefined">未入力</option><option v-if="original.weather && !['晴れ','曇り','雨','雪'].includes(original.weather)" :value="original.weather">{{ original.weather }}</option><option v-for="weather in ['晴れ','曇り','雨','雪']" :key="weather">{{ weather }}</option></select></label>
      <button type="submit">変更内容を確認</button>
    </form>
    <template v-else>
      <dl><template v-for="(label, key) in { fishingDate: '釣行日', fishingAreaName: '釣り場', fishingStyle: '釣りスタイル', weather: '天気' }" :key="key">
        <dt>{{ label }}</dt><dd>{{ key === 'fishingStyle' ? styles[original.fishingStyle] : original[key] || '未入力' }} → {{ key === 'fishingStyle' ? styles[draft.fishingStyle] : draft[key] || '未入力' }}</dd>
      </template></dl>
      <button type="button" :disabled="busy" @click="save">保存する</button>
      <button type="button" :disabled="busy" @click="reviewing = false">入力に戻る</button>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="button" :disabled="busy" @click="emit('cancel')">キャンセル</button>
  </dialog>
</template>
<style scoped>
dialog { box-sizing:border-box; width:min(520px,calc(100% - 24px)); max-height:85dvh; overflow:auto; padding:20px; border:0; border-radius:18px; color:#17212b; }
dialog::backdrop { background:rgb(0 0 0 / 45%); }
h2 { font-size:20px; } p,dd { line-height:1.6; overflow-wrap:anywhere; } label { display:grid; gap:6px; margin:12px 0; }
input,select,button { box-sizing:border-box; width:100%; min-width:0; min-height:44px; padding:10px; font:inherit; border:1px solid #ccd3d8; border-radius:8px; background:white; color:inherit; }
button { margin-top:10px; } button:disabled { opacity:.55; } [role=alert] { color:#9b2424; } dd { margin:4px 0 12px; }
</style>
