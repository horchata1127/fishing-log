<script setup lang="ts">
import { computed, useId } from 'vue'
import { visualPalette, type VisualAppearance, type VisualColorSnapshot, type VisualRegion } from '../db/database'
const props = defineProps<{ appearance?: VisualAppearance; colorValues?: VisualColorSnapshot['colorValues'] }>()
const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
const palette = new Map(visualPalette.map(c => [c[0], c[2]]))
const parts = computed(() => {
  const layout = props.appearance?.layout ?? 'generic'
  const names = layout === 'spoon' ? [['front', '表'], ['back', '裏']] : layout === 'body' ? [['dorsal', '背'], ['side', '側'], ['belly', '腹']] : [['whole', '共通']]
  return names.map(([key, label], i) => {
    const region = (props.appearance?.regions as Record<string, VisualRegion> | undefined)?.[key!]
    const colors = region?.colors.map(id => props.colorValues?.[id] ?? palette.get(id)!) ?? []
    return { key, label, colors, attributes: region?.attributes ?? [], pattern: region?.pattern ?? (colors.length > 1 ? 'two-tone' : 'single'),
      x: layout === 'spoon' ? 10 + i * 105 : 10, y: layout === 'body' ? 5 + i * 22 : 8,
      width: layout === 'spoon' ? 95 : 200, height: layout === 'body' ? 20 : 48, id: `${uid}-${key}` }
  })
})
</script>

<template>
  <svg viewBox="0 0 220 80" role="img" aria-label="配色プレビュー" class="visual-preview">
    <defs>
      <pattern :id="`${uid}-unknown`" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff" /><path d="M0 8L8 0" stroke="#cbd5d1" /></pattern>
      <template v-for="part in parts" :key="part.id">
        <linearGradient :id="`${part.id}-gradient`">
          <stop v-for="(color, i) in part.colors" :key="i" :offset="part.colors.length === 1 ? 0 : i / (part.colors.length - 1)" :stop-color="color" />
        </linearGradient>
        <linearGradient :id="`${part.id}-two-tone`">
          <template v-for="(color, i) in part.colors" :key="i"><stop :offset="i / part.colors.length" :stop-color="color" /><stop :offset="(i + 1) / part.colors.length" :stop-color="color" /></template>
        </linearGradient>
        <pattern :id="`${part.id}-spots`" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" :fill="part.colors[0]" /><circle cx="5" cy="5" r="3" :fill="part.colors[1] ?? part.colors[0]" /><circle cx="14" cy="14" r="2" :fill="part.colors[2] ?? part.colors[1] ?? part.colors[0]" /></pattern>
        <pattern :id="`${part.id}-marble`" width="35" height="25" patternUnits="userSpaceOnUse"><rect width="35" height="25" :fill="part.colors[0]" /><path d="M-5 5Q15 25 40 5M-5 18Q15 -2 40 18" fill="none" :stroke="part.colors[1] ?? part.colors[0]" stroke-width="7" /><path d="M-5 12Q15 32 40 12" fill="none" :stroke="part.colors[2] ?? part.colors[1] ?? part.colors[0]" stroke-width="3" /></pattern>
      </template>
    </defs>
    <g v-for="part in parts" :key="part.id" :data-region="part.key" :data-pattern="part.pattern">
      <rect :x="part.x" :y="part.y" :width="part.width" :height="part.height" :rx="appearance?.layout === 'body' ? 9 : 24"
        :fill="!part.colors.length ? `url(#${uid}-unknown)` : part.pattern === 'single' ? part.colors[0] : `url(#${part.id}-${part.pattern})`"
        :fill-opacity="part.attributes.includes('transparent') ? 0.25 : part.attributes.includes('translucent') ? 0.6 : 1" stroke="#64786f" />
      <text :x="part.x + part.width / 2" :y="appearance?.layout === 'body' ? part.y + 14 : 72" text-anchor="middle" font-size="11" fill="#17212b" stroke="white" stroke-width="3" paint-order="stroke">{{ part.label }}{{ part.colors.length ? '' : '（未指定）' }}</text>
    </g>
  </svg>
</template>

<style scoped>
.visual-preview { display:block; width:220px; max-width:100%; height:80px; }
</style>
