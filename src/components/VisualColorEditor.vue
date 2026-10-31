<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { visualPalette, visualAttributes, visualPatterns, type VisualAppearance, type VisualColorSnapshot, type VisualColorId, type VisualAttributeId, type VisualPattern, type VisualRegion } from '../db/database'
import { createVisualSnapshot } from '../utils/visualColorStorage'
import VisualColorPreview from './VisualColorPreview.vue'

const props = defineProps<{ modelValue?: VisualColorSnapshot; category?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: VisualColorSnapshot | null] }>()
const layoutFor = (category?: string) => category === 'スプーン' ? 'spoon' : category === 'ミノー' || category === 'クランク' ? 'body' : 'generic'
const layout = computed(() => props.modelValue?.appearance.layout ?? layoutFor(props.category))
const active = ref(''), message = ref('')
const parts = computed(() => layout.value === 'spoon' ? [['front', '表'], ['back', '裏']] : layout.value === 'body' ? [['dorsal', '背'], ['side', '側'], ['belly', '腹']] : [['whole', '共通']])
watch(parts, value => { active.value = value[0]![0]!; message.value = '' }, { immediate: true })
const region = computed(() => (props.modelValue?.appearance.regions as Record<string, VisualRegion> | undefined)?.[active.value])
const colorSummary = computed(() => region.value?.colors.map(id => visualPalette.find(c => c[0] === id)?.[1]).join('・') || '色未指定')
const groups = [
  { name: '白・黒・淡色', colors: visualPalette.slice(0, 8) }, { name: '金・銀', colors: visualPalette.slice(8, 12) },
  { name: '黄・緑', colors: visualPalette.slice(12, 24) }, { name: '青・紫', colors: visualPalette.slice(24, 33) },
  { name: '桃・橙・赤', colors: visualPalette.slice(33, 44) }, { name: '茶', colors: visualPalette.slice(44) },
]
function update(next?: VisualRegion) {
  const appearance = props.modelValue ? JSON.parse(JSON.stringify(props.modelValue.appearance)) as VisualAppearance : { version: 1, paletteVersion: 1, layout: layout.value, regions: {} } as VisualAppearance
  const regions = appearance.regions as Record<string, VisualRegion>
  if (next) regions[active.value] = next
  else delete regions[active.value]
  emit('update:modelValue', Object.keys(regions).length ? createVisualSnapshot(appearance, { origin: 'user', confirmed: true }) : null)
}
function toggleColor(id: VisualColorId) {
  const next = region.value ? JSON.parse(JSON.stringify(region.value)) as VisualRegion : { colors: [], attributes: [] }
  const index = next.colors.indexOf(id)
  if (index >= 0) next.colors.splice(index, 1)
  else if (next.colors.length >= 3) { message.value = '色は部位ごとに最大3色です。選択済みの色を外してください。'; return }
  else next.colors.push(id)
  message.value = ''
  update(next.colors.length || next.attributes.length || next.pattern ? next : undefined)
}
function toggleAttribute(id: VisualAttributeId) {
  const next = region.value ? JSON.parse(JSON.stringify(region.value)) as VisualRegion : { colors: [], attributes: [] }
  const index = next.attributes.indexOf(id)
  if (index >= 0) next.attributes.splice(index, 1)
  else next.attributes.push(id)
  update(next.colors.length || next.attributes.length || next.pattern ? next : undefined)
}
function pattern(value: string) {
  const next = region.value ? JSON.parse(JSON.stringify(region.value)) as VisualRegion : { colors: [], attributes: [] }
  if (value) next.pattern = value as VisualPattern
  else delete next.pattern
  update(next.colors.length || next.attributes.length || next.pattern ? next : undefined)
}
</script>

<template>
  <section class="color-editor" aria-label="ビジュアルカラー入力">
    <strong>色で記録（任意）</strong>
    <small>公式カラーが不明でも、この配色で保存できます。</small>
    <VisualColorPreview :appearance="modelValue?.appearance ?? { version: 1, paletteVersion: 1, layout, regions: {} }" :color-values="modelValue?.colorValues" />
    <div class="part-tabs" aria-label="配色する部位">
      <button v-for="[key, label] in parts" :key="key" type="button" :aria-pressed="active === key" @click="active = key!; message = ''">{{ label }}</button>
    </div>
    <p class="color-summary">{{ parts.find(p => p[0] === active)?.[1] }}：{{ colorSummary }}（最大3色）</p>
    <div v-for="group in groups" :key="group.name" class="palette-group">
      <span>{{ group.name }}</span>
      <div class="swatches">
        <button v-for="[id, label, hex] in group.colors" :key="id" type="button" :aria-label="label" :aria-pressed="region?.colors.includes(id) ?? false" :style="{ '--swatch': hex }" @click="toggleColor(id)"><span class="color-chip">{{ region?.colors.includes(id) ? '✓' : '' }}</span><small>{{ label }}</small></button>
      </div>
    </div>
    <p role="status" class="color-message">{{ message }}</p>
    <details>
      <summary>模様・特殊属性・部位設定</summary>
      <label>部位構成<select aria-label="部位構成" :value="layout" @change="emit('update:modelValue', createVisualSnapshot({ version: 1, paletteVersion: 1, layout: ($event.target as HTMLSelectElement).value as VisualAppearance['layout'], regions: {} } as VisualAppearance, { origin: 'user', confirmed: true }))"><option value="spoon">スプーン（表・裏）</option><option value="body">ミノー・クランク（背・側・腹）</option><option value="generic">その他（共通）</option></select></label>
      <small>部位構成を変更すると、入力中の配色をクリアします。</small>
      <label>模様<select aria-label="模様" :value="region?.pattern ?? ''" @change="pattern(($event.target as HTMLSelectElement).value)"><option value="">未指定</option><option v-for="[id, label] in visualPatterns" :key="id" :value="id">{{ label }}</option></select></label>
      <fieldset><legend>特殊属性（複数選択）</legend><div class="attribute-grid"><button v-for="[id, label] in visualAttributes" :key="id" type="button" :aria-pressed="region?.attributes.includes(id) ?? false" @click="toggleAttribute(id)">{{ label }}</button></div></fieldset>
      <button type="button" @click="update()">この部位を未指定にする</button>
      <button type="button" @click="emit('update:modelValue', null)">配色をすべてクリア</button>
    </details>
  </section>
</template>

<style scoped>
.color-editor { margin:18px 0; border:1px solid #c9d9d0; padding:12px; border-radius:12px; color:#17212b; background:#f8fbf9; }
small { display:block; font-size:11px; margin:4px 0; }
.part-tabs,.attribute-grid { display:flex; flex-wrap:wrap; gap:6px; }
button,select,summary { min-height:44px; font:inherit; cursor:pointer; }
button { border:1px solid #9aafa3; border-radius:8px; background:#fff; color:#17212b; padding:6px 10px; }
button[aria-pressed="true"] { outline:2px solid #13795b; background:#e1f3e9; font-weight:700; }
.color-summary { font-size:12px; }
.palette-group > span { font-size:12px; font-weight:700; }
.swatches { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; margin:5px 0 10px; }
.swatches button { min-width:0; padding:4px 2px; }
.swatches small { font-size:10px; overflow-wrap:anywhere; }
.color-chip { display:block; height:22px; background:var(--swatch); border:1px solid #86998d; border-radius:5px; color:#111; text-shadow:0 0 2px #fff,0 0 3px #fff; }
label { display:block; margin:10px 0; }
select { display:block; width:100%; border:1px solid #9aafa3; background:white; color:#17212b; border-radius:8px; }
fieldset { border:0; padding:0; margin:14px 0; }
.color-message { min-height:1em; font-size:12px; color:#963900; }
details > button { margin:8px 5px 0 0; }
</style>
