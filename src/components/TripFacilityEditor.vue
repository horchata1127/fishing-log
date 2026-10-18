<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { FishingTrip } from '../db/database'
import { listLinkableFacilities, previewTripFacilityLink, saveTripFacilityLink, type FacilityLinkPreview } from '../utils/tripFacilityLink'
const props = defineProps<{ trip: FishingTrip }>()
const emit = defineEmits<{ saved:[trip:FishingTrip]; cancel:[] }>()
const facilities = ref<Awaited<ReturnType<typeof listLinkableFacilities>>>([]), search = ref(''), selected = ref(props.trip.facilityId ?? '')
const preview = ref<FacilityLinkPreview>(), confirmed = ref(false), busy = ref(false), error = ref('')
const matches = computed(() => facilities.value.filter(f => f.id === selected.value || f.name.includes(search.value.trim())))
const requiresConfirmation = computed(() => !!preview.value && (!!preview.value.affected.length || preview.value.clearCurrentZone))
const suggested = computed(() => !props.trip.facilityId ? facilities.value.filter(f => f.name === props.trip.fishingAreaName) : [])
onMounted(async () => { try { facilities.value = await listLinkableFacilities() } catch { error.value = '施設一覧を読み込めませんでした。' } })
async function select() {
  preview.value = undefined; confirmed.value = false; error.value = ''
  if (!props.trip.id || !selected.value) return
  busy.value = true
  try { preview.value = await previewTripFacilityLink(props.trip.id, selected.value) }
  catch (e) { error.value = e instanceof Error ? e.message : '影響を確認できませんでした。' }
  finally { busy.value = false }
}
async function save() {
  if (!preview.value || busy.value) return
  busy.value = true; error.value = ''
  try { emit('saved', await saveTripFacilityLink(preview.value,confirmed.value)) }
  catch (e) { error.value = e instanceof Error ? e.message : '保存できませんでした。' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="facility-overlay"><section class="facility-dialog" role="dialog" aria-modal="true" aria-label="釣り場・施設を編集" :aria-busy="busy">
    <h2>釣り場・施設を編集</h2>
    <p>現在：{{ trip.fishingAreaName }}<br />施設ID：{{ trip.facilityId || '未設定' }}</p>
    <p>施設を選んで保存した場合だけ紐付けます。釣果のメモからエリアを補完しません。</p>
    <p v-if="suggested.length">名前が一致する候補：{{ suggested.map(f => f.name).join('、') }}。自動選択・保存はしません。</p>
    <label>正式施設を検索<input v-model="search" type="search" :disabled="busy" /></label>
    <label>紐付ける正式施設<select v-model="selected" :disabled="busy" @change="select"><option value="">施設を選択してください</option>
      <option v-if="trip.facilityId && !facilities.some(f => f.id === trip.facilityId)" :value="trip.facilityId" disabled>現在のID（正式候補外・保存せず保持できます）</option>
      <option v-for="f in matches" :key="f.id" :value="f.id">{{ f.name }}</option></select></label>
    <button v-if="selected && !preview" type="button" :disabled="busy" @click="select">選択施設の影響を確認</button>
    <template v-if="preview"><p>保存後の施設名：{{ preview.facility.name }}<br />施設ID：{{ preview.facility.id }}</p>
      <p>旧施設・所属未確認のエリアが残る記録：{{ preview.affected.length }}件（釣果 {{ preview.affected.filter(c => c.result === '釣果').length }}／バラシ {{ preview.affected.filter(c => c.result === 'バラシ').length }}）。記録のID・メモ・snapshotは変更しません。</p>
      <details v-if="preview.affected.length"><summary>影響する記録</summary><p v-for="c in preview.affected" :key="c.id">{{ c.result }} #{{ c.id }}：{{ c.facilityName }}／{{ c.zoneName }}（{{ c.zoneId || 'ID未設定' }}）</p></details>
      <p v-if="preview.clearCurrentZone">釣行の現在エリア {{ preview.trip.currentZoneId }} は新施設と一致しないため、保存時に未設定にします。釣果に保存された旧エリアは保持します。</p>
      <label v-if="requiresConfirmation" class="confirm"><input v-model="confirmed" type="checkbox" :disabled="busy" />旧エリアを保持し、必要な現在エリアの解除を確認しました</label>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="button" :disabled="busy || !preview || (requiresConfirmation && !confirmed)" @click="save">施設を保存する</button>
    <button type="button" :disabled="busy" @click="emit('cancel')">キャンセル</button>
  </section></div>
</template>
<style scoped>
.facility-overlay { position:fixed; inset:0; z-index:120; display:flex; align-items:center; justify-content:center; padding:16px; background:rgb(0 0 0 / 45%); }
.facility-dialog { box-sizing:border-box; width:min(100%,520px); max-height:85dvh; overflow-y:auto; min-width:0; padding:20px; border-radius:18px; background:white; color:#17212b; overflow-wrap:anywhere; }
h2 { font-size:20px; } p { line-height:1.65; font-size:14px; } label { display:grid; gap:6px; margin:12px 0; } input,select,button { box-sizing:border-box; width:100%; min-width:0; max-width:100%; min-height:44px; padding:10px; font:inherit; border:1px solid #ccd3d8; border-radius:8px; background:white; color:#17212b; }
button { margin-top:10px; } button:disabled { opacity:.55; } .confirm { display:flex; align-items:center; } .confirm input { width:24px; flex:0 0 24px; } [role=alert] { color:#9b2424; } summary { min-height:44px; cursor:pointer; }
</style>
