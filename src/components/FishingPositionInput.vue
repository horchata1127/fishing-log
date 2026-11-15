<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw, watch } from 'vue'
import { db, shorePoint, type AreaMap, type FishingPosition, type ShoreAnchor } from '../db/database'
import AreaMapCanvas from './AreaMapCanvas.vue'
const props=defineProps<{ facilityId?:string; modelValue?:FishingPosition; disabled?:boolean; refreshKey?:number }>()
const emit=defineEmits<{ 'update:modelValue':[position:FishingPosition|undefined]; createMap:[] }>()
const mapSelect=ref<HTMLSelectElement>()
const maps=ref<AreaMap[]>([]),selected=ref(props.modelValue?.mapId??''),snapshot=ref<AreaMap|undefined>(props.modelValue?.snapshot),error=ref('')
const savedOnly=computed(()=>selected.value&&!maps.value.some(m=>m.id===selected.value))
const stale=computed(()=>snapshot.value&&maps.value.some(m=>m.id===selected.value&&m.revision!==snapshot.value!.revision))
async function loadMaps(){try{maps.value=props.facilityId?(await db.areaMaps.where('facilityId').equals(props.facilityId).toArray()).filter(m=>!m.deletedAt):[];if(!selected.value&&maps.value.length===1){selected.value=maps.value[0]!.id;snapshot.value=maps.value[0]};error.value=''}catch(e){error.value=String(e)}}
onMounted(loadMaps)
watch(()=>props.refreshKey,async()=>{await loadMaps();await nextTick();mapSelect.value?.focus()})
function choose(){snapshot.value=maps.value.find(m=>m.id===selected.value);emit('update:modelValue',undefined)}
function anchor(value:ShoreAnchor){if(!snapshot.value)return;emit('update:modelValue',{mapId:snapshot.value.id,snapshot:structuredClone(toRaw(snapshot.value)),anchor:value,position:shorePoint(snapshot.value.outline,value),...(props.modelValue?.castDirection!==undefined?{castDirection:props.modelValue.castDirection}:{})})}
function direction(value:string){if(!props.modelValue)return;const p=structuredClone(toRaw(props.modelValue));if(value==='')delete p.castDirection;else p.castDirection=Number(value);emit('update:modelValue',p)}
</script>
<template>
  <fieldset :disabled="disabled" class="position-input">
    <legend>釣り座</legend>
    <p v-if="!facilityId">釣行の施設設定から釣り場を選択してください。</p>
    <label>釣り座のエリアマップ<select ref="mapSelect" aria-label="釣り座のエリアマップ" v-model="selected" @change="choose"><option value="">マップを選択</option><option v-if="savedOnly" :value="selected">{{ snapshot?.name||'参照先不明' }}（保存時のマップ）</option><option v-for="m in maps" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
    <p v-if="!maps.length">利用できるマップがありません。釣行画面の「エリアマップ管理」から作成できます。</p>
    <button v-if="!maps.length" type="button" @click="emit('createMap')">🗺️ エリアマップを作成</button>
    <p v-if="savedOnly">現在のマップ参照が見つからないため、保存時の形状を表示しています。</p>
    <p v-if="stale">保存時の形状を表示しています。新しい釣り座には最新版を選択してください。<button type="button" @click="choose">最新版のマップを使う</button></p>
    <AreaMapCanvas v-if="snapshot" :map="snapshot" mode="position" :anchor="modelValue?.anchor" :cast-direction="modelValue?.castDirection" @update:anchor="anchor" />
    <button v-if="modelValue" type="button" @click="emit('update:modelValue',undefined)">釣り座の選択を解除</button>
    <p v-if="snapshot&&!modelValue" role="status">岸をタップして釣り座を指定してください。</p>
    <label>キャスト方向（マップ上の相対角度・任意）<select aria-label="キャスト方向（マップ上の相対角度・任意）" :value="modelValue?.castDirection??''" :disabled="!modelValue" @change="direction(($event.target as HTMLSelectElement).value)"><option value="">未指定</option><option v-for="[value,label] in [[0,'右'],[45,'右下'],[90,'下'],[135,'左下'],[180,'左'],[225,'左上'],[270,'上'],[315,'右上']]" :key="value" :value="value">{{ label }}</option><option v-if="modelValue?.castDirection!==undefined&&modelValue.castDirection%45!==0" :value="modelValue.castDirection">{{ modelValue.castDirection }}度</option></select></label>
    <label v-if="modelValue?.castDirection!==undefined">方向を微調整<input type="range" min="0" max="359" step="1" :value="modelValue.castDirection" @input="direction(($event.target as HTMLInputElement).value)" /></label>
    <p v-if="error" role="alert">{{ error }}</p>
  </fieldset>
</template>
<style scoped>
.position-input{min-width:0;border:1px solid #ccd3d8;border-radius:12px;padding:10px}label{display:grid;gap:6px;margin:12px 0}select,input,button{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:8px;font:inherit;background:white;color:#17212b;border:1px solid #ccd3d8;border-radius:8px}p{font-size:13px}
button:focus-visible,select:focus-visible { outline:3px solid #126652; outline-offset:3px; }
</style>
