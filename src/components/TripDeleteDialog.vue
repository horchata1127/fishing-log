<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TripDeletionSummary } from '../utils/tripDeletion'

defineProps<{ summary: TripDeletionSummary; busy: boolean; error: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" class="trip-delete-dialog" aria-labelledby="trip-delete-title" :aria-busy="busy"
    @cancel.prevent="!busy && emit('cancel')">
    <h2 id="trip-delete-title">釣行を削除しますか？</h2>
    <dl>
      <dt>釣行名（釣り場）</dt><dd>{{ summary.trip.fishingAreaName }}</dd>
      <dt>日付</dt><dd>{{ summary.trip.fishingDate.replaceAll('-', '/') }}</dd>
      <dt>関連する釣果</dt><dd>{{ summary.catchCount }}件</dd>
      <dt>放流・ペレット記録</dt><dd>{{ summary.eventCount }}件</dd>
    </dl>
    <p v-if="!summary.trip.endedAt" class="warning">この釣行は釣行中です。削除すると記録を続けられなくなります。</p>
    <p>この釣行と関連する釣果・放流・ペレット記録を削除します。元に戻せません。</p>
    <p class="hint">他の釣行、所有ルアー、魚種マスター、タックルは残ります。</p>
    <p v-if="error" role="alert" class="warning">削除できませんでした。{{ error }}</p>
    <div class="actions">
      <button type="button" autofocus :disabled="busy" @click="emit('cancel')">キャンセル</button>
      <button type="button" class="confirm-delete" :disabled="busy" @click="emit('confirm')">
        {{ busy ? '削除中…' : 'この釣行と関連記録を削除する' }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.trip-delete-dialog { width:calc(100% - 36px); max-width:520px; max-height:calc(100dvh - 36px); overflow-y:auto; padding:20px; border:1px solid #d9dee3; border-radius:18px; background:#fff; color:var(--text); text-align:left; overflow-wrap:anywhere; }
.trip-delete-dialog::backdrop { background:rgb(0 0 0 / 45%); }
h2 { margin:0 0 16px; font-size:20px; }
dl { margin:0 0 16px; }
dt { margin-top:8px; color:var(--text-muted); font-size:13px; }
dd { margin:0; font-weight:700; }
p { margin:12px 0; }
.hint { color:var(--text-muted); font-size:13px; }
.warning { color:#9b2424; font-weight:700; }
.actions { display:grid; gap:10px; margin-top:20px; }
button { width:100%; min-height:44px; padding:12px; border:1px solid #d9dee3; border-radius:10px; background:#fff; color:var(--text); font:inherit; cursor:pointer; }
.confirm-delete { background:#9b2424; border-color:#9b2424; color:#fff; font-weight:700; }
button:disabled { opacity:.65; cursor:default; }
</style>
