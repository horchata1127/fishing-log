<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { lineMaterials, type TackleTable } from '../db/database'
import { loadTackleData, saveTackle, setTackleActive, registerInitialTackles } from '../utils/tackleManagement'

const emit = defineEmits<{ back: [] }>()
const tab = ref<TackleTable>('rods')
const data = ref<Awaited<ReturnType<typeof loadTackleData>>>({ rods: [], reels: [], lines: [], tackleSets: [] })
const editingId = ref<number | undefined>()
const draft = ref<Record<string, string>>({ material: 'ナイロン' })
const active = ref(true)
const busy = ref(false)
const message = ref('')
const labels = { rods: 'ロッド', reels: 'リール', lines: 'ライン', tackleSets: 'セット' }
type Field = { key: string; label: string; number?: boolean; options?: 'rods' | 'reels' | 'lines' | 'materials'; required?: boolean }
const fields = computed<Field[]>(() => {
  switch (tab.value) {
    case 'rods': return [
      { key: 'manufacturer', label: 'メーカー', required: true }, { key: 'modelName', label: 'モデル名', required: true },
      { key: 'modelCode', label: '型番' }, { key: 'length', label: '長さ' }, { key: 'power', label: '硬さ' },
    ]
    case 'reels': return [
      { key: 'manufacturer', label: 'メーカー', required: true }, { key: 'modelName', label: 'モデル名', required: true },
      { key: 'size', label: '番手' }, { key: 'year', label: '年式', number: true }, { key: 'gearRatio', label: 'ギア比' },
      { key: 'mainLineId', label: '現在のメインライン', options: 'lines' },
    ]
    case 'lines': return [
      { key: 'manufacturer', label: 'メーカー' }, { key: 'productName', label: '製品名' },
      { key: 'material', label: '素材', options: 'materials', required: true },
      { key: 'strengthLb', label: '強度（lb）', number: true }, { key: 'sizeGo', label: '号数', number: true },
    ]
    case 'tackleSets': return [
      { key: 'name', label: 'セット名', required: true },
      { key: 'rodId', label: 'ロッド', options: 'rods', required: true },
      { key: 'reelId', label: 'リール', options: 'reels', required: true },
      { key: 'leaderLineId', label: 'リーダー', options: 'lines' },
    ]
  }
})

function rowLabel(row: Record<string, unknown>) {
  if (row.name) return String(row.name)
  return [row.manufacturer, row.modelName, row.modelCode, row.size, row.year, row.gearRatio, row.productName, row.material,
    row.strengthLb === undefined ? '' : `${row.strengthLb}lb`, row.sizeGo === undefined ? '' : `${row.sizeGo}号`].filter(Boolean).join(' / ')
}
const rows = computed(() => data.value[tab.value] as unknown as Record<string, unknown>[])
function lineLabel(id: unknown) {
  const line = data.value.lines.find(item => item.id === id)
  return line ? rowLabel(line as unknown as Record<string, unknown>) : '未指定'
}
const selectedReel = computed(() => data.value.reels.find(row => row.id === Number(draft.value.reelId)))
function options(field: Field) {
  if (!field.options || field.options === 'materials') return []
  return data.value[field.options].map(row => ({ id: row.id!, active: row.active, label: rowLabel(row as unknown as Record<string, unknown>) }))
}
function reset() {
  editingId.value = undefined
  draft.value = { material: 'ナイロン' }
  active.value = true
}
function changeTab(next: TackleTable) { tab.value = next; reset(); message.value = '' }
function edit(row: Record<string, unknown>) {
  editingId.value = row.id as number
  draft.value = Object.fromEntries(Object.entries(row).filter(([key, value]) => !['id', 'active', 'initialKey'].includes(key) && value !== undefined && value !== null).map(([key, value]) => [key, String(value)]))
  active.value = row.active === true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await action(); data.value = await loadTackleData() }
  catch (error) { message.value = error instanceof Error ? error.message : String(error) }
  finally { busy.value = false }
}
async function save() {
  await run(async () => {
    const row: Record<string, unknown> = { active: active.value }
    for (const field of [...fields.value, { key: 'memo', label: 'メモ' }]) {
      const value = draft.value[field.key]?.trim()
      if (!value) continue
      row[field.key] = field.number || (field.options && field.options !== 'materials') ? Number(value) : value
    }
    await saveTackle(tab.value, row, editingId.value)
    reset()
    message.value = '保存しました。'
  })
}
async function initial() {
  await run(async () => { const added = await registerInitialTackles(); message.value = `初期候補を${added}件追加しました。セットの組み合わせは選んで登録してください。` })
}
async function toggle(row: Record<string, unknown>) {
  await run(async () => { await setTackleActive(tab.value, row.id as number, !row.active); message.value = '使用状態を変更しました。過去の釣果は変わりません。' })
}
onMounted(async () => { await run(async () => {}) })
</script>

<template>
  <div class="tackle-management">
    <button type="button" :disabled="busy" @click="emit('back')">← 戻る</button>
    <h1>タックル管理</h1>
    <button type="button" :disabled="busy" @click="initial">初期候補8件を登録</button>
    <p class="hint">ロッド・リール・ラインを登録してから、セットを組み合わせます。リーダーなし・メインライン未指定も選べます。</p>
    <nav aria-label="タックルの種類">
      <button v-for="(label, key) in labels" :key="key" type="button" :disabled="busy" :aria-pressed="tab === key" @click="changeTab(key)">{{ label }}</button>
    </nav>
    <p v-if="message" role="status">{{ message }}</p>
    <form class="card" @submit.prevent="save">
      <h2>{{ labels[tab] }}{{ editingId ? 'を編集' : 'を登録' }}</h2>
      <label v-for="field in fields" :key="field.key">
        <span>{{ field.label }}{{ field.required ? '（必須）' : '（任意）' }}</span>
        <select v-if="field.options" v-model="draft[field.key]" :required="field.required" :disabled="busy">
          <template v-if="field.options === 'materials'"><option v-for="material in lineMaterials" :key="material" :value="material">{{ material }}</option></template>
          <template v-else>
            <option value="">{{ field.required ? '選択してください' : field.key === 'leaderLineId' ? 'リーダーなし' : '未指定' }}</option>
            <option v-for="option in options(field)" :key="option.id" :value="String(option.id)" :disabled="!option.active && draft[field.key] !== String(option.id)">
              {{ option.label }}{{ option.active ? '' : '（使用停止）' }}
            </option>
          </template>
        </select>
        <input v-else v-model="draft[field.key]" :type="field.number ? 'number' : 'text'" :step="field.key === 'year' ? '1' : 'any'" :required="field.required" :disabled="busy" />
      </label>
      <p v-if="tab === 'tackleSets'" class="hint">メインライン：{{ lineLabel(selectedReel?.mainLineId) }}（リールの現在のラインを使用）</p>
      <label><span>メモ（任意）</span><textarea v-model="draft.memo" :disabled="busy" rows="3" /></label>
      <label class="check"><input v-model="active" type="checkbox" :disabled="busy" />使用中</label>
      <button type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
      <button v-if="editingId" type="button" :disabled="busy" @click="reset">編集をキャンセル</button>
    </form>
    <section class="card">
      <h2>{{ labels[tab] }}一覧（{{ rows.length }}件）</h2>
      <p v-if="!rows.length">まだ登録されていません。</p>
      <article v-for="row in rows" :key="String(row.id)">
        <strong>{{ rowLabel(row) }}</strong><span>{{ row.active ? '使用中' : '使用停止' }}</span>
        <p v-if="row.memo">{{ row.memo }}</p>
        <p v-if="tab === 'reels'" class="hint">現在のメインライン：{{ lineLabel(row.mainLineId) }}</p>
        <p v-if="tab === 'tackleSets'" class="hint">ロッド：{{ data.rods.find(item => item.id === row.rodId)?.modelName }} / リール：{{ data.reels.find(item => item.id === row.reelId)?.modelName }}</p>
        <button type="button" :disabled="busy" @click="edit(row)">編集</button>
        <button type="button" :disabled="busy" @click="toggle(row)">{{ row.active ? '使用停止' : '使用再開' }}</button>
      </article>
    </section>
  </div>
</template>

<style scoped>
.tackle-management { min-width:0; }
nav { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin:16px 0; }
button { min-height:44px; padding:10px; border:1px solid #cad5d0; border-radius:10px; background:#eef7f3; color:#13795b; cursor:pointer; margin:4px 4px 4px 0; }
button[aria-pressed=true] { background:#13795b; color:white; }
button:disabled { opacity:.5; cursor:default; }
.card { background:white; padding:18px; border:1px solid #e4e8ec; border-radius:16px; margin:16px 0; }
label { display:block; margin:14px 0; }
label span { display:block; margin-bottom:6px; font-size:14px; }
input, select, textarea { box-sizing:border-box; width:100%; min-width:0; padding:12px; border:1px solid #cad5d0; border-radius:8px; font:inherit; background:white; color:#17212b; }
.check { display:flex; align-items:center; gap:8px; }
.check input { width:auto; }
article { border-top:1px solid #e4e8ec; padding:14px 0; overflow-wrap:anywhere; }
article > span { display:block; font-size:12px; color:#69747e; }
.hint { font-size:13px; color:#69747e; }
</style>
