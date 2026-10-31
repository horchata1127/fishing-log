<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { previewAutoColors, applyAutoColors, type AutoColorPreview } from '../utils/autoColorImport'
import VisualColorPreview from './VisualColorPreview.vue'
const emit = defineEmits<{ updated: [] }>()
const preview = shallowRef<AutoColorPreview>(), busy = ref(false), message = ref('')
async function check() {
  busy.value = true; message.value = ''; preview.value = undefined
  try { preview.value = await previewAutoColors() }
  catch (error) { message.value = error instanceof Error ? error.message : String(error) }
  finally { busy.value = false }
}
async function apply() {
  if (busy.value || !preview.value?.added) return
  busy.value = true; message.value = ''
  try {
    const result = await applyAutoColors(preview.value.comparisonToken)
    preview.value = undefined; emit('updated'); message.value = `推定配色を${result.added}件追加しました。既存配色・釣果・所有情報は保持しています。`
  } catch (error) { preview.value = undefined; message.value = error instanceof Error ? error.message : String(error) }
  finally { busy.value = false }
}
const labels = { add: '新規追加', keep: '既存保持', protected: '保護', hold: '保留', unknown: '推定不可' }
</script>

<template>
  <details class="auto-colors">
    <summary>推定配色を一括取り込み（管理）</summary>
    <p>名称から検索用の仮配色を推定します。写真解析は行いません。未確認の部位は共通配色として保存し、既存配色は上書きしません。</p>
    <button type="button" :disabled="busy" @click="check">推定件数を確認</button>
    <p role="status">{{ busy ? '確認・処理中…' : message }}</p>
    <section v-if="preview" aria-label="推定配色の事前確認">
      <p>対象 {{ preview.total }}件／名称ユニーク {{ preview.uniqueNames }}件／名称推定可能 {{ preview.namePossible }}件／写真推定 {{ preview.photoMatched }}件</p>
      <p>新規追加 {{ preview.added }}件・既存保持 {{ preview.kept }}件・保護 {{ preview.protected }}件・保留 {{ preview.held }}件・推定不可 {{ preview.unknown }}件</p>
      <details><summary>推定結果の例（先頭30件）</summary>
        <article v-for="row in preview.rows.slice(0, 30)" :key="row.variantId">
          <strong>{{ row.manufacturer }} / {{ row.model }} / {{ row.colorName }}</strong>
          <small>{{ labels[row.action] }}：{{ row.reason }}</small>
          <VisualColorPreview v-if="row.inference" :appearance="row.inference.appearance" />
          <small v-if="row.inference">名称推定・未確認／確信度目安 {{ Math.round(row.inference.confidence * 100) }}%／{{ row.inference.basis.join('、') }}</small>
        </article>
      </details>
      <button type="button" :disabled="busy || !preview.added" @click="apply">確認した推定配色を取り込む</button>
      <button type="button" :disabled="busy" @click="preview = undefined">推定取り込みをキャンセル</button>
    </section>
  </details>
</template>

<style scoped>
.auto-colors { border:1px solid #cbd8cf; padding:10px; margin:12px 0; border-radius:8px; }
button,summary { min-height:44px; font:inherit; cursor:pointer; }
button { background:white; color:#17212b; border:1px solid #9aafa3; border-radius:7px; margin:5px; padding:6px; }
small { display:block; }
article { margin:10px 0; }
</style>
