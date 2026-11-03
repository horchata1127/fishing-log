<script setup lang="ts">
import { computed } from 'vue'
import { skyLabels, windLabels, weatherChangeLabels, observationLabel, type WeatherObservation } from '../db/database'
const props = defineProps<{ modelValue?: WeatherObservation; previous?: WeatherObservation; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: WeatherObservation | undefined] }>()
const current = computed<WeatherObservation>(() => props.modelValue ?? { source: 'observed', changes: [] })
function update(patch: Partial<WeatherObservation>) {
  const next = { ...current.value, ...patch }
  emit('update:modelValue', next.sky || next.wind || next.changes.length || next.note?.trim() ? next : undefined)
}
function change(key: keyof typeof weatherChangeLabels) {
  update({ changes: current.value.changes.includes(key) ? current.value.changes.filter(k => k !== key) : [...current.value.changes, key] })
}
</script>
<template>
  <fieldset :disabled="disabled" class="observation">
    <legend>気象・環境（任意）</legend>
    <p v-if="previous && !modelValue">前回の候補：{{ observationLabel(previous) }}（未確認・保存されません）</p>
    <button v-if="previous" type="button" @click="emit('update:modelValue', { source: 'observed', changes: [], ...(previous.sky ? { sky: previous.sky } : {}), ...(previous.wind ? { wind: previous.wind } : {}) })">前回の空模様・風を確認して使う</button>
    <p>空模様</p><div class="choices"><button v-for="(label, key) in skyLabels" :key="key" type="button" :aria-pressed="current.sky === key" @click="update({ sky: current.sky === key ? undefined : key })">{{ label }}</button></div>
    <p>風</p><div class="choices"><button v-for="(label, key) in windLabels" :key="key" type="button" :aria-pressed="current.wind === key" @click="update({ wind: current.wind === key ? undefined : key })">{{ label }}</button></div>
    <p>変化（複数選択）</p><div class="choices"><button v-for="(label, key) in weatherChangeLabels" :key="key" type="button" :aria-pressed="current.changes.includes(key)" @click="change(key)">{{ label }}</button></div>
    <label>気象の補足メモ<textarea :value="current.note ?? ''" rows="2" @input="update({ note: ($event.target as HTMLTextAreaElement).value })" /></label>
    <button v-if="modelValue" type="button" @click="emit('update:modelValue', undefined)">気象入力をクリア</button>
    <p role="status">{{ modelValue ? '選択した観測内容を記録と一緒に保存します' : '未入力（気象なしでも釣果を保存できます）' }}</p>
  </fieldset>
</template>
<style scoped>
.observation { min-width:0; margin:12px 0; padding:12px; border:1px solid #aab4be; border-radius:12px; } p { font-size:13px; } .choices { display:flex; flex-wrap:wrap; gap:6px; }
button,textarea { font:inherit; color:inherit; background:var(--surface,#fff); border:1px solid #aab4be; border-radius:8px; padding:10px; min-height:44px; box-sizing:border-box; } button[aria-pressed=true] { background:#d7f4e5; color:#12523f; border-color:#237d69; } label { display:grid; gap:6px; margin:12px 0; } textarea { width:100%; }
</style>
