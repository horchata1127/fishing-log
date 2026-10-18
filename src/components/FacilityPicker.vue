<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { loadLocationChoices, addUserFacility, addUserZone, type LocationChoice } from '../utils/tripLocations'
const props = defineProps<{ facilityId?: string; zoneId?: string; retainedZoneId?: string; retainedZoneName?: string; catchArea?: boolean; fixed?: boolean; tripId?: number; zoneLabel?: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:facilityId': [id: string | undefined]; 'update:zoneId': [id: string | undefined]; busy: [value: boolean] }>()
const facilities = ref<LocationChoice[]>([]), zones = ref<LocationChoice[]>([]), facility = ref<LocationChoice>()
const search = ref(''), editor = ref<'facility' | 'zone'>(), draft = ref(''), saving = ref(false), loading = ref(false), error = ref('')
const choices = computed(() => {
  const selected = facilities.value.filter(f => f.id === props.facilityId)
  const matches = facilities.value.filter(f => f.id !== props.facilityId && f.name.toLocaleLowerCase('ja-JP').includes(search.value.trim().toLocaleLowerCase('ja-JP')))
  return [...selected, ...matches.slice(0, 80 - selected.length)]
})
let request = 0
async function reload() {
  const key = ++request; loading.value = true
  try {
    const data = await loadLocationChoices(props.facilityId, props.retainedZoneId, props.catchArea)
    if (key !== request) return
    facilities.value = data.facilities; zones.value = data.zones; facility.value = data.facility; error.value = ''
  } catch (e) { if (key === request) error.value = e instanceof Error ? e.message : String(e) }
  finally { if (key === request) loading.value = false }
}
watch(() => [props.facilityId, props.retainedZoneId], reload, { immediate: true })
watch([editor, saving], () => emit('busy', !!editor.value || saving.value))
onUnmounted(() => { request++; emit('busy', false) })
function begin(kind: 'facility' | 'zone') { editor.value = kind; draft.value = ''; error.value = '' }
function selectFacility(event: Event) {
  emit('update:facilityId', (event.target as HTMLSelectElement).value || undefined)
  emit('update:zoneId', undefined)
}
async function save() {
  if (saving.value || props.disabled) return
  saving.value = true; error.value = ''
  try {
    if (editor.value === 'facility') {
      const id = await addUserFacility(draft.value); emit('update:facilityId', id); emit('update:zoneId', undefined)
    } else if (editor.value === 'zone' && props.facilityId) {
      const id = await addUserZone(props.facilityId, draft.value, props.tripId); await reload(); emit('update:zoneId', id)
    }
    editor.value = undefined; draft.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { saving.value = false }
}
</script>

<template>
  <fieldset class="location-picker" :disabled="disabled || saving" :aria-busy="saving || loading">
    <legend>{{ fixed ? (zoneLabel ?? '現在のエリア') : '管理釣り場・エリア（任意）' }}</legend>
    <template v-if="!fixed">
      <label>施設を検索<input v-model="search" type="search" placeholder="施設名" /></label>
      <label>管理釣り場<select aria-label="管理釣り場" :value="facilityId ?? ''" :disabled="!!editor || loading" @change="selectFacility">
        <option value="">施設を指定しない／自由入力</option>
        <option v-for="item in choices" :key="item.id" :value="item.id">{{ item.name }}（{{ item.origin === 'official' ? '公式' : 'ユーザー登録' }}）</option>
      </select></label>
      <small v-if="!facilities.length">登録施設はまだありません。自由入力でも開始できます。</small>
      <button type="button" :disabled="!!editor" @click="begin('facility')">施設を追加</button>
    </template>
    <p v-else-if="facility">{{ facility.name }} <small>{{ facility.retired ? '退役済み・継続中' : facility.origin === 'official' ? '公式' : 'ユーザー登録' }}</small></p>
    <template v-if="facilityId || catchArea">
      <label>{{ zoneLabel ?? 'エリア（任意）' }}<select :aria-label="zoneLabel ?? 'エリア（任意）'" :value="zoneId ?? ''" :disabled="loading || !!error || !!editor" @change="emit('update:zoneId', ($event.target as HTMLSelectElement).value || undefined)">
        <option value="">エリア未指定</option>
        <option v-if="catchArea && retainedZoneId && !zones.some(z => z.id === retainedZoneId)" :value="retainedZoneId" disabled>{{ retainedZoneName || retainedZoneId }}（参照先不明・現在の値を保持）</option>
        <option v-for="item in zones" :key="item.id" :value="item.id">{{ item.name }}（{{ item.retired ? '退役済み・継続中' : item.origin === 'official' ? '公式' : 'ユーザー登録' }}）</option>
      </select></label>
      <p v-if="catchArea && !facilityId">釣行に施設IDがないためエリアを選択できません。既存の値は変更しない限り保持します。</p>
      <p v-else-if="catchArea && !zones.length && !loading">選択できるエリアが未登録です。未設定のまま編集できます。</p>
      <p v-if="catchArea && retainedZoneId && !zones.some(z => z.id === retainedZoneId) && !loading">既存エリアを解決できません。変更せず保存すると元の値を保持します。</p>
      <template v-if="catchArea && !retainedZoneId && retainedZoneName"><p>エリアIDのない旧名称「{{ retainedZoneName }}」を保持しています。変更は釣果の保存時に確定します。</p><button type="button" @click="emit('update:zoneId', undefined)">記録済みエリア名を未設定に戻す</button></template>
      <button v-if="facilityId" type="button" :disabled="loading || !!editor || !facility" @click="begin('zone')">この施設にエリアを追加</button>
    </template>
    <div v-if="editor" class="addition">
      <label>{{ editor === 'facility' ? '追加する施設名' : '追加するエリア名' }}<input v-model="draft" type="text" maxlength="200" @keydown.enter.prevent="save" /></label>
      <div class="actions"><button type="button" @click="save">{{ saving ? '登録中…' : '登録して選択' }}</button><button type="button" @click="editor = undefined; error = ''">追加をキャンセル</button></div>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.location-picker { min-width:0; width:100%; margin:16px 0; padding:12px; border:1px solid #d9dee3; border-radius:12px; background:#fff; color:#17212b; }
legend { font-weight:700; max-width:100%; overflow-wrap:anywhere; }
label { display:block; margin:10px 0; }
input, select { width:100%; min-width:0; max-width:100%; box-sizing:border-box; padding:12px; border:1px solid #d9dee3; border-radius:10px; background:#fff; color:#17212b; font:inherit; }
button { min-height:44px; margin:4px 4px 4px 0; padding:10px; border:1px solid #13795b; border-radius:10px; background:#eef8f4; color:#13795b; font:inherit; cursor:pointer; }
small { color:var(--text-muted); }
p { overflow-wrap:anywhere; }
.addition { margin-top:12px; border-top:1px solid #d9dee3; }
.actions { display:flex; flex-wrap:wrap; gap:4px; }
</style>
