<script setup lang="ts">
import { computed, ref } from 'vue'
import { fishGroups, type FishSpecies } from '../db/database'
const props = defineProps<{ choices: FishSpecies[]; modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>()
const search = ref('')
const group = ref('')
const selected = computed(() => props.choices.find(row => row.fish_id === props.modelValue))
const filtered = computed(() => props.choices.filter(row => (!group.value || row.group === group.value) &&
  [row.display_name, row.aliases, row.region].join(' ').toLocaleLowerCase('ja-JP').includes(search.value.trim().toLocaleLowerCase('ja-JP'))))
</script>
<template>
  <fieldset>
    <legend>魚種（未設定可）</legend>
    <div class="filters">
      <label>魚種を検索<input v-model="search" type="search" placeholder="名称・別名・地域" /></label>
      <label>魚種の分類<select v-model="group"><option value="">すべて</option><option v-for="item in fishGroups" :key="item">{{ item }}</option></select></label>
    </div>
    <label>魚種を選択
      <select :value="modelValue ?? ''" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value || undefined)">
        <option value="">魚種未設定</option>
        <option v-if="selected && !filtered.includes(selected)" :value="selected.fish_id">{{ selected.display_name }}（選択中）</option>
        <option v-for="fish in filtered" :key="fish.fish_id" :value="fish.fish_id">{{ fish.display_name }}</option>
      </select>
    </label>
    <p v-if="selected">{{ selected.group }} / {{ selected.region || '地域未記載' }} / {{ selected.source_status || '確認状態未記載' }}</p>
    <small>原本の確認状態を表示しています。現在の放流状況を示すものではありません。未登録の初期候補は釣果保存時に登録します。</small>
  </fieldset>
</template>
<style scoped>
fieldset { min-width:0; padding:12px; margin:16px 0; border:1px solid #d9dee3; border-radius:12px; }
.filters { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px; }
label { display:block; font-size:13px; margin:8px 0; }
input, select { display:block; width:100%; min-width:0; box-sizing:border-box; padding:12px; border:1px solid #d9dee3; border-radius:8px; background:white; color:#17212b; font:inherit; font-size:16px; }
p, small { font-size:12px; color:#69747e; overflow-wrap:anywhere; }
</style>
