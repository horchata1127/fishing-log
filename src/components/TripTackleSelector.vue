<script setup lang="ts">
import type { TackleSet } from '../db/database'
const props = defineProps<{ sets: TackleSet[]; modelValue: number[] }>()
const emit = defineEmits<{ 'update:modelValue': [ids: number[]] }>()
function toggle(id: number, checked: boolean) {
  emit('update:modelValue', checked ? [...new Set([...props.modelValue, id])] : props.modelValue.filter(value => value !== id))
}
</script>
<template>
  <fieldset>
    <legend>持参予定のセット（複数選択・未指定可）</legend>
    <p v-if="!sets.length">使用可能なセットはありません。タックル管理で登録できます。</p>
    <label v-for="set in sets" :key="set.id">
      <input type="checkbox" :checked="modelValue.includes(set.id!)" @change="toggle(set.id!, ($event.target as HTMLInputElement).checked)" />{{ set.name }}
    </label>
  </fieldset>
</template>
<style scoped>
fieldset { min-width:0; border:1px solid #d9dee3; border-radius:12px; padding:12px; margin:16px 0; }
legend, p { font-size:13px; }
label { display:flex; align-items:center; gap:8px; min-height:44px; }
input { width:auto; }
</style>
