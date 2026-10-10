<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  db,
  type LureManufacturer,
  type LureSeries,
  type LureModel,
  type LureVariant,
  type MyLure,
  isUsableOwnedLure,
} from '../db/database'

const emit = defineEmits<{
  back: []
  selectLure: [id: number]
}>()

interface MyLureView {
  myLure: MyLure
  manufacturerName: string
  seriesName: string
  modelName: string
  colorName: string
  catchCount: number
  category: string
}

const myLureViews = ref<MyLureView[]>([])
const filterManufacturer = ref('')
const filterCategory = ref('')
const filterKeyword = ref('')
const categories = ['スプーン', 'クランク', 'ミノー', 'トップ', 'バイブレーション', 'その他']
const manufacturerFilters = computed(() => [...new Set(myLureViews.value.map(x => x.manufacturerName))].sort((a,b) => a.localeCompare(b,'ja')))
const filteredMyLureViews = computed(() => myLureViews.value.filter(x =>
  (!filterManufacturer.value || x.manufacturerName === filterManufacturer.value) &&
  (!filterCategory.value || x.category === filterCategory.value) &&
  (!filterKeyword.value.trim() || [x.manufacturerName, x.seriesName, x.modelName, x.colorName]
    .join(' ').normalize('NFKC').toLocaleLowerCase().includes(filterKeyword.value.trim().normalize('NFKC').toLocaleLowerCase()))
))

const manufacturerName = ref('')
const seriesName = ref('')
const modelName = ref('')
const colorName = ref('')

const catalogManufacturers = ref<LureManufacturer[]>([])
const catalogSeries = ref<LureSeries[]>([])
const catalogModels = ref<LureModel[]>([])
const catalogVariants = ref<LureVariant[]>([])

const normalized = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase()

const selectedManufacturer = computed(() =>
  catalogManufacturers.value.find(item => normalized(item.name) === normalized(manufacturerName.value))
)
const availableSeries = computed(() =>
  catalogSeries.value.filter(item => item.manufacturerId === selectedManufacturer.value?.id)
)
const selectedSeries = computed(() =>
  availableSeries.value.find(item => normalized(item.name) === normalized(seriesName.value))
)
const availableModels = computed(() =>
  catalogModels.value.filter(item => item.seriesId === selectedSeries.value?.id)
)
const selectedModel = computed(() =>
  availableModels.value.find(item => normalized(item.name) === normalized(modelName.value))
)
const availableColors = computed(() =>
  catalogVariants.value.filter(item => item.modelId === selectedModel.value?.id)
)

type Step = 'manufacturer' | 'series' | 'model' | 'color'
const activeStep = ref<Step>('manufacturer')
const manualMode = ref(false)
const steps: { key: Step; label: string }[] = [
  { key: 'manufacturer', label: 'メーカー' },
  { key: 'series', label: 'シリーズ' },
  { key: 'model', label: 'モデル' },
  { key: 'color', label: 'カラー' },
]
const stepValues = computed<Record<Step, string>>(() => ({
  manufacturer: manufacturerName.value,
  series: seriesName.value,
  model: modelName.value,
  color: colorName.value,
}))
const choices = computed(() => {
  if (activeStep.value === 'manufacturer') return catalogManufacturers.value.map(x => x.name)
  if (activeStep.value === 'series') return availableSeries.value.map(x => x.name)
  if (activeStep.value === 'model') return availableModels.value.map(x => x.name)
  return availableColors.value.map(x => x.colorName)
})
const canOpenStep = (step: Step) => {
  if (step === 'manufacturer') return true
  if (step === 'series') return !!selectedManufacturer.value
  if (step === 'model') return !!selectedSeries.value
  return !!selectedModel.value
}
function choose(value: string) {
  switch (activeStep.value) {
    case 'manufacturer':
      manufacturerName.value = value
      seriesName.value = ''; modelName.value = ''; colorName.value = ''
      activeStep.value = 'series'
      break
    case 'series':
      seriesName.value = value
      modelName.value = ''; colorName.value = ''
      activeStep.value = 'model'
      break
    case 'model':
      modelName.value = value
      colorName.value = ''
      activeStep.value = 'color'
      break
    case 'color':
      colorName.value = value
      break
  }
}
function enableManual() {
  manualMode.value = true
}
function onManualManufacturerInput() {
  seriesName.value = ''; modelName.value = ''; colorName.value = ''
}
function onManualSeriesInput() {
  modelName.value = ''; colorName.value = ''
}
function onManualModelInput() {
  colorName.value = ''
}

async function loadCatalog() {
  const [manufacturers, series, models, variants] = await Promise.all([
    db.lureManufacturers.toArray(),
    db.lureSeries.toArray(),
    db.lureModels.toArray(),
    db.lureVariants.toArray(),
  ])
  catalogManufacturers.value = manufacturers.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  catalogSeries.value = series
  catalogModels.value = models
  catalogVariants.value = variants
}

const saving = ref(false)

async function loadMyLures() {
  const myLures = await db.myLures
    .filter(isUsableOwnedLure)
    .toArray()

  const result: MyLureView[] = []

  for (const myLure of myLures) {
    if (!myLure.id) {
      continue
    }

    const variant = await db.lureVariants.get(
      myLure.variantId
    )

    if (!variant) {
      continue
    }

    const model = await db.lureModels.get(
      variant.modelId
    )

    if (!model) {
      continue
    }

    const series = await db.lureSeries.get(
      model.seriesId
    )

    if (!series) {
      continue
    }

    const manufacturer =
      await db.lureManufacturers.get(
        series.manufacturerId
      )

    if (!manufacturer) {
      continue
    }

    const catchCount = await db.catches
      .filter((catchRecord) => catchRecord.lureId === myLure.id)
      .count()

    console.log('釣果数確認', myLure.id, catchCount)

    result.push({
      myLure,
      manufacturerName: manufacturer.name,
      seriesName: series.name,
      modelName: model.name,
      colorName: variant.colorName,
      catchCount,
      category: model.category ?? 'その他',
    })
  }

  myLureViews.value = result.reverse()
}


async function findOrCreateManufacturer(
  name: string
): Promise<number> {
  const existing = await db.lureManufacturers
    .where('name')
    .equals(name)
    .first()

  if (existing?.id) {
    return existing.id
  }

  const manufacturer: LureManufacturer = {
    name,
  }

  const id = await db.lureManufacturers.add(manufacturer)

  if (id === undefined) {
    throw new Error('メーカーの登録に失敗しました')
  }

  return id
}

async function findOrCreateSeries(
  manufacturerId: number,
  name: string
): Promise<number> {
  const existing = await db.lureSeries
    .where('manufacturerId')
    .equals(manufacturerId)
    .filter((series) => series.name === name)
    .first()

  if (existing?.id) {
    return existing.id
  }

  const series: LureSeries = {
    manufacturerId,
    name,
  }

  const id = await db.lureSeries.add(series)

  if (id === undefined) {
    throw new Error('シリーズの登録に失敗しました')
  }

  return id
}

async function findOrCreateModel(
  seriesId: number,
  name: string
): Promise<number> {
  const existing = await db.lureModels
    .where('seriesId')
    .equals(seriesId)
    .filter((model) => model.name === name)
    .first()

  if (existing?.id) {
    return existing.id
  }

  const model: LureModel = {
    seriesId,
    name,
  }

  const id = await db.lureModels.add(model)

  if (id === undefined) {
    throw new Error('モデルの登録に失敗しました')
  }

  return id
}

async function findOrCreateVariant(
  modelId: number,
  colorName: string
): Promise<number> {
  const existing = await db.lureVariants
    .where('modelId')
    .equals(modelId)
    .filter((variant) => variant.colorName === colorName)
    .first()

  if (existing?.id) {
    return existing.id
  }

  const variant: LureVariant = {
    modelId,
    colorName,
  }

  const id = await db.lureVariants.add(variant)

  if (id === undefined) {
    throw new Error('カラーの登録に失敗しました')
  }

  return id
}

async function addMyLure() {
  const manufacturer = manufacturerName.value.trim()
  const series = seriesName.value.trim()
  const model = modelName.value.trim()
  const color = colorName.value.trim()

  if (!manufacturer || !series || !model || !color) {
    alert('メーカー・シリーズ・モデル・カラーを全部入力してな！')
    return
  }

  saving.value = true

  try {
    await db.transaction(
      'rw',
      db.lureManufacturers,
      db.lureSeries,
      db.lureModels,
      db.lureVariants,
      db.myLures,
      async () => {
        const manufacturerId =
          await findOrCreateManufacturer(manufacturer)

        const seriesId = await findOrCreateSeries(
          manufacturerId,
          series
        )

        const modelId = await findOrCreateModel(
          seriesId,
          model
        )

        const variantId = await findOrCreateVariant(
          modelId,
          color
        )

        await db.myLures.add({
          variantId,
          active: true,
          ownershipStatus: 'owned',
        })
      }
    )

    manufacturerName.value = ''
    seriesName.value = ''
    modelName.value = ''
    colorName.value = ''
    activeStep.value = 'manufacturer'

    await loadMyLures()
    await loadCatalog()
  } catch (error) {
    console.error('ルアー登録失敗', error)
    alert('ルアーの登録に失敗しました。入力内容を確認してもう一度試してな。')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadMyLures(), loadCatalog()])
})
</script>

<template>
  <div class="my-lures-screen">
    <button class="back-button" @click="emit('back')">← 戻る</button>

    <header class="page-header">
      <p class="app-name">MY LURES</p>
      <h1>🎣 マイルアー</h1>
    </header>

    <section class="card form-card">
      <h2>ルアーを登録</h2>

      <div class="mode-switch">
        <button type="button" :class="{ chosen: !manualMode }" @click="manualMode = false">一覧から選ぶ</button>
        <button type="button" :class="{ chosen: manualMode }" @click="enableManual">手入力</button>
      </div>

      <template v-if="!manualMode">
        <div class="step-tabs" aria-label="ルアー選択の進行状況">
          <button v-for="step in steps" :key="step.key" type="button"
            :disabled="!canOpenStep(step.key)" :class="{ current: activeStep === step.key }"
            @click="activeStep = step.key">
            <span>{{ step.label }}</span>
            <small>{{ stepValues[step.key] || '未選択' }}</small>
          </button>
        </div>
        <p class="choice-caption">{{ steps.find(x => x.key === activeStep)?.label }}をスクロールして選んでな</p>
        <div class="choice-list" role="group" :aria-label="`${steps.find(x => x.key === activeStep)?.label}の候補`">
          <button v-for="(value, index) in choices" :key="`${index}-${value}`" type="button"
            class="choice-row" :class="{ selected: stepValues[activeStep] === value }" @click="choose(value)">
            <span>{{ value }}</span><span v-if="stepValues[activeStep] === value" aria-label="選択中">✓</span>
          </button>
          <p v-if="choices.length === 0" class="empty">候補がないで。「手入力」に切り替えて登録してな。</p>
        </div>
        <p class="selected-summary">選択中：{{ manufacturerName || '—' }} / {{ seriesName || '—' }} / {{ modelName || '—' }} / {{ colorName || '—' }}</p>
      </template>

      <template v-else>
        <label><span>メーカー</span><input v-model="manufacturerName" type="text" autocomplete="off" placeholder="メーカー名" @input="onManualManufacturerInput" /></label>
        <label><span>シリーズ</span><input v-model="seriesName" type="text" autocomplete="off" placeholder="シリーズ名" @input="onManualSeriesInput" /></label>
        <label><span>モデル</span><input v-model="modelName" type="text" autocomplete="off" placeholder="モデル名" @input="onManualModelInput" /></label>
        <label><span>カラー</span><input v-model="colorName" type="text" autocomplete="off" placeholder="カラー名" /></label>
      </template>

      <button class="register-button" :disabled="saving" @click="addMyLure">
        {{ saving ? "登録中…" : "＋ マイルアーに登録" }}
      </button>
    </section>

    <section class="card lure-list" aria-label="所有ルアー">
      <h2>所有ルアー</h2>
      <p class="empty">実所有として登録したルアーを表示します。未確認のルアーも保管されています。</p>
      <div class="lure-filters">
        <label>メーカー<select v-model="filterManufacturer"><option value="">すべてのメーカー</option><option v-for="name in manufacturerFilters" :key="name" :value="name">{{ name }}</option></select></label>
        <label>カテゴリ<select v-model="filterCategory"><option value="">すべてのカテゴリ</option><option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option></select></label>
        <label>キーワード<input v-model="filterKeyword" type="search" placeholder="モデル名・カラー名" /></label>
      </div>
      <p class="filter-count">{{ filteredMyLureViews.length }} / {{ myLureViews.length }} 件表示</p>

      <p v-if="myLureViews.length === 0" class="empty">まだルアーが登録されてへんで。</p>

      <article v-for="item in filteredMyLureViews" :key="item.myLure.id" class="lure-row"
        @click="item.myLure.id && emit('selectLure', item.myLure.id)">
        <div class="lure-main">
          <strong>{{ item.modelName }}</strong>

          <span class="color-name">
            {{ item.colorName }}
          </span>
        </div>

        <div class="lure-sub">
          {{ item.manufacturerName }}
          ・
          {{ item.seriesName }}
        </div>

        <div class="catch-count">🎣 {{ item.catchCount }}匹</div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.my-lures-screen {
  width: 100%;
}

.back-button {
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: #13795b;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.page-header {
  margin: 24px 0;
}

.app-name {
  margin: 0;
  color: #73808c;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

h1 {
  margin: 3px 0 0;
  font-size: 26px;
}

h2 {
  margin-top: 0;
  font-size: 19px;
  color: #17212b;
}

.card {
  margin-bottom: 20px;
  padding: 20px;
  border: 1px solid #e4e8ec;
  border-radius: 18px;
  background: white;
  box-shadow: 0 8px 30px rgb(0 0 0 / 5%);
}

.form-card label {
  display: block;
  margin-bottom: 16px;
}

.form-card label>span {
  display: block;
  margin-bottom: 7px;
  color: #69747e;
  font-size: 13px;
  font-weight: 700;
}

input {
  box-sizing: border-box;
  width: 100%;
  padding: 13px;
  border: 1px solid #d9dee3;
  border-radius: 10px;
  background: white;
  color: #17212b;
  font: inherit;
}

.register-button {
  width: 100%;
  margin-top: 6px;
  padding: 16px;
  border: 0;
  border-radius: 14px;
  background: #13795b;
  color: white;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
}

.register-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.empty {
  color: #7b8792;
}

.lure-list {
  margin-top: 20px;
}

.lure-row {
  padding: 15px 0;
  border-top: 1px solid #edf0f2;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.lure-row:hover {
  background: #f8fbfa;
}

.lure-row:active {
  transform: scale(0.99);
}

.lure-row:first-of-type {
  border-top: 0;
}

.lure-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lure-main strong {
  font-size: 16px;
}

.color-name {
  padding: 5px 8px;
  border-radius: 8px;
  background: #eef7f3;
  color: #13795b;
  font-size: 12px;
  font-weight: 700;
}

.lure-sub {
  margin-top: 5px;
  color: #69747e;
  font-size: 12px;
}

.catch-count {
  margin-top: 8px;
  color: #13795b;
  font-size: 13px;
  font-weight: 800;
}
</style>

<style scoped>
.mode-switch { display:flex; gap:8px; margin: 0 0 16px; }
.mode-switch button { flex:1; border:1px solid #cbd5d1; background:#fff; color:#17654d; border-radius:10px; padding:11px 6px; font-weight:700; }
.mode-switch button.chosen { background:#13795b; color:#fff; border-color:#13795b; }
.step-tabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.step-tabs button { min-width:0; text-align:left; border:1px solid #dce6e0; border-radius:10px; background:#f8faf9; padding:10px; color:#26362f; }
.step-tabs button.current { border:2px solid #13795b; background:#eaf6f0; }
.step-tabs button:disabled { opacity:.45; }
.step-tabs small { display:block; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#53645c; }
.choice-caption { margin:16px 0 8px; font-size:14px; font-weight:700; }
.choice-list { max-height:270px; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; border:1px solid #dce6e0; border-radius:12px; }
.choice-row { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; padding:14px; min-height:48px; text-align:left; background:#fff; color:#17212b; border:0; border-bottom:1px solid #edf1ee; font:inherit; overflow-wrap:anywhere; }
.choice-row.selected { background:#eaf6f0; color:#116348; font-weight:700; }
.selected-summary { font-size:12px; color:#56665d; overflow-wrap:anywhere; }
</style>

<style scoped>
.lure-filters { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:12px; text-align:left; }
.lure-filters label { min-width:0; font-size:13px; font-weight:700; color:#52606b; }
.lure-filters label:last-child { grid-column:1 / -1; }
.lure-filters select, .lure-filters input { display:block; width:100%; min-width:0; margin-top:5px; padding:11px; border:1px solid #d9dee3; border-radius:10px; background:white; color:#17212b; font:inherit; }
.filter-count { margin: 12px 0; color:#52606b; font-size:13px; }
</style>
