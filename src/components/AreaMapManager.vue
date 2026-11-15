<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { db, type AreaMap } from '../db/database'
import { saveAreaMap, retireAreaMap } from '../utils/areaMaps'
import { mapTemplates, mapTemplate, transformMapOutline } from '../utils/areaMapGeometry'
import AreaMapCanvas from './AreaMapCanvas.vue'
const props=defineProps<{ facilityId?:string; tripId?:number }>()
const emit=defineEmits<{close:[]}>()
const dialog=ref<HTMLDialogElement>(),facility=ref(props.facilityId??''),facilities=ref<{id:string;name:string}[]>([]),zones=ref<{id:string;name:string}[]>([]),maps=ref<AreaMap[]>([])
const draft=ref<AreaMap>(),original=ref<AreaMap>(),newZone=ref(''),mode=ref<'pan'|'outline'|'inlet'|'outlet'>('pan'),selectedFeature=ref(''),error=ref(''),busy=ref(false)
const history=ref<AreaMap[]>([])
const facilitySearch=ref(''),loading=ref(false)
const selectedFacility=computed(()=>facilities.value.find(f=>f.id===facility.value))
const filteredFacilities=computed(()=>facilities.value.filter(f=>f.id===facility.value || f.name.toLocaleLowerCase('ja-JP').includes(facilitySearch.value.trim().toLocaleLowerCase('ja-JP'))))
const feature=computed(()=>draft.value?.features.find(f=>f.id===selectedFeature.value))
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v))
let loadRequest=0
async function load(){
  const request=++loadRequest,id=facility.value
  error.value='';loading.value=true;zones.value=[];maps.value=[]
  try{
    const [areaRows,mapRows]=id?await Promise.all([db.zones.where('facilityId').equals(id).toArray(),db.areaMaps.where('facilityId').equals(id).toArray()]):[[],[]]
    if(request!==loadRequest)return
    zones.value=areaRows.filter(z=>z.origin==='user'||z.catalogState!=='retired').map(z=>({id:z.id,name:String(z.name)}))
    maps.value=mapRows.filter(m=>!m.deletedAt)
  }catch(e){if(request===loadRequest)error.value=String(e)}
  finally{if(request===loadRequest)loading.value=false}
}
onMounted(async()=>{dialog.value?.showModal();facilities.value=(await db.facilities.toArray()).filter(f=>f.origin==='user'||f.catalogState!=='retired'||f.id===props.facilityId).map(f=>({id:f.id,name:String(f.name)}));await load()})
watch(facility,load)
function edit(map?:AreaMap){
  original.value=map?copy(map):undefined;newZone.value='';history.value=[];error.value='';selectedFeature.value='';mode.value='pan'
  const now=new Date().toISOString()
  draft.value=map?copy(map):{id:crypto.randomUUID(),facilityId:facility.value,zoneId:'',name:'',waterType:'pond',templateId:'P01',outline:mapTemplate('P01'),features:[],revision:1,createdAt:now,updatedAt:now}
}
function update(map:AreaMap){if(!draft.value)return;history.value.push(copy(draft.value));if(history.value.length>100)history.value.shift();draft.value=map}
function setNorth(configured:boolean){
  const map=copy(draft.value!)
  if(configured)map.northAngle=map.northAngle??0
  else delete map.northAngle
  update(map)
}
function changeNorth(value:string){update({...draft.value!,northAngle:value.trim()===''?NaN:Number(value)})}
function template(id:string){if(!draft.value)return;if(draft.value.features.length&&!confirm('テンプレートを変更すると特徴物の配置を解除します。変更しますか？'))return;update({...draft.value,templateId:id,waterType:id.startsWith('P')?'pond':'river',outline:mapTemplate(id),features:[]});selectedFeature.value=''}
function transform(kind:'rotate'|'flip'|'wider'|'taller'){try{update({...draft.value!,outline:transformMapOutline(draft.value!.outline,kind)});error.value=''}catch(e){error.value=String(e)}}
function changeFeature(field:'label'|'memo',value:string){update({...draft.value!,features:draft.value!.features.map(f=>f.id===selectedFeature.value?{...f,[field]:value}:f)})}
async function save(){if(!draft.value||busy.value)return;busy.value=true;error.value='';try{await saveAreaMap(copy(draft.value),original.value?copy(original.value):undefined,draft.value.zoneId?undefined:newZone.value.trim(),props.tripId);draft.value=undefined;await load()}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
async function remove(map:AreaMap){
  if(busy.value)return;busy.value=true
  try{const used=(await db.tripEvents.toArray()).some(e=>e.fishingPosition?.mapId===map.id);if(!confirm(used?'このマップは過去のイベントで利用中です。削除後も過去の表示は保持されます。削除しますか？':'このマップを削除しますか？'))return;await retireAreaMap(copy(map));await load()}catch(e){error.value=String(e)}finally{busy.value=false}
}
function cancel(){if(busy.value)return;if(draft.value){draft.value=undefined;error.value=''}else emit('close')}
</script>
<template>
  <dialog ref="dialog" aria-label="エリアマップ管理" @cancel.prevent="cancel">
    <h2>{{ draft?'エリアマップを編集':'エリアマップ管理' }}</h2>
    <p aria-label="選択中の施設">選択中の施設：{{ selectedFacility?.name || (facility ? facility : '未選択') }}</p>
    <fieldset :disabled="busy">
      <template v-if="!draft">
        <label>施設を検索<input v-model="facilitySearch" type="search" placeholder="施設名で検索" /></label>
        <label>釣り場<select aria-label="釣り場" v-model="facility"><option value="">施設を選択</option><option v-for="f in filteredFacilities" :key="f.id" :value="f.id">{{ f.name }}</option></select></label>
        <p v-if="loading" role="status">マップを読み込み中…</p>
        <p v-else-if="facilitySearch.trim()&&!filteredFacilities.some(f=>f.name.toLocaleLowerCase('ja-JP').includes(facilitySearch.trim().toLocaleLowerCase('ja-JP')))">該当する施設がありません。検索条件を変更してください。</p>
        <p v-if="!facility">既存の施設設定から釣り場を登録・選択してください。</p>
        <p v-else-if="!loading&&!maps.length">この釣り場にはマップがありません。</p>
        <article v-for="map in maps" :key="map.id" class="map-card">
          <strong>{{ map.name }}</strong><span>{{ map.waterType==='pond'?'ポンド':'河川' }}</span>
          <div class="preview"><AreaMapCanvas :map="map" mode="view" /></div>
          <button type="button" @click="edit(map)">編集：{{ map.name }}</button><button type="button" @click="remove(map)">削除：{{ map.name }}</button>
        </article>
        <button type="button" :disabled="!facility||loading||!!error" @click="edit()">＋エリアを追加</button>
        <button type="button" @click="emit('close')">閉じる</button>
      </template>
      <template v-else>
        <label>エリアマップ名（必須）<input v-model="draft.name" maxlength="100" /></label>
        <label>関連するエリア<select aria-label="関連するエリア" v-model="draft.zoneId" :disabled="!!original"><option value="">新しいエリアを登録</option><option v-for="z in zones" :key="z.id" :value="z.id">{{ z.name }}</option></select></label>
        <label v-if="!draft.zoneId">新規エリア名（必須）<input v-model="newZone" placeholder="例：奥のポンド" maxlength="100" /></label>
        <label>水域種別<select aria-label="水域種別" :value="draft.waterType" @change="template(($event.target as HTMLSelectElement).value==='pond'?'P01':'R01')"><option value="pond">ポンド</option><option value="river">河川</option></select></label>
        <label>形状テンプレート<select aria-label="形状テンプレート" :value="draft.templateId" @change="template(($event.target as HTMLSelectElement).value)"><option v-for="t in mapTemplates.filter(t=>t[0].startsWith(draft!.waterType==='pond'?'P':'R'))" :key="t[0]" :value="t[0]">{{ t[0] }} {{ t[1] }}</option></select></label>
        <fieldset class="north-settings"><legend>マップの北方向</legend>
          <label class="north-toggle"><input type="checkbox" :checked="draft.northAngle!==undefined" @change="setNorth(($event.target as HTMLInputElement).checked)" />北方向を設定する（手動）</label>
          <label>北方向の角度（度）<input type="number" inputmode="numeric" min="0" max="359" step="1" :disabled="draft.northAngle===undefined" :value="draft.northAngle??0" @input="changeNorth(($event.target as HTMLInputElement).value)" /></label>
          <p>マップ上方向が0度、時計回りに右90度・下180度・左270度。未設定の上向き表示は目安です。GPS・センサーによる実測値ではありません。</p>
        </fieldset>
        <div class="tools"><button type="button" @click="transform('rotate')">90度回転</button><button type="button" @click="transform('flip')">左右反転</button><button type="button" @click="transform('wider')">横長に</button><button type="button" @click="transform('taller')">縦長に</button></div>
        <div class="tools" role="group" aria-label="マップ編集ツール"><button v-for="tool in ([['pan','表示移動'],['outline','詳細な形状編集'],['inlet','インレット追加'],['outlet','アウトレット追加']] as const)" :key="tool[0]" type="button" :aria-pressed="mode===tool[0]" @click="mode=tool[0]">{{ tool[1] }}</button></div>
        <AreaMapCanvas :map="draft" :mode="mode" :selected-feature="selectedFeature" @update:map="update" @select-feature="selectedFeature=$event" />
        <label>特徴物を選択<select aria-label="特徴物を選択" v-model="selectedFeature"><option value="">選択なし</option><option v-for="(f,i) in draft.features" :key="f.id" :value="f.id">{{ i+1 }} {{ f.type==='inlet'?'インレット':'アウトレット' }} {{ f.label }}</option></select></label>
        <template v-if="feature"><label>特徴物の名称<input :value="feature.label??''" @input="changeFeature('label',($event.target as HTMLInputElement).value)" /></label><label>特徴物のメモ<textarea :value="feature.memo??''" @input="changeFeature('memo',($event.target as HTMLTextAreaElement).value)" /></label><button type="button" @click="update({...draft,features:draft.features.filter(f=>f.id!==selectedFeature)});selectedFeature=''">特徴物を削除</button></template>
        <button type="button" :disabled="!history.length" @click="draft=history.pop()">元に戻す</button>
        <button type="button" @click="save">マップを保存</button><button type="button" @click="cancel">キャンセル</button>
      </template>
    </fieldset>
    <p v-if="error" role="alert">{{ error }}</p>
  </dialog>
</template>
<style scoped>
dialog{box-sizing:border-box;width:min(580px,calc(100% - 20px));max-height:90dvh;overflow:auto;padding:18px;border:0;border-radius:18px;color:#17212b;background:white}dialog::backdrop{background:rgb(0 0 0 / 45%)}fieldset{border:0;padding:0;min-width:0}label{display:grid;gap:6px;margin:12px 0}input,select,textarea,button{box-sizing:border-box;min-height:44px;min-width:0;padding:10px;font:inherit;border:1px solid #bdc9ce;border-radius:8px;background:white;color:inherit}input,select,textarea{width:100%}button{margin:4px;overflow-wrap:anywhere}.tools{display:flex;flex-wrap:wrap;gap:4px}.tools button{flex:1 1 100px;margin:0}.map-card{border-bottom:1px solid #ccc;padding:12px 0}.map-card>span{margin-left:12px}.preview{width:110px;margin-top:8px}
</style>
<style scoped>
.north-settings { margin:12px 0; padding:10px; border:1px solid #bdc9ce; border-radius:10px; }
.north-toggle { display:flex; align-items:center; gap:8px; }
.north-toggle input { flex:0 0 24px; width:24px; min-height:24px; height:24px; }
.north-settings p { font-size:12px; line-height:1.5; }
</style>
