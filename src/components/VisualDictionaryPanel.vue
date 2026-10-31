<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { db, visualPalette, type CatchRecord, type TemporaryLureColor, type VisualColorId, type VisualColorSnapshot } from '../db/database'
import type { LureOption } from '../utils/catchRegistration'
import { saveRepresentative, linkCatchAppearance, linkTemporaryAppearance } from '../utils/visualColorStorage'
import VisualColorEditor from './VisualColorEditor.vue'
import VisualColorPreview from './VisualColorPreview.vue'

const props = defineProps<{ catalog: LureOption[]; owned: LureOption[]; sourceCatch?: CatchRecord; selectEnabled?: boolean }>()
const emit = defineEmits<{ close: []; updated: []; select: [option: LureOption] }>()
const manufacturer = ref(''), model = ref(''), keyword = ref(''), onlyOwned = ref(false)
const colors = ref<VisualColorId[]>([]), limit = ref(50)
const editing = ref<LureOption>(), draft = ref<VisualColorSnapshot | null>(null), busy = ref(false), message = ref('')
const temporary = ref<TemporaryLureColor[]>([]), sourceTemporary = ref<TemporaryLureColor>()
onMounted(async () => {
  try { temporary.value = (await db.temporaryLureColors.toArray()).filter(t => t.linkedVariantId === undefined) }
  catch (error) { message.value = error instanceof Error ? error.message : String(error) }
})
const manufacturers = computed(() => [...new Set(props.catalog.map(c => c.manufacturerName))].sort())
const models = computed(() => [...new Map(props.catalog.filter(c => !manufacturer.value || c.manufacturerName === manufacturer.value).map(c => [c.modelId, c])).values()])
const candidates = computed(() => {
  const owned = new Set(props.owned.map(c => c.variantId))
  const search = keyword.value.normalize('NFKC').trim().toLowerCase()
  return props.catalog.filter(c => (!manufacturer.value || c.manufacturerName === manufacturer.value) && (!model.value || c.modelId === Number(model.value)) &&
    (!onlyOwned.value || owned.has(c.variantId)) && (!search || [c.manufacturerName, c.modelName, c.colorName].join(' ').normalize('NFKC').toLowerCase().includes(search)) &&
    colors.value.every(id => c.visualColorSnapshot && Object.values(c.visualColorSnapshot.appearance.regions).some(r => r?.colors.includes(id))))
})
function toggle(id: VisualColorId) { colors.value = colors.value.includes(id) ? colors.value.filter(c => c !== id) : [...colors.value, id]; limit.value = 50 }
function edit(option: LureOption) {
  editing.value = JSON.parse(JSON.stringify(option))
  draft.value = option.visualColorSnapshot ? JSON.parse(JSON.stringify(option.visualColorSnapshot)) : null
  message.value = ''
}
async function save() {
  if (busy.value || !editing.value?.identity || !draft.value) return
  busy.value = true; message.value = ''
  try {
    const row = editing.value
    await saveRepresentative(row.variantId, JSON.parse(JSON.stringify(row.identity)), JSON.parse(JSON.stringify(draft.value.appearance)), row.visualProfile ? { id: row.visualProfile.id, revision: row.visualProfile.revision } : undefined)
    editing.value = undefined; emit('updated'); message.value = '代表配色を保存しました。過去の釣果配色は変更していません。'
  } catch (error) { message.value = error instanceof Error ? error.message : String(error) }
  finally { busy.value = false }
}
async function link(row: LureOption) {
  if (busy.value || (!props.sourceCatch && !sourceTemporary.value) || !row.identity) return
  busy.value = true; message.value = ''
  try {
    if (sourceTemporary.value) await linkTemporaryAppearance(JSON.parse(JSON.stringify(sourceTemporary.value)), row.variantId, JSON.parse(JSON.stringify(row.identity)))
    else await linkCatchAppearance(JSON.parse(JSON.stringify(props.sourceCatch)), row.variantId, JSON.parse(JSON.stringify(row.identity)))
    emit('updated'); emit('close')
  } catch (error) { message.value = error instanceof Error ? error.message : String(error) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="dictionary-backdrop">
    <section class="dictionary" role="dialog" aria-label="ビジュアルカラー辞書" aria-modal="true" :aria-busy="busy">
      <h2>{{ sourceCatch || sourceTemporary ? '仮配色を公式カラーへ紐付け' : '色から公式カラーを探す' }}</h2>
      <p v-if="sourceCatch">保存済みの配色と所有情報を保持して、選んだ公式カラーに紐付けます。</p>
      <VisualColorPreview v-if="sourceCatch?.visualColorSnapshot" :appearance="sourceCatch.visualColorSnapshot.appearance" :color-values="sourceCatch.visualColorSnapshot.colorValues" />
      <template v-if="sourceTemporary"><strong>{{ sourceTemporary.name || '保存済み仮カラー' }}</strong><VisualColorPreview :appearance="sourceTemporary.appearance" /><button type="button" :disabled="busy" @click="sourceTemporary = undefined">仮カラーの選択を解除</button></template>
      <p role="status">{{ message }}</p>
      <fieldset :disabled="busy">
        <template v-if="editing">
          <h3>{{ editing.modelName }} / {{ editing.colorName }}</h3>
          <p>代表配色は1件です。保存するとこの代表を更新します。釣果別の配色は残ります。</p>
          <VisualColorEditor :model-value="draft ?? undefined" :category="editing.category" @update:model-value="draft = $event" />
          <button type="button" :disabled="!draft" @click="save">代表配色を保存</button>
          <button type="button" @click="editing = undefined">配色編集をキャンセル</button>
        </template>
        <template v-else>
          <details v-if="!sourceCatch && !sourceTemporary && temporary.length"><summary>保存済みの未紐付け仮カラー（{{ temporary.length }}件）</summary>
            <article v-for="entry in temporary" :key="entry.id"><strong>{{ entry.name || '仮カラー' }}</strong><VisualColorPreview :appearance="entry.appearance" /><button type="button" @click="sourceTemporary = JSON.parse(JSON.stringify(entry))">この仮カラーの紐付け先を選ぶ</button></article>
          </details>
          <details><summary>色から検索（{{ colors.length }}色）</summary><p>選んだ色をすべて含む代表配色を検索します。未登録の配色は推測しません。</p>
            <div class="color-search"><button v-for="[id, label, hex] in visualPalette" :key="id" type="button" :aria-pressed="colors.includes(id)" @click="toggle(id)"><span :style="{ background: hex }" />{{ label }}</button></div>
            <button type="button" @click="colors = []">検索色をクリア</button>
          </details>
          <label>メーカー<select v-model="manufacturer" aria-label="辞書メーカー" @change="model = ''; limit = 50"><option value="">すべて</option><option v-for="name in manufacturers" :key="name">{{ name }}</option></select></label>
          <label>モデル<select v-model="model" aria-label="辞書モデル" @change="limit = 50"><option value="">すべて</option><option v-for="row in models" :key="row.modelId" :value="String(row.modelId)">{{ row.modelName }}</option></select></label>
          <label class="owned"><input v-model="onlyOwned" type="checkbox" />所有ルアーのみ</label>
          <label>名前で絞り込む<input v-model="keyword" type="search" aria-label="辞書検索" @input="limit = 50" /></label>
          <p>{{ candidates.length }}件の候補</p>
          <article v-for="row in candidates.slice(0, limit)" :key="row.variantId" :data-variant-id="row.variantId">
            <strong>{{ row.modelName }} / {{ row.colorName }}</strong><small>{{ row.manufacturerName }}</small>
            <VisualColorPreview v-if="row.visualColorSnapshot" :appearance="row.visualColorSnapshot.appearance" :color-values="row.visualColorSnapshot.colorValues" /><small v-else>代表配色は未登録</small>
            <button type="button" @click="edit(row)">代表配色を編集</button>
            <button v-if="sourceCatch || sourceTemporary" type="button" @click="link(row)">この仮配色を紐付け</button>
            <button v-else-if="selectEnabled" type="button" @click="emit('select', row)">この公式カラーを選ぶ</button>
          </article>
          <p v-if="!candidates.length">該当する候補がありません。検索色や絞り込みを変更してください。</p>
          <button v-if="candidates.length > limit" type="button" @click="limit += 50">さらに50件表示</button>
        </template>
        <button type="button" @click="emit('close')">辞書を閉じる</button>
      </fieldset>
    </section>
  </div>
</template>

<style scoped>
.dictionary-backdrop { position:fixed; inset:0; z-index:300; background:#0007; display:grid; place-items:center; padding:12px; }
.dictionary { background:white; color:#17212b; padding:18px; border-radius:16px; width:min(100%,520px); max-height:90dvh; overflow:auto; }
fieldset { border:0; padding:0; min-width:0; }
button,select,input { min-height:44px; font:inherit; border:1px solid #adbbb1; border-radius:7px; background:white; color:#17212b; }
button { padding:6px 10px; margin:4px; cursor:pointer; }
label,small { display:block; margin:7px 0; }
select,input[type="search"] { width:100%; }
.owned { display:flex; align-items:center; gap:8px; }
article { border:1px solid #cbd8cf; padding:10px; margin:10px 0; border-radius:10px; }
.color-search { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }
.color-search button { font-size:11px; }
.color-search span { display:block; height:18px; border:1px solid #9aaa9e; }
button[aria-pressed="true"] { outline:2px solid #13795b; background:#e1f3e9; }
summary { min-height:44px; cursor:pointer; }
</style>
