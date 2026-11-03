<script setup lang="ts">
import { ref, watch, toRaw } from 'vue'
import type { FishingTrip } from '../db/database'
import { saveTripMemo } from '../utils/tripEvents'
const props = defineProps<{ trip: FishingTrip }>()
const emit = defineEmits<{ saved: [trip: FishingTrip] }>()
const draft = ref(props.trip.memo ?? ''), busy = ref(false), status = ref(''), error = ref('')
let original = structuredClone(toRaw(props.trip))
watch(() => props.trip, trip => {
  if (trip.id !== original.id || trip.memo !== original.memo) { status.value = ''; draft.value = trip.memo ?? '' }
  original = structuredClone(toRaw(trip))
})
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''; status.value = ''
  try { const trip = await saveTripMemo(original, draft.value); original = trip; emit('saved', trip); status.value = '保存済み' }
  catch (e) { error.value = e instanceof Error ? e.message : '保存できませんでした。' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="trip-memo" aria-label="釣行メモ">
    <h2>釣行メモ</h2>
    <label>感想・釣れたパターン・次回の課題<textarea v-model="draft" rows="5" :disabled="busy" @input="status = ''" /></label>
    <button type="button" :disabled="busy" @click="save">釣行メモを保存</button>
    <p v-if="busy || status || draft !== (trip.memo ?? '')" role="status">{{ busy ? '保存中…' : status || '未保存の変更があります' }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.trip-memo { padding:18px; background:var(--surface,#fff); border-radius:16px; margin:14px 0; } label { display:grid; gap:8px; } textarea,button { box-sizing:border-box; width:100%; min-height:44px; font:inherit; padding:10px; border:1px solid #aab4be; border-radius:8px; color:inherit; background:var(--surface,#fff); } textarea { white-space:pre-wrap; } button { margin-top:10px; } [role=alert] { color:#9b2424; }
</style>
