<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
const props = defineProps<{ src: string; alt: string }>()
const emit = defineEmits<{ load: [url: string]; error: [url: string] }>()
const ready = ref(false), expanded = ref(false), opener = ref<HTMLButtonElement>(), closeButton = ref<HTMLButtonElement>()
let disposed = false
function loaded() { if (!disposed) { ready.value = true; emit('load', props.src) } }
function failed() { if (!disposed) { expanded.value = false; emit('error', props.src) } }
async function open() { expanded.value = true; await nextTick(); closeButton.value?.focus() }
function close() { expanded.value = false; opener.value?.focus() }
function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  if (event.key === 'Tab') { event.preventDefault(); closeButton.value?.focus() }
}
onBeforeUnmount(() => { disposed = true })
</script>

<template>
  <div class="external-color-photo" @click.stop>
    <button ref="opener" type="button" :aria-label="`${alt}を拡大`" :disabled="!ready" :class="{ pending: !ready }" @click="open">
      <img :src="src" :alt="alt" loading="lazy" decoding="async" referrerpolicy="no-referrer" @load="loaded" @error="failed" />
    </button>
    <Teleport to="body">
      <div v-if="expanded" class="external-photo-backdrop" @click.self="close">
        <section role="dialog" aria-modal="true" aria-label="外部カラー写真の拡大" @keydown="keys">
          <button ref="closeButton" type="button" @click="close">写真を閉じる</button>
          <p>{{ alt }}</p>
          <img :src="src" :alt="alt" referrerpolicy="no-referrer" @error="failed" />
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
button { min-width:44px; min-height:44px; border:1px solid #ccd8d2; border-radius:8px; padding:5px; background:white; color:#17212b; font:inherit; }
button.pending { opacity:0; pointer-events:none; }
img { width:140px; height:100px; object-fit:contain; display:block; }
.external-photo-backdrop { position:fixed; inset:0; z-index:700; padding:12px; background:#000b; display:grid; place-items:center; }
section { width:min(100%,860px); max-height:94dvh; overflow:auto; background:white; color:#17212b; padding:16px; border-radius:14px; }
section img { width:auto; height:auto; max-width:100%; max-height:72dvh; margin:auto; }
</style>
