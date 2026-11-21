<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { db } from '../db/database'
const props = defineProps<{ blobId: string; alt: string }>()
const emit = defineEmits<{ error: [] }>()
const element = ref<HTMLElement>(), zoom = ref<HTMLElement>(), opener = ref<HTMLButtonElement>()
const url = ref(''), expanded = ref(false), failed = ref(false)
let visible = false, sequence = 0, observer: IntersectionObserver | undefined
function release() { if (url.value) URL.revokeObjectURL(url.value); url.value = '' }
async function load() {
  const current = ++sequence
  release(); failed.value = false
  if (!visible) return
  try {
    const row = await db.lurePhotoBlobs.get(props.blobId)
    if (current !== sequence) return
    if (!row?.blob) throw new Error('写真がありません')
    url.value = URL.createObjectURL(row.blob)
  } catch { if (current === sequence) fail() }
}
function fail() { failed.value = true; release(); emit('error') }
async function open() { expanded.value = true; await nextTick(); zoom.value?.querySelector<HTMLButtonElement>('button')?.focus() }
function close() { expanded.value = false; opener.value?.focus() }
function trap(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
  if (event.key !== 'Tab') return
  const buttons = [...zoom.value?.querySelectorAll<HTMLElement>('button,[href]') ?? []]
  const first = buttons[0], last = buttons.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
watch(() => props.blobId, load)
onMounted(() => {
  if (!('IntersectionObserver' in window)) { visible = true; void load(); return }
  observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { visible = true; observer?.disconnect(); void load() } }, { rootMargin: '120px' })
  if (element.value) observer.observe(element.value)
})
onBeforeUnmount(() => { sequence++; observer?.disconnect(); release() })
</script>

<template>
  <div ref="element" class="local-color-photo" @click.stop>
    <button v-if="url" ref="opener" type="button" class="photo-open" :aria-label="`${alt}を拡大`" @click="open">
      <img :src="url" :alt="alt" loading="lazy" decoding="async" @error="fail" />
    </button>
    <small v-else>{{ failed ? '写真を表示できません。カラーは選択できます。' : '写真を読み込み中' }}</small>
    <Teleport to="body">
      <div v-if="expanded" class="photo-zoom-backdrop" @click.self="close">
        <section ref="zoom" role="dialog" aria-modal="true" aria-label="カラー写真の拡大" class="photo-zoom" @keydown="trap">
          <button type="button" @click="close">写真を閉じる</button>
          <p>{{ alt }}</p>
          <slot name="zoom-controls" />
          <img v-if="url" :src="url" :alt="alt" @error="fail" />
          <p v-else>この面の写真は表示できません。写真を閉じてカラーを選択できます。</p>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.photo-open { border:1px solid #ccd8d2; border-radius:10px; padding:4px; background:white; min-width:80px; min-height:80px; cursor:zoom-in; }
.photo-open img { width:100px; height:80px; object-fit:contain; display:block; }
.local-color-photo small { display:block; max-width:160px; }
.photo-zoom-backdrop { position:fixed; inset:0; z-index:700; background:#000b; padding:12px; display:grid; place-items:center; }
.photo-zoom { width:min(100%,860px); max-height:94dvh; overflow:auto; padding:16px; border-radius:14px; background:white; color:#17212b; }
.photo-zoom img { display:block; max-width:100%; max-height:72dvh; object-fit:contain; margin:auto; }
.photo-zoom button { min-height:44px; min-width:44px; padding:8px 14px; border:1px solid #aebbb4; border-radius:8px; background:white; color:#17212b; font:inherit; }
</style>
