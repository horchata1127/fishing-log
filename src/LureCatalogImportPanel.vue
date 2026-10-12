<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { exportBackup } from './utils/backup'
import { catalogTables, importLureCatalog, previewLureCatalog, registerRc19HuntGrande, type CatalogPreview } from './importLureCatalog'
import { previewRc20Catalog, applyRc20Catalog, rc20DiffCsv, type Rc20Preview } from './utils/rc20Catalog'

const busy = ref(false)
const message = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const pendingSeed = shallowRef<unknown>(null)
const preview = shallowRef<CatalogPreview | null>(null)
const rc20Preview = shallowRef<Rc20Preview | null>(null)
// Read-only UI state for deferring application updates during import/preview.
defineExpose({ busy, preview: computed(() => preview.value ?? rc20Preview.value) })
const tableLabels = {
  lureManufacturers: 'メーカー', lureSeries: 'シリーズ',
  lureModels: 'モデル', lureVariants: 'カラー',
}

function cancelPreview() {
  pendingSeed.value = null
  preview.value = null
  rc20Preview.value = null
}

async function checkRc20() {
  if (busy.value) return
  cancelPreview()
  busy.value = true
  try {
    rc20Preview.value = await previewRc20Catalog()
    message.value = 'RC20の追加予定を確認しました。まだ反映していません。'
  } catch (error) { message.value = `RC20確認失敗: ${String(error)}` }
  finally { busy.value = false }
}

async function applyRc20() {
  const checked = rc20Preview.value
  if (busy.value || !checked || !checked.addedColors) return
  busy.value = true
  try {
    const result = await applyRc20Catalog(checked.comparisonToken)
    message.value = `RC20反映完了: ${result.addedColors}色追加・${result.retainedColors}色保持・${result.pendingColors}色保留。`
    cancelPreview()
  } catch (error) { message.value = `RC20反映失敗: ${String(error)}`; cancelPreview() }
  finally { busy.value = false }
}

function downloadRc20Diff() {
  if (!rc20Preview.value) return
  const url = URL.createObjectURL(new Blob([rc20DiffCsv(rc20Preview.value)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = 'RC20_CATALOG_DIFF_DEVICE.csv'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function addRc19() {
  if (busy.value || preview.value || rc20Preview.value) return
  busy.value = true
  try {
    message.value = `RC19対象カタログ: ${await registerRc19HuntGrande()}件追加しました。`
  } catch (error) { message.value = `RC19追加失敗: ${String(error)}` }
  finally { busy.value = false }
}

async function backup() {
  busy.value = true
  message.value = ''
  try {
    await exportBackup()
    message.value = 'バックアップを保存したら、iPhoneの「ファイル」で実体を確認してな。'
  } catch (error) { message.value = `バックアップ失敗: ${String(error)}` }
  finally { busy.value = false }
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  if (busy.value) { input.value = ''; return }
  const file = input.files?.[0]
  if (!file) return
  busy.value = true
  message.value = ''
  cancelPreview()
  try {
    const seed: unknown = JSON.parse(await file.text())
    preview.value = await previewLureCatalog(seed)
    pendingSeed.value = seed
    message.value = '事前確認のみ完了しました。まだデータは変更していません。'
  } catch (error) { message.value = `事前確認失敗: ${String(error)}` }
  finally { busy.value = false; input.value = '' }
}

async function applyCatalog() {
  const checked = preview.value
  if (busy.value || !checked || checked.errors.length || pendingSeed.value === null) return
  if (!confirm('確認したカタログの追加・更新を実行します。所有ルアーと釣果は変更しません。実行しますか？')) return
  busy.value = true
  try {
    const result = await importLureCatalog(pendingSeed.value, checked.comparisonToken)
    const added = catalogTables.reduce((sum, table) => sum + result.counts[table].added, 0)
    const updated = catalogTables.reduce((sum, table) => sum + result.counts[table].updated, 0)
    message.value = `カタログ反映完了: 追加${added}件・カテゴリ更新${updated}件。所有ルアーと釣果は変更していません。`
    cancelPreview()
  } catch (error) {
    message.value = `取り込み失敗: ${String(error)} ファイルを選び直して確認してください。`
    cancelPreview()
  } finally { busy.value = false }
}
</script>

<template>
  <section class="catalog-import">
    <h2>ルアーマスター RC20対応</h2>
    <p>先にバックアップを保存・確認してから、RC18の専用JSONを読み込んでな。</p>
    <button type="button" :disabled="busy" @click="backup">① 全データをバックアップ</button>
    <button type="button" :disabled="busy" @click="fileInput?.click()">② カタログJSONを事前確認</button>
    <p>RC19確認済み：HUNT GRANDE 1.3g / T-15 シルバー・T-18 黄茶次郎</p>
    <button type="button" :disabled="busy || !!preview || !!rc20Preview" @click="addRc19">RC19のHUNT GRANDE 1.3g・2色を追加</button>
    <p>RC20：HUNT GRANDE 1.3gの30色と、4メーカーの公式確認済みカラーを補完します。</p>
    <button type="button" :disabled="busy" @click="checkRc20">RC20の追加予定を確認</button>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importFile" />
    <p v-if="message" role="status">{{ message }}</p>
    <p class="note">所有ルアーは追加・変更されません。釣行・釣果も変更しません。</p>
    <section v-if="rc20Preview" class="preview" aria-label="RC20カタログの事前確認">
      <h3>RC20の追加予定</h3>
      <p>追加 {{ rc20Preview.addedColors }}色・登録済み {{ rc20Preview.retainedColors }}色・保留 {{ rc20Preview.pendingColors }}色</p>
      <p>新しいモデル {{ rc20Preview.addedModels }}件・シリーズ {{ rc20Preview.addedSeries }}件</p>
      <p class="note">既存カラーを保持して不足分だけ追加します。HUNT GRANDE以外の未収録モデルは、別途確認するため保留します。</p>
      <details><summary>カラーごとの照合結果・公式出典</summary>
        <ul><li v-for="(row, index) in rc20Preview.rows" :key="index">
          {{ row.manufacturer }} / {{ row.model }} / {{ row.color_name }}：
          {{ row.action === 'keep' ? '登録済み' : row.action === 'add_color' ? '追加' : '保留（メーカーまたはモデル未登録）' }}
          <span v-if="row.existing_id">（ID {{ row.existing_id }}）</span>
          <a :href="row.source_url" target="_blank" rel="noopener noreferrer">公式出典</a>
        </li></ul>
      </details>
      <button type="button" :disabled="busy" @click="downloadRc20Diff">照合結果をCSVで保存</button>
      <button type="button" :disabled="busy || !rc20Preview.addedColors" @click="applyRc20">RC20の確認済みカラーを追加</button>
      <button type="button" :disabled="busy" @click="cancelPreview">RC20の追加をキャンセル</button>
    </section>
    <section v-if="preview" class="preview" aria-label="カタログ取り込みの事前確認">
      <h3>取り込み予定</h3>
      <table>
        <thead><tr><th>対象</th><th>追加</th><th>更新</th><th>変更なし</th></tr></thead>
        <tbody><tr v-for="table in catalogTables" :key="table">
          <th>{{ tableLabels[table] }}</th><td>{{ preview.counts[table].added }}</td>
          <td>{{ preview.counts[table].updated }}</td><td>{{ preview.counts[table].unchanged }}</td>
        </tr></tbody>
      </table>
      <p class="note">既存モデルの更新対象はカテゴリのみです。名前・ID・寸法は上書きしません。</p>
      <p v-if="preview.ignoredOwnership">所有情報が含まれています{{ preview.ignoredOwnershipRows === null ? '' : `（${preview.ignoredOwnershipRows}行）` }}。すべて無視します。</p>
      <details v-if="preview.duplicates.length" open>
        <summary>完全一致の重複 {{ preview.duplicates.length }}件</summary>
        <ul><li v-for="item in preview.duplicates" :key="item">{{ item }}</li></ul>
      </details>
      <details v-if="preview.collisions.length" open>
        <summary>正規化衝突 {{ preview.collisions.length }}件（別表記を保持）</summary>
        <ul><li v-for="item in preview.collisions" :key="item">{{ item }}</li></ul>
      </details>
      <details v-if="preview.errors.length" open>
        <summary>取り込み不可 {{ preview.errors.length }}件</summary>
        <ul><li v-for="item in preview.errors" :key="item">{{ item }}</li></ul>
      </details>
      <button type="button" :disabled="busy || preview.errors.length > 0" @click="applyCatalog">③ 確認したカタログを反映</button>
      <button type="button" :disabled="busy" @click="cancelPreview">取り込みをキャンセル</button>
    </section>
  </section>
</template>

<style scoped>
.catalog-import { padding: 16px; border: 1px solid #d0d5dd; border-radius: 12px; margin: 16px 0; }
button { display: block; width: 100%; min-height: 44px; margin: 10px 0; border-radius: 8px; background: #155e75; color: white; border: 0; font-weight: 600; }
button:disabled { opacity: .55; }
.note { font-size: .85rem; color: #555; }
table { width:100%; border-collapse:collapse; font-size:.85rem; }
th, td { padding:6px; border-bottom:1px solid #d0d5dd; text-align:left; }
details { margin:12px 0; overflow-wrap:anywhere; }
ul { padding-left:20px; max-height:240px; overflow:auto; }
</style>
