<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  db,
  type LureManufacturer,
  type LureSeries,
  type LureModel,
  type LureVariant,
  type MyLure,
} from '../db/database'

const emit = defineEmits<{
  back: []
  selectLure: [myLureId: number]
}>()

interface MyLureView {
  myLure: MyLure
  manufacturerName: string
  seriesName: string
  modelName: string
  colorName: string
  catchCount: number
}

const myLureViews = ref<MyLureView[]>([])

const manufacturerName = ref('')
const seriesName = ref('')
const modelName = ref('')
const colorName = ref('')

const saving = ref(false)

async function loadMyLures() {
  const myLures = await db.myLures
    .filter((myLure) => myLure.active === true)
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

  return await db.lureManufacturers.add(manufacturer)
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

  return await db.lureSeries.add(series)
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

  return await db.lureModels.add(model)
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

  return await db.lureVariants.add(variant)
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
        })
      }
    )

    manufacturerName.value = ''
    seriesName.value = ''
    modelName.value = ''
    colorName.value = ''

    await loadMyLures()
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadMyLures()
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

      <label>
        <span>メーカー</span>

        <input v-model="manufacturerName" type="text" placeholder="例：Lucky Craft" />
      </label>

      <label>
        <span>シリーズ</span>

        <input v-model="seriesName" type="text" placeholder="例：WAH" />
      </label>

      <label>
        <span>モデル</span>

        <input v-model="modelName" type="text" placeholder="例：WAH 40F" />
      </label>

      <label>
        <span>カラー</span>

        <input v-model="colorName" type="text" placeholder="例：クロまんじゅう" />
      </label>

      <button class="register-button" :disabled="saving" @click="addMyLure">
        {{ saving ? "登録中…" : "＋ マイルアーに登録" }}
      </button>
    </section>

    <section class="card lure-list">
      <h2>所有ルアー</h2>

      <p v-if="myLureViews.length === 0" class="empty">まだルアーが登録されてへんで。</p>

      <article
        v-for="item in myLureViews"
        :key="item.myLure.id"
        class="lure-row"
        @click="item.myLure.id && emit('selectLure', item.myLure.id)"
      >
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

.form-card label > span {
  display: block;
  margin-bottom: 7px;
  color: #69747e;
  font-size: 13px;
  font-weight: 700;
}

input {
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
  transition:
    background 0.15s ease,
    transform 0.15s ease;
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
