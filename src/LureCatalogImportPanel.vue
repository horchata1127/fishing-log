<script setup lang="ts">
import { ref } from 'vue'
import { db } from './db/database'
import { importLureCatalog } from './importLureCatalog'

const busy = ref(false)
const message = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, (_key, value) => value instanceof Date ? value.toISOString() : value, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

async function backup() {
  busy.value = true
  message.value = ''
  try {
    const tables = ['trips','catches','lureManufacturers','lureSeries','lureModels','lureVariants','myLures'] as const
    const data: Record<string, unknown[]> = {}
    for (const name of tables) data[name] = await db.table(name).toArray()
    downloadJson(`fishing-log-backup-before-rc7-${new Date().toISOString().slice(0,10)}.json`, {
      format: 'fishing-log-backup', version: 1, exportedAt: new Date().toISOString(), data,
    })
    message.value = 'バックアップを保存したら、iPhoneの「ファイル」で実体を確認してな。'
  } catch (error) { message.value = `バックアップ失敗: ${String(error)}` }
  finally { busy.value = false }
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  busy.value = true
  message.value = ''
  try {
    const seed = JSON.parse(await file.text())
    if (seed.format !== 'fishing-log-catalog-seed' || seed.version !== 1 || !['1.0-rc7', '1.0-rc18'].includes(seed.catalogVersion)) {
      throw new Error('RC7またはRC18の専用カタログJSONを選んでな。')
    }
    const result = await importLureCatalog(seed)
    message.value = `追加完了: メーカー${result.manufacturers}・シリーズ${result.series}・モデル${result.models}・カラー${result.variants}・所有ルアー${result.owned}件。既存項目は重複追加してへんで。画面を再表示して確認してな。`
  } catch (error) { message.value = `インポート失敗: ${String(error)}` }
  finally { busy.value = false; input.value = '' }
}
</script>

<template>
  <section class="catalog-import">
    <h2>ルアーマスタ RC18対応</h2>
    <p>先にバックアップを保存・確認してから、RC18の専用JSONを読み込んでな。</p>
    <button type="button" :disabled="busy" @click="backup">① 全データをバックアップ</button>
    <button type="button" :disabled="busy" @click="fileInput?.click()">② RC18 JSONを読み込む</button>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importFile" />
    <p v-if="message" role="status">{{ message }}</p>
    <p class="note">釣行・釣果は変更しません。所有ルアーは不足数のみ追加し、再インポートでも重複しません。</p>
  </section>
</template>

<style scoped>
.catalog-import { padding: 16px; border: 1px solid #d0d5dd; border-radius: 12px; margin: 16px 0; }
button { display: block; width: 100%; min-height: 44px; margin: 10px 0; border-radius: 8px; background: #155e75; color: white; border: 0; font-weight: 600; }
button:disabled { opacity: .55; }
.note { font-size: .85rem; color: #555; }
</style>
