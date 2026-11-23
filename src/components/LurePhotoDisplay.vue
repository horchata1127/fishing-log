<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LureOption } from '../utils/catchRegistration'
import { resolveColorPhoto, subscribePhotos } from '../utils/lurePhotos'
import { isNoaOption, photoOptionIdentity } from '../utils/noaPhotoCatalog'
import type { PhotoFace } from '../db/lurePhotoTypes'
import LocalColorPhoto from './LocalColorPhoto.vue'
import ExternalColorPhoto from './ExternalColorPhoto.vue'
import VisualColorPreview from './VisualColorPreview.vue'
const props = defineProps<{ option: LureOption; preferSvg?: boolean }>()
const face = ref<PhotoFace>('front'), resolved = ref<Awaited<ReturnType<typeof resolveColorPhoto>>>()
const faceChosen = ref(false)
const failures = ref<string[]>([]), online = ref(navigator.onLine)
const externalFailures = ref<string[]>([]), externalLoaded = ref('')
let sequence = 0, unsubscribe: (() => void) | undefined
const local = computed(() => resolved.value?.local.find(p => p.blobId && !failures.value.includes(p.blobId)))
const external = computed(() => !props.preferSvg && !local.value && online.value && resolved.value?.imageReference &&
  !externalFailures.value.includes(resolved.value.imageReference.imageUrl) ? resolved.value.imageReference : undefined)
watch(external, () => { externalLoaded.value = '' })
async function refresh() {
  const current = ++sequence
  try {
    const value = await resolveColorPhoto(props.option, face.value)
    if (current === sequence) {
      resolved.value = value
      if (!faceChosen.value && face.value === 'front' && !value?.local.length && value?.faces.length) face.value = value.faces.includes('back') ? 'back' : 'other'
    }
  }
  catch { if (current === sequence) resolved.value = undefined }
}
function connection() { online.value = navigator.onLine; externalLoaded.value = ''; if (online.value) externalFailures.value = [] }
function chooseFace(value: PhotoFace) { faceChosen.value = true; face.value = value }
watch(() => photoOptionIdentity(props.option), () => { faceChosen.value = false; face.value = 'front' })
watch(() => [photoOptionIdentity(props.option), face.value], () => { failures.value = []; externalFailures.value = []; externalLoaded.value = ''; resolved.value = undefined; void refresh() }, { immediate: true })
onMounted(() => { unsubscribe = subscribePhotos(() => { failures.value = []; void refresh() }); window.addEventListener('online', connection); window.addEventListener('offline', connection) })
onBeforeUnmount(() => { sequence++; unsubscribe?.(); window.removeEventListener('online', connection); window.removeEventListener('offline', connection) })
</script>

<template>
  <div v-if="isNoaOption(option)" class="lure-photo-display" @click.stop>
    <template v-if="!preferSvg">
      <div v-if="resolved?.faces.length" class="photo-faces" role="group" aria-label="写真の面">
        <button type="button" :aria-pressed="face === 'front'" @click="chooseFace('front')">表</button>
        <button type="button" :aria-pressed="face === 'back'" @click="chooseFace('back')">裏</button>
        <button v-if="resolved.faces.includes('other')" type="button" :aria-pressed="face === 'other'" @click="chooseFace('other')">他</button>
      </div>
      <LocalColorPhoto v-if="local?.blobId" :blob-id="local.blobId" :alt="`${option.colorName} ${face === 'front' ? '表面' : face === 'back' ? '裏面' : 'その他'}写真`" @error="failures.push(local!.blobId!)" />
      <ExternalColorPhoto v-if="external" :key="external.imageUrl" :src="external.imageUrl" :alt="`${option.modelName} ${option.colorName} 外部${external.imageKind === 'weight-common-color-sample' ? '重量共通の色見本' : '商品写真'}`" @load="externalLoaded = $event" @error="externalFailures.push($event)" />
      <small v-if="external && externalLoaded === external.imageUrl">画像出典：<a :href="external.externalProductUrl" target="_blank" rel="noopener noreferrer" @click.stop>{{ external.sourceName }}</a>{{ external.imageKind === 'weight-common-color-sample' ? '・重量共通の色見本' : '・撮影面の指定なし' }}</small>
    </template>
    <template v-if="preferSvg || !local && (!external || externalLoaded !== external.imageUrl)">
      <VisualColorPreview v-if="option.visualColorSnapshot" :appearance="option.visualColorSnapshot.appearance" :color-values="option.visualColorSnapshot.colorValues" />
      <svg v-else class="generic-spoon" role="img" aria-label="汎用ルアーアイコン" viewBox="0 0 90 48"><path d="M19 31C6 13 31 3 57 8S78 32 59 39 27 42 19 31Z" fill="#d9e1df" stroke="#667b73" stroke-width="2"/><circle cx="19" cy="23" r="3" fill="white"/><path d="M76 26q17 21-1 16" fill="none" stroke="#667b73" stroke-width="2"/></svg>
    </template>
    <template v-if="!preferSvg && resolved?.externalProductUrl">
      <a :href="resolved.externalProductUrl" target="_blank" rel="noopener noreferrer" @click.stop>写真を見る</a>
      <a v-for="link in resolved.additionalProductLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" @click.stop>その他の商品ページ（{{ link.sourceName }}）</a>
      <small>{{ resolved.sourceName }}・{{ online ? '通信が必要です' : 'オフライン：接続後に開けます' }}</small>
    </template>
    <small v-else-if="!preferSvg && !local && !external">{{ face === 'back' ? '裏面写真なし' : '写真未登録' }}</small>
  </div>
</template>

<style scoped>
.lure-photo-display { padding:6px; min-width:110px; max-width:190px; color:#17212b; }
.photo-faces { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px; }
.photo-faces button,a { min-height:44px; min-width:44px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #a8bab0; border-radius:7px; background:#fff; color:#176349; padding:5px 9px; font:inherit; text-decoration:none; }
.photo-faces button[aria-pressed="true"] { background:#e3f3eb; border-color:#1b7959; }
small { display:block; font-size:11px; line-height:1.4; }
.generic-spoon { width:90px; height:48px; display:block; }
</style>
