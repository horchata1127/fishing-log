<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { db } from '../db/database'
import type { LureOption } from '../utils/catchRegistration'
import type { LureColorPhoto, PhotoFace, PhotoRights } from '../db/lurePhotoTypes'
import { photoDetails, preparePhoto, saveColorPhoto, deleteColorPhoto, saveExternalPhotoLink, createPhotoBackup, importPhotoBackup, photoLimits } from '../utils/lurePhotos'
import { photoOptionIdentity, sharedColorForOption } from '../utils/noaPhotoCatalog'
import LocalColorPhoto from './LocalColorPhoto.vue'
const props = defineProps<{ option: LureOption; catalog: LureOption[] }>()
const emit = defineEmits<{ close: []; updated: []; busy: [value: boolean] }>()
const details = ref<Awaited<ReturnType<typeof photoDetails>>>(), message = ref(''), busy = ref(false)
const file = ref<File>(), fileInput = ref<HTMLInputElement>(), replacing = ref<LureColorPhoto>()
const face = ref<PhotoFace>('front'), modelOnly = ref(false), rights = ref<PhotoRights>('user-owned')
const sourceName = ref(''), sourceUrl = ref(''), rightsNote = ref(''), consent = ref(false), verified = ref(false)
const linkModelOnly = ref(false), productUrl = ref(''), linkSource = ref(''), linkVerified = ref(false)
const shared = computed(() => details.value?.shared ?? sharedColorForOption(props.option))
const peers = computed(() => props.catalog.filter(c => sharedColorForOption(c)?.id === shared.value?.id))
const models = computed(() => [...new Set(peers.value.map(c => c.modelName))])
const localPhotos = computed(() => details.value?.photos.filter(p => p.imageAvailability === 'local') ?? [])
async function refresh() { details.value = await photoDetails(props.option); fillLink() }
function fillLink() {
  const modelLink = details.value?.photos.find(p => p.imageAvailability === 'external' && p.variantIdentity === photoOptionIdentity(props.option))
  productUrl.value = (linkModelOnly.value ? modelLink?.externalProductUrl : details.value?.shared.externalProductUrl) ?? ''
  linkSource.value = (linkModelOnly.value ? modelLink?.sourceName : details.value?.shared.sourceName) ?? ''
  linkVerified.value = false
}
watch(linkModelOnly, fillLink)
onMounted(async () => { try { await refresh() } catch { message.value = '写真情報を読み込めませんでした。' } })
async function act(work: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; emit('busy', true); message.value = ''
  try { await work(); await refresh(); emit('updated') }
  catch (error) { message.value = error instanceof Error ? error.message : '写真の処理に失敗しました。' }
  finally { busy.value = false; emit('busy', false) }
}
function reset() {
  file.value = undefined; replacing.value = undefined; consent.value = false; verified.value = false
  if (fileInput.value) fileInput.value.value = ''
}
function replace(photo: LureColorPhoto) {
  reset(); replacing.value = photo; face.value = photo.imageType; modelOnly.value = !!photo.variantIdentity
  rights.value = photo.rightsStatus === 'permitted' ? 'permitted' : 'user-owned'
  sourceName.value = photo.sourceName; sourceUrl.value = photo.sourceUrl; rightsNote.value = photo.rightsNote
  fileInput.value?.focus()
}
async function save() {
  await act(async () => {
    if (!consent.value) throw new Error('写真の保存・表示・バックアップについて権利を確認してください。')
    const image = file.value ? await preparePhoto(file.value) : replacing.value?.blobId ? await db.lurePhotoBlobs.get(replacing.value.blobId) : undefined
    if (!image) throw new Error('登録する写真を選択してください。')
    await saveColorPhoto(props.option, image, { modelOnly: modelOnly.value, imageType: face.value, rightsStatus: rights.value,
      sourceName: rights.value === 'user-owned' ? '自分で撮影' : sourceName.value.trim(), sourceUrl: sourceUrl.value.trim(), rightsNote: rightsNote.value,
      verificationStatus: verified.value ? 'verified' : 'unverified' }, replacing.value)
    reset(); message.value = '写真を保存しました。所有情報・釣果・SVG配色は変更していません。'
  })
}
async function remove(photo: LureColorPhoto) { await act(async () => { await deleteColorPhoto(photo); if (replacing.value?.id === photo.id) reset(); message.value = 'この写真を削除しました。' }) }
async function saveLink() { await act(async () => { await saveExternalPhotoLink(props.option, productUrl.value.trim(), linkSource.value, linkVerified.value, linkModelOnly.value); message.value = '商品ページリンクを保存しました。画像は取得していません。' }) }
async function exportPhotos() {
  await act(async () => {
    const data = await createPhotoBackup(), blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    if (blob.size > photoLimits.archiveBytes) throw new Error('写真バックアップが150MBを超えています。不要な写真を整理してください。')
    const url = URL.createObjectURL(blob), a = document.createElement('a')
    try { a.href = url; a.download = 'fishing-log-lure-photos.json'; document.body.append(a); a.click() }
    finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000) }
    message.value = '写真バックアップを保存しました。釣行JSONとは別に保管してください。'
  })
}
async function restorePhotos(event: Event) {
  const input = event.target as HTMLInputElement, selected = input.files?.[0]
  if (selected) await act(async () => { await importPhotoBackup(selected); message.value = '写真バックアップを取り込みました。' })
  input.value = ''
}
</script>

<template>
  <section class="photo-manager" role="region" aria-label="カラー写真の管理" :aria-busy="busy">
    <h3>NOA カラー写真</h3>
    <strong>{{ shared?.colorCode ? `#${shared.colorCode} ` : '' }}{{ shared?.colorName }}</strong>
    <p>NOA共通カラー：{{ models.length }}モデル・{{ peers.length }}件で共有</p>
    <details><summary>共通カラーとの対応を見る</summary><ul><li v-for="p in peers" :key="p.variantId">{{ p.modelName }} / {{ p.colorName }}</li></ul></details>
    <p v-if="shared?.colorVerificationStatus === 'review-needed'">この表記は他の似た名称とは統合していません。</p>
    <p role="status">{{ message }}</p>
    <fieldset :disabled="busy">
      <h4>{{ replacing ? '写真の差し替え・確認状態の変更' : '写真を追加' }}</h4>
      <label>写真ファイル<input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" aria-label="カラー写真ファイル" @change="file = ($event.target as HTMLInputElement).files?.[0]" /></label>
      <small>JPEG・PNG・WebP、15MB以下。長辺1280pxへ縮小して保存します。HEICはJPEGへ変換してください。</small>
      <label>写真の面<select v-model="face" aria-label="登録する写真の面"><option value="front">表面</option><option value="back">裏面</option><option value="other">その他</option></select></label>
      <label>共有範囲<select v-model="modelOnly" aria-label="写真の共有範囲"><option :value="false">NOAシリーズ共通</option><option :value="true">{{ option.modelName }}専用</option></select></label>
      <label>写真の権利<select v-model="rights"><option value="user-owned">自分で撮影した写真</option><option value="permitted">利用許可のある写真</option></select></label>
      <template v-if="rights === 'permitted'"><label>写真の出典名<input v-model="sourceName" /></label><label>許可の内容・確認方法<textarea v-model="rightsNote" /></label></template>
      <label>写真の出典URL（任意）<input v-model="sourceUrl" type="url" /></label>
      <label class="check"><input v-model="consent" type="checkbox" />自分が撮影した写真、または端末への保存・表示・自分の写真バックアップへの利用が許可された写真です</label>
      <label class="check"><input v-model="verified" type="checkbox" />このカラーと写真の面が正しいことを確認しました</label>
      <small>未確認の写真は管理画面だけに表示され、釣行中の候補には使いません。</small>
      <button type="button" :disabled="!consent || (!file && !replacing)" @click="save">{{ replacing ? '写真の変更を保存' : '写真を保存' }}</button>
      <button v-if="replacing" type="button" @click="reset">差し替えをキャンセル</button>
      <h4>保存済み写真（{{ localPhotos.length }}枚）</h4>
      <article v-for="photo in localPhotos" :key="photo.id" class="saved-photo" :data-photo-id="photo.id">
        <LocalColorPhoto v-if="photo.blobId" :blob-id="photo.blobId" :alt="`${shared?.colorName} ${photo.imageType === 'front' ? '表面' : photo.imageType === 'back' ? '裏面' : 'その他'}写真`" />
        <p>{{ photo.variantIdentity ? `${option.modelName}専用` : 'NOAシリーズ共通' }}・{{ photo.verificationStatus === 'verified' ? '確認済み' : '未確認' }}</p>
        <small>{{ photo.sourceName }}・{{ photo.rightsStatus === 'user-owned' ? '自分で撮影' : '利用許可確認済み' }}・{{ photo.updatedAt }}</small>
        <a v-if="photo.sourceUrl" :href="photo.sourceUrl" target="_blank" rel="noopener noreferrer">写真の出典</a>
        <button type="button" @click="replace(photo)">この写真を差し替え</button><button type="button" @click="remove(photo)">この写真を削除</button>
      </article>
      <details><summary>商品ページリンクを管理</summary>
        <p>写真を保存できない場合のリンクは1件です。画像をダウンロードせず、別タブで商品ページを開きます。</p>
        <label>リンクの共有範囲<select v-model="linkModelOnly"><option :value="false">NOAシリーズ共通</option><option :value="true">{{ option.modelName }}専用</option></select></label>
        <label>個別商品ページURL<input v-model="productUrl" type="url" /></label>
        <label>ショップ名<input v-model="linkSource" /></label>
        <label class="check"><input v-model="linkVerified" type="checkbox" />この商品ページのカラー番号・名称と写真を確認しました</label>
        <small>最終確認：{{ shared?.lastCheckedAt || '未確認' }}／ショップ写真の保存許可：未確認（リンクのみ）</small>
        <button type="button" :disabled="!!productUrl && !linkVerified" @click="saveLink">リンクを保存</button>
        <button type="button" @click="productUrl = ''; saveLink()">リンクを削除</button>
      </details>
      <details><summary>写真のバックアップ</summary>
        <p>通常の釣行JSONには写真を含めません。写真・出典・共通カラーの対応を別ファイルで保存します。旧JSONを復元しても端末の写真は残り、異なるカラーIDへ写真を流用しません。</p>
        <button type="button" @click="exportPhotos">写真バックアップを保存</button>
        <label>写真バックアップを読み込む<input type="file" accept=".json,application/json" aria-label="写真バックアップファイル" @change="restorePhotos" /></label>
      </details>
      <button type="button" @click="emit('close')">写真管理を閉じる</button>
    </fieldset>
  </section>
</template>

<style scoped>
.photo-manager { border:1px solid #a9c3b7; padding:12px; border-radius:12px; background:#f5faf7; }
fieldset { border:0; padding:0; min-width:0; }
label,small { display:block; margin:8px 0; }
input:not([type="checkbox"]),select,textarea { width:100%; box-sizing:border-box; }
button,input,select,textarea { min-height:44px; font:inherit; color:#17212b; border:1px solid #aebbb4; border-radius:7px; background:white; }
button { padding:8px 12px; margin:4px; cursor:pointer; }
.check { display:flex; align-items:center; gap:8px; }
.check input { flex-shrink:0; width:24px; }
summary { cursor:pointer; min-height:44px; padding:8px 0; }
.saved-photo { border-top:1px solid #c7d7cf; padding:12px 0; }
small { font-size:12px; overflow-wrap:anywhere; }
</style>
