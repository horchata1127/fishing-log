<script setup lang="ts">
import { computed, ref } from "vue";
import type { LureOption, LureSelection, RecentLure } from '../utils/catchRegistration';
import type { TackleSet } from '../db/database';
import type { FishSpecies } from '../db/database';
import FishSpeciesPicker from './FishSpeciesPicker.vue';

const props = defineProps<{
  caughtAt: Date;
  hasPreviousCatch: boolean;
  myLures: LureOption[];
  catalog: LureOption[];
  recentLures: RecentLure[];
  selection: LureSelection | null;
  saving: boolean;
  tackleSets?: TackleSet[];
  tackleSetId?: number;
  fishChoices?: FishSpecies[];
  fishSpeciesId?: string;
  fishSize?: string;

  lureName: string;
  lureColor: string;
  range: string;
  retrieveSpeed: string;
  action: string;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [];
  sameAsPrevious: [];

  selectLure: [selection: LureSelection];
  'update:tackleSetId': [id: number | undefined];
  'update:fishSpeciesId': [id: string | undefined];
  'update:fishSize': [size: string];

  "update:lureName": [value: string];
  "update:lureColor": [value: string];
  "update:range": [value: string];
  "update:retrieveSpeed": [value: string];
  "update:action": [value: string];
}>();

const showLurePicker = ref(false);
const showManualInput = ref(false);
const lureSearch = ref("");
const lureManufacturer = ref("");
const lureCategory = ref("");
const pickerMode = ref<'owned' | 'catalog'>('owned');
const catalogModel = ref<number | ''>('');
const pickerOptions = computed(() => pickerMode.value === 'catalog' ? props.catalog : props.myLures);
const lureCategories = ['スプーン','クランク','ミノー','トップ','バイブレーション','その他'];
const lureManufacturers = computed(() => [...new Set(pickerOptions.value.map(l => l.manufacturerName))].sort((a,b) => a.localeCompare(b,'ja')));

const selectedMyLure = computed(() => {
  const selection = props.selection;
  return selection?.kind === 'owned' ? props.myLures.find(lure => lure.id === selection.myLureId)
    : selection?.kind === 'catalog' ? props.catalog.find(lure => lure.variantId === selection.variantId) : undefined;
});

const filteredMyLures = computed(() => {
  const keyword = lureSearch.value.trim().toLowerCase();



  return pickerOptions.value.filter((lure) => {
    if (lureManufacturer.value && lure.manufacturerName !== lureManufacturer.value) return false;
    if (lureCategory.value && lure.category !== lureCategory.value) return false;
    const text = [lure.manufacturerName, lure.seriesName, lure.modelName, lure.colorName]
      .join(" ")
      .toLowerCase();

    return text.includes(keyword);
  });
});

const catalogModels = computed(() => [...new Map(filteredMyLures.value.map(lure => [lure.modelId, lure])).values()]);
const visibleLures = computed(() => pickerMode.value === 'catalog'
  ? filteredMyLures.value.filter(lure => lure.modelId === catalogModel.value) : filteredMyLures.value);

function switchPicker(mode: 'owned' | 'catalog') {
  pickerMode.value = mode;
  lureSearch.value = ''; lureManufacturer.value = ''; lureCategory.value = ''; catalogModel.value = '';
}

function openLurePicker() {
  switchPicker(props.myLures.length ? 'owned' : 'catalog');
  showLurePicker.value = true;
}

function closeLurePicker() {
  showLurePicker.value = false;
}

function selectMyLure(lure: LureOption) {
  emit("selectLure", pickerMode.value === 'catalog'
    ? { kind: 'catalog', variantId: lure.variantId } : { kind: 'owned', myLureId: lure.id });
  emit("update:lureName", lure.modelName);
  emit("update:lureColor", lure.colorName);

  showManualInput.value = false;
  showLurePicker.value = false;
}

function openManualInput() {
  emit('selectLure', { kind: 'manual', lureName: props.lureName, lureColor: props.lureColor });
  showManualInput.value = true;
  showLurePicker.value = false;
}

function selectRecent(recent: RecentLure) {
  emit('selectLure', recent.selection);
  emit('update:lureName', recent.lureName);
  emit('update:lureColor', recent.lureColor);
  showManualInput.value = recent.selection.kind === 'manual';
  showLurePicker.value = false;
}
</script>

<template>
  <div class="modal-backdrop">
    <section class="catch-modal" role="dialog" aria-label="釣果を登録" aria-modal="true" :inert="saving" :aria-busy="saving">
      <p class="app-name">CATCH RECORD</p>

      <h2>🎣 釣果を登録</h2>

      <div class="caught-time">
        <span>釣れた時刻</span>

        <strong>
          {{
            caughtAt.toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          }}
        </strong>
      </div>

      <button v-if="hasPreviousCatch" class="same-button" @click="emit('sameAsPrevious')">
        ⚡ 前回と同じ
      </button>

      <!-- ルアー選択 -->
      <div class="catch-field">
        <span>ルアー</span>

        <div v-if="lureName || lureColor" class="selected-lure">
          <div>
            <strong>
              {{ lureName || "名称なし" }}
            </strong>

            <span v-if="lureColor">
              {{ lureColor }}
            </span>

            <small v-if="selectedMyLure">
              {{ selectedMyLure.manufacturerName }}
              ・
              {{ selectedMyLure.seriesName }}
            </small>
          </div>

          <button type="button" class="change-lure-button" @click="openLurePicker">
            変更
          </button>
        </div>

        <button v-else type="button" class="choose-lure-button" @click="openLurePicker">
          🎣 ルアーを選ぶ
        </button>

        <button
          v-if="!showManualInput"
          type="button"
          class="manual-link"
          @click="openManualInput"
        >
          ✏️ 手入力する
        </button>
      </div>

      <!-- 手入力 -->
      <div v-if="showManualInput" class="manual-input-area">
        <label class="catch-field">
          <span>ルアー名</span>

          <input
            :value="lureName"
            type="text"
            placeholder="例：WAH 40F"
            @input="
              emit(
                'update:lureName',
                ($event.target as HTMLInputElement).value
              )
            "
          />
        </label>

        <label class="catch-field">
          <span>カラー</span>

          <input
            :value="lureColor"
            type="text"
            placeholder="例：クロまんじゅう"
            @input="
              emit(
                'update:lureColor',
                ($event.target as HTMLInputElement).value
              )
            "
          />
        </label>
      </div>

      <!-- マイルアー選択パネル -->
      <div v-if="showLurePicker" class="picker-backdrop" @click.self="closeLurePicker">
        <section class="lure-picker" role="dialog" aria-label="ルアーを選択" aria-modal="true">
          <div class="picker-header">
            <div>
              <p class="app-name">MY LURES</p>

              <h3>🎣 ルアーを選択</h3>
            </div>

            <button type="button" class="close-button" @click="closeLurePicker">✕</button>
          </div>

          <div v-if="recentLures.length" class="lure-picker-list">
            <strong>最近使用</strong>
            <button v-for="recent in recentLures" :key="recent.key" type="button" class="picker-lure-button" @click="selectRecent(recent)">
              {{ recent.lureName }} ・ {{ recent.lureColor }}
            </button>
          </div>
          <div class="picker-category-filters">
            <button type="button" :aria-pressed="pickerMode === 'owned'" @click="switchPicker('owned')">マイルアー</button>
            <button type="button" :aria-pressed="pickerMode === 'catalog'" @click="switchPicker('catalog')">カタログ</button>
          </div>

          <input
            v-model="lureSearch"
            class="search-input"
            type="search"
            placeholder="ルアー名・カラー・メーカーで検索"
          />

          <div class="picker-category-filters">
            <select v-model="lureManufacturer" aria-label="メーカー"><option value="">すべてのメーカー</option><option v-for="name in lureManufacturers" :key="name" :value="name">{{ name }}</option></select>
            <select v-model="lureCategory" aria-label="カテゴリ"><option value="">すべてのカテゴリ</option><option v-for="cat in lureCategories" :key="cat" :value="cat">{{ cat }}</option></select>
          </div>
          <label v-if="pickerMode === 'catalog'" class="catch-field">
            <span>モデルを選んでからカラーを選択</span>
            <select v-model="catalogModel">
              <option value="">モデルを選択</option>
              <option v-for="model in catalogModels" :key="model.modelId" :value="model.modelId">
                {{ model.manufacturerName }} / {{ model.seriesName }} / {{ model.modelName }}
              </option>
            </select>
          </label>
          <p v-if="pickerMode === 'catalog'" class="no-lures">未登録のルアーは、釣果の保存時にマイルアーへ1個登録します。</p>
          <div v-if="visibleLures.length > 0" class="lure-picker-list">
            <button
              v-for="lure in visibleLures"
              :key="lure.id"
              type="button"
              class="picker-lure-button"
              @click="selectMyLure(lure)"
            >
              <div class="picker-lure-main">
                <strong>
                  {{ lure.modelName }}
                </strong>

                <span>
                  {{ lure.colorName }}
                </span>
              </div>

              <small>
                {{ lure.manufacturerName }}
                ・
                {{ lure.seriesName }}
              </small>
            </button>
          </div>

          <p v-else class="no-lures">{{ pickerMode === 'catalog' && !catalogModel ? 'モデルを選択してください。' : '該当するルアーがありません。' }}</p>

          <button type="button" class="picker-manual-button" @click="openManualInput">
            ✏️ マスターにないルアーを手入力
          </button>
        </section>
      </div>

      <div class="catch-field">
        <span>レンジ</span>

        <div class="choice-grid">
          <button
            v-for="value in ['表層', '上層', '中層', '下層', 'ボトム']"
            :key="value"
            type="button"
            :class="{
              selected: range === value,
            }"
            @click="emit('update:range', value)"
          >
            {{ value }}
          </button>
        </div>
      </div>

      <div class="catch-field">
        <span>巻き速度</span>

        <div class="choice-grid speed-grid">
          <button
            v-for="value in ['遅い', '普通', '速い']"
            :key="value"
            type="button"
            :class="{
              selected: retrieveSpeed === value,
            }"
            @click="emit('update:retrieveSpeed', value)"
          >
            {{ value }}
          </button>
        </div>
      </div>

      <label class="catch-field">
        <span>アクション</span>

        <select
          :value="action"
          @change="
            emit(
              'update:action',
              ($event.target as HTMLSelectElement).value
            )
          "
        >
          <option value="">未選択</option>
          <option value="ただ巻き">ただ巻き</option>
          <option value="ストップ＆ゴー">ストップ＆ゴー</option>
          <option value="トゥイッチ">トゥイッチ</option>
          <option value="ジャーク">ジャーク</option>
          <option value="シェイク">シェイク</option>
          <option value="シミーフォール">シミーフォール</option>
          <option value="シミーアップ">シミーアップ</option>
          <option value="リフト＆フォール">リフト＆フォール</option>
          <option value="ステイ">ステイ</option>
          <option value="その他">その他</option>
        </select>
      </label>

      <label class="catch-field">
        <span>使用タックル（任意）</span>
        <select aria-label="使用タックル" :value="tackleSetId ?? ''" @change="emit('update:tackleSetId', ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : undefined)">
          <option value="">未指定</option>
          <option v-for="set in tackleSets ?? []" :key="set.id" :value="set.id">{{ set.name }}</option>
        </select>
        <small v-if="!tackleSets?.length">持参セットは釣行画面で追加できます。</small>
      </label>
      <FishSpeciesPicker :choices="fishChoices ?? []" :model-value="fishSpeciesId" @update:model-value="emit('update:fishSpeciesId', $event)" />
      <label class="catch-field"><span>全長（cm・任意）</span>
        <input type="number" inputmode="decimal" min="0" step="any" :value="fishSize ?? ''" @input="emit('update:fishSize', ($event.target as HTMLInputElement).value)" />
      </label>
      <button class="primary-button" :disabled="saving" @click="emit('save')">{{ saving ? '保存中…' : '保存する' }}</button>

      <button class="cancel-button" @click="emit('cancel')">キャンセル</button>
    </section>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgb(0 0 0 / 45%);
}

.catch-modal {
  width: min(100%, 460px);
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  border-radius: 20px;
  background: white;
  color: #17212b;
  box-shadow: 0 20px 60px rgb(0 0 0 / 25%);
}

.app-name {
  margin: 0;
  color: #73808c;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

h2 {
  margin-top: 4px;
  font-size: 19px;
}

.caught-time {
  display: flex;
  justify-content: space-between;
  margin: 20px 0;
  padding: 14px;
  border-radius: 12px;
  background: #f4f7f6;
}

.caught-time span {
  color: #69747e;
}

.same-button {
  width: 100%;
  margin-bottom: 20px;
  padding: 17px;
  border: 2px solid #13795b;
  border-radius: 14px;
  background: #eef8f4;
  color: #13795b;
  font-size: 17px;
  font-weight: 800;
  cursor: pointer;
}

.catch-field {
  display: block;
  margin-top: 16px;
}

.catch-field > span {
  display: block;
  margin-bottom: 7px;
  color: #69747e;
  font-size: 13px;
  font-weight: 700;
}

.choose-lure-button {
  width: 100%;
  padding: 16px;
  border: 2px solid #13795b;
  border-radius: 14px;
  background: white;
  color: #13795b;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
}

.selected-lure {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border: 2px solid #13795b;
  border-radius: 14px;
  background: #eef8f4;
}

.selected-lure strong,
.selected-lure span,
.selected-lure small {
  display: block;
}

.selected-lure span {
  margin-top: 3px;
  color: #13795b;
  font-size: 13px;
  font-weight: 700;
}

.selected-lure small {
  margin-top: 4px;
  color: #7b8792;
}

.change-lure-button {
  flex: 0 0 auto;
  padding: 9px 12px;
  border: 1px solid #13795b;
  border-radius: 10px;
  background: white;
  color: #13795b;
  font-weight: 700;
  cursor: pointer;
}

.manual-link {
  display: block;
  margin: 9px auto 0;
  padding: 5px 8px;
  border: 0;
  background: transparent;
  color: #69747e;
  font-size: 12px;
  cursor: pointer;
}

.manual-input-area {
  padding-bottom: 4px;
}

input,
select {
  width: 100%;
  padding: 13px;
  border: 1px solid #d9dee3;
  border-radius: 10px;
  background: white;
  color: #17212b;
  font: inherit;
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.choice-grid button {
  padding: 12px 6px;
  border: 1px solid #d9dee3;
  border-radius: 10px;
  background: white;
  color: #52606b;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.choice-grid button.selected {
  border-color: #13795b;
  background: #13795b;
  color: white;
}

.speed-grid {
  grid-template-columns: repeat(3, 1fr);
}

.primary-button {
  width: 100%;
  margin: 24px 0 8px;
  padding: 18px;
  border: 0;
  border-radius: 18px;
  background: #13795b;
  color: white;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 20px rgb(19 121 91 / 25%);
}

.primary-button:active,
.same-button:active,
.choose-lure-button:active {
  transform: scale(0.98);
}

.cancel-button {
  width: 100%;
  padding: 12px;
  border: 0;
  background: transparent;
  color: #69747e;
  cursor: pointer;
}

/* マイルアー選択パネル */

.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgb(0 0 0 / 45%);
}

.lure-picker {
  width: min(100%, 520px);
  max-height: 75vh;
  overflow-y: auto;
  padding: 20px;
  border-radius: 22px 22px 16px 16px;
  background: white;
  box-shadow: 0 20px 60px rgb(0 0 0 / 30%);
}

.picker-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.picker-header h3 {
  margin: 4px 0 0;
  font-size: 20px;
}

.close-button {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: #f1f4f3;
  color: #52606b;
  font-size: 18px;
  cursor: pointer;
}

.search-input {
  margin-bottom: 14px;
}

.lure-picker-list {
  display: grid;
  gap: 8px;
}

.picker-lure-button {
  width: 100%;
  padding: 13px;
  border: 1px solid #d9dee3;
  border-radius: 12px;
  background: white;
  color: #17212b;
  text-align: left;
  cursor: pointer;
}

.picker-lure-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.picker-lure-main strong {
  font-size: 15px;
}

.picker-lure-main span {
  color: #13795b;
  font-size: 13px;
  font-weight: 700;
}

.picker-lure-button small {
  display: block;
  margin-top: 4px;
  color: #7b8792;
}

.picker-manual-button {
  width: 100%;
  margin-top: 14px;
  padding: 13px;
  border: 0;
  border-radius: 12px;
  background: #f1f4f3;
  color: #52606b;
  font-weight: 700;
  cursor: pointer;
}

.no-lures {
  color: #7b8792;
  font-size: 13px;
}

@media (max-width: 480px) {
  .catch-modal {
    padding: 20px;
  }

  .picker-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .lure-picker {
    max-height: 82vh;
    border-radius: 22px 22px 0 0;
  }
}
</style>

<style scoped>
.picker-category-filters { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
.picker-category-filters select { min-width:0; width:100%; padding:10px; border:1px solid #d9dee3; border-radius:10px; background:white; color:#17212b; font:inherit; }
</style>
