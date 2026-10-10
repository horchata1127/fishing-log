<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { db, fishGroups, type FishSpecies } from '../db/database'
import { registerInitialFishSpecies, saveFishSpecies, setFishSpeciesActive } from '../utils/fishSpecies'
const emit = defineEmits<{ back: [] }>()
const rows = ref<FishSpecies[]>([])
const group = ref('')
const search = ref('')
const message = ref('')
const busy = ref(false)
const editingId = ref<string>()
const blank = (): FishSpecies => ({ fish_id: 'user:new', display_name: '', group: 'ブランドマス', aliases: '', region: '', lineage_or_type: '', source_status: 'ユーザー登録', notes: '', source_url: '', active: true, origin: 'user' })
const draft = ref(blank())
const fields = [{ key: 'aliases', label: '別名' }, { key: 'region', label: '地域' }, { key: 'lineage_or_type', label: '系統・由来' }, { key: 'source_status', label: '確認状態' }, { key: 'source_url', label: '出典URL' }] as const
const filtered = computed(() => rows.value.filter(row => (!group.value || row.group === group.value) &&
  [row.display_name, row.aliases, row.region].join(' ').toLocaleLowerCase('ja-JP').includes(search.value.trim().toLocaleLowerCase('ja-JP'))))
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await action(); rows.value = await db.fishSpecies.toArray() }
  catch (error) { message.value = error instanceof Error ? error.message : String(error) }
  finally { busy.value = false }
}
async function initial() { await run(async () => { const count = await registerInitialFishSpecies(); message.value = `初期魚種を${count}件追加しました。既存の編集・非表示は維持します。` }) }
async function save() { await run(async () => { await saveFishSpecies(draft.value, editingId.value); editingId.value = undefined; draft.value = blank(); message.value = '魚種を保存しました。' }) }
function edit(row: FishSpecies) { editingId.value = row.fish_id; draft.value = { ...row }; window.scrollTo({ top: 0, behavior: 'smooth' }) }
async function toggle(row: FishSpecies) { await run(async () => { await setFishSpeciesActive(row.fish_id, !row.active); message.value = '表示状態を変更しました。過去の釣果は変わりません。' }) }
onMounted(() => run(async () => {}))
</script>
<template>
  <section class="fish-management">
    <button type="button" :disabled="busy" @click="emit('back')">← 戻る</button>
    <h1>魚種マスター管理</h1>
    <button type="button" :disabled="busy" @click="initial">初期魚種37件を登録</button>
    <p class="hint">原本の確認状態を保持しています。現在の放流を保証する情報ではありません。非表示でも過去の釣果は保持されます。</p>
    <p v-if="message" role="status">{{ message }}</p>
    <form @submit.prevent="save" class="card" :inert="busy">
      <h2>{{ editingId ? '魚種を編集' : '魚種を追加' }}</h2>
      <label>表示名（必須）<input v-model="draft.display_name" required /></label>
      <label>表示分類<select v-model="draft.group"><option v-for="item in fishGroups" :key="item">{{ item }}</option></select></label>
      <label v-for="field in fields" :key="field.key">{{ field.label }}<input v-model="draft[field.key]" /></label>
      <label>備考<textarea v-model="draft.notes" rows="3" /></label>
      <label class="check"><input v-model="draft.active" type="checkbox" />表示する</label>
      <button type="submit">保存</button>
      <button v-if="editingId" type="button" @click="editingId = undefined; draft = blank()">編集をキャンセル</button>
    </form>
    <section class="card" aria-label="魚種一覧">
      <h2>魚種一覧（{{ rows.length }}件）</h2>
      <label>名称検索<input v-model="search" type="search" placeholder="名称・別名・地域" /></label>
      <label>分類で絞り込み<select v-model="group"><option value="">すべて</option><option v-for="item in fishGroups" :key="item">{{ item }}</option></select></label>
      <p>{{ filtered.length }}件表示</p>
      <article v-for="row in filtered" :key="row.fish_id">
        <strong>{{ row.display_name }}</strong>
        <p>{{ row.group }} / {{ row.region || '地域未記載' }} / {{ row.source_status || '確認状態未記載' }}</p>
        <p>{{ row.origin === 'reviewed' ? '原本由来' : 'ユーザー登録' }}{{ row.userEdited ? '・ユーザー編集あり' : '' }} / {{ row.active ? '表示中' : '非表示' }} / {{ row.fish_id }}</p>
        <p v-if="row.aliases">別名：{{ row.aliases }}</p><p v-if="row.lineage_or_type">系統・由来：{{ row.lineage_or_type }}</p>
        <p v-if="row.notes">{{ row.notes }}</p><p v-if="row.source_url">出典：{{ row.source_url }}</p>
        <button type="button" :disabled="busy" @click="edit(row)">編集</button>
        <button type="button" :disabled="busy" @click="toggle(row)">{{ row.active ? '非表示にする' : '表示を再開' }}</button>
      </article>
    </section>
  </section>
</template>
<style scoped>
.fish-management { min-width:0; }
.card { margin:16px 0; padding:18px; border:1px solid #e4e8ec; border-radius:16px; background:white; }
label { display:block; margin:12px 0; font-size:14px; }
input, select, textarea { display:block; width:100%; min-width:0; box-sizing:border-box; padding:12px; border:1px solid #d9dee3; border-radius:8px; font:inherit; font-size:16px; background:white; color:#17212b; }
.check { display:flex; align-items:center; gap:8px; }.check input { width:auto; }
button { min-height:44px; margin:4px; padding:10px; border:1px solid #cad5d0; border-radius:10px; background:#eef7f3; color:#13795b; cursor:pointer; }
article { padding:14px 0; border-top:1px solid #e4e8ec; overflow-wrap:anywhere; }
.hint, article p { font-size:13px; color:#69747e; }
</style>
