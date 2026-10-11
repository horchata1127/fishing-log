<script setup lang="ts">
import { computed, ref } from 'vue'
import { offline, applyOfflineUpdate } from '../pwa'
const props = defineProps<{ safe: boolean }>()
const deferred = ref(false)
const label = computed(() => offline.failed ? '圏外利用の準備に失敗しました。通信復帰後に開き直してください。'
  : offline.installed && offline.controlled ? '圏外利用の準備完了'
  : offline.installed ? '準備を完了するにはホームで再読み込みしてください。' : '圏外利用を準備中…')
</script>

<template>
  <aside v-if="offline.enabled" class="offline-status" aria-label="圏外利用と更新">
    <p aria-live="polite">{{ label }}<span v-if="!offline.online"> · オフライン（接続状態の目安）</span></p>
    <p v-if="offline.updateAvailable">更新があります。入力・保存を終えてから反映してください。</p>
    <template v-if="offline.updateAvailable && !deferred || offline.installed && !offline.controlled">
      <button :disabled="!props.safe || offline.updating" @click="applyOfflineUpdate(() => props.safe)">
        {{ offline.updateAvailable ? '更新して再読み込み' : '準備を完了して再読み込み' }}
      </button>
      <button v-if="offline.updateAvailable" @click="deferred = true">後で</button>
    </template>
    <button v-else-if="offline.updateAvailable && deferred" @click="deferred = false">更新操作を表示</button>
    <p v-if="offline.message" aria-live="polite">{{ offline.message }}</p>
  </aside>
</template>

<style scoped>
.offline-status { margin: 0 0 12px; padding: 8px 12px; border: 1px solid #d9dee3; border-radius: 8px; color: #52606b; background: #fff; font-size: .85rem; overflow-wrap: anywhere; }
p { margin: 4px 0; }
button { max-width: 100%; margin: 4px 8px 4px 0; padding: 6px 10px; white-space: normal; color: #17212b; background: #f4f7f6; border: 1px solid #d9dee3; border-radius: 6px; }
button:disabled { opacity: .6; }
</style>
