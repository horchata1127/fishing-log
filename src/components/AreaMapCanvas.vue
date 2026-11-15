<script setup lang="ts">
import { computed, ref } from 'vue'
import { nearestShore, shorePoint, validMapOutline, type AreaMap, type ShoreAnchor } from '../db/database'
import { normalizedMapPoint } from '../utils/areaMapGeometry'
const props=defineProps<{ map:AreaMap; mode?:'view'|'outline'|'inlet'|'outlet'|'position'|'pan'; anchor?:ShoreAnchor; castDirection?:number; selectedFeature?:string }>()
const emit=defineEmits<{ 'update:map':[map:AreaMap]; 'update:anchor':[anchor:ShoreAnchor]; selectFeature:[id:string] }>()
const svg=ref<SVGSVGElement>(), zoom=ref(1), vx=ref(0), vy=ref(0), notice=ref('')
const view=computed(()=>`${vx.value} ${vy.value} ${1/zoom.value} ${1/zoom.value}`)
const path=computed(()=>props.map.outline.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')+' Z')
// Draw the selected feature last so overlapping shore markers remain draggable.
const displayFeatures=computed(()=>[...props.map.features].sort((a,b)=>Number(a.id===props.selectedFeature)-Number(b.id===props.selectedFeature)))
const spot=computed(()=>props.anchor?shorePoint(props.map.outline,props.anchor):undefined)
const angle=computed(()=>(props.castDirection??0)*Math.PI/180)
const northRadians=computed(()=>(props.map.northAngle??0)*Math.PI/180)
const pointers=new Map<number,{x:number;y:number}>()
let start={x:0,y:0}, last={x:0,y:0}, drag='', moved=false, pinchDistance=0
const length=()=>{const a=[...pointers.values()];return a.length<2?0:Math.hypot(a[1]!.x-a[0]!.x,a[1]!.y-a[0]!.y)}
function clampView(){const max=1-1/zoom.value;vx.value=Math.max(0,Math.min(max,vx.value));vy.value=Math.max(0,Math.min(max,vy.value))}
function zoomTo(value:number){const old=1/zoom.value;zoom.value=Math.max(1,Math.min(5,value));vx.value+=(old-1/zoom.value)/2;vy.value+=(old-1/zoom.value)/2;clampView()}
function pan(dx:number,dy:number){vx.value+=dx/zoom.value;vy.value+=dy/zoom.value;clampView()}
function point(e:PointerEvent){const box=svg.value!.getBoundingClientRect();return normalizedMapPoint(vx.value+(e.clientX-box.left)/box.width/zoom.value,vy.value+(e.clientY-box.top)/box.height/zoom.value)}
function down(e:PointerEvent){
  if(props.mode==='view')return
  e.preventDefault();svg.value!.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY})
  start=last={x:e.clientX,y:e.clientY};moved=false
  drag=(e.target as Element).closest('[data-drag]')?.getAttribute('data-drag')??''
  if(drag.startsWith('feature:'))emit('selectFeature',drag.slice(8))
  if(pointers.size===2){pinchDistance=length();moved=true;drag=''}
}
function apply(e:PointerEvent){
  const p=point(e)
  if(drag==='spot')emit('update:anchor',nearestShore(props.map.outline,p))
  else if(drag.startsWith('vertex:')){
    const outline=props.map.outline.map((v,i)=>i===Number(drag.slice(7))?p:{...v})
    if(validMapOutline(outline)){notice.value='';emit('update:map',{...props.map,outline})}else notice.value='岸が交差する形・極端に小さい形には変更できません。'
  }else if(drag.startsWith('feature:'))emit('update:map',{...props.map,features:props.map.features.map(f=>f.id===drag.slice(8)?{...f,anchor:nearestShore(props.map.outline,p)}:f)})
}
function move(e:PointerEvent){
  if(!pointers.has(e.pointerId))return
  const before=pointers.get(e.pointerId)!;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY})
  if(pointers.size>=2){const d=length();if(pinchDistance)zoomTo(zoom.value*d/pinchDistance);pinchDistance=d;const box=svg.value!.getBoundingClientRect();pan(-(e.clientX-before.x)/box.width/2,-(e.clientY-before.y)/box.height/2);moved=true;return}
  if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)moved=true
  if(drag)apply(e)
  else if(moved){const box=svg.value!.getBoundingClientRect();pan(-(e.clientX-last.x)/box.width,-(e.clientY-last.y)/box.height)}
  last={x:e.clientX,y:e.clientY}
}
function up(e:PointerEvent){
  if(!pointers.has(e.pointerId))return
  if(pointers.size===1&&!moved&&!drag){
    const anchor=nearestShore(props.map.outline,point(e))
    if(props.mode==='position')emit('update:anchor',anchor)
    else if(props.mode==='inlet'||props.mode==='outlet')emit('update:map',{...props.map,features:[...props.map.features,{id:crypto.randomUUID(),type:props.mode,anchor}]})
  }
  pointers.delete(e.pointerId);pinchDistance=0
  if(pointers.size){moved=true;drag='';last=[...pointers.values()][0]!;start=last}
}
function featureArrow(segment:number,t:number,type:string){
  const a=props.map.outline[segment]!,b=props.map.outline[(segment+1)%props.map.outline.length]!
  const area=props.map.outline.reduce((sum,p,i)=>{const q=props.map.outline[(i+1)%props.map.outline.length]!;return sum+p.x*q.y-q.x*p.y},0)
  const sign=(area>0?1:-1)*(type==='inlet'?1:-1),dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy)
  const p=shorePoint(props.map.outline,{segment,t});return {x:p.x-dy/n*.09*sign,y:p.y+dx/n*.09*sign}
}
</script>
<template>
  <div class="map-canvas">
    <div v-if="mode!=='view'" class="map-tools" role="group" aria-label="マップ表示操作">
      <button type="button" aria-label="マップを拡大" @click="zoomTo(zoom*1.4)">＋</button><button type="button" aria-label="マップを縮小" @click="zoomTo(zoom/1.4)">−</button>
      <button type="button" aria-label="マップを左へ" @click="pan(-.15,0)">←</button><button type="button" aria-label="マップを右へ" @click="pan(.15,0)">→</button>
      <button type="button" aria-label="マップを上へ" @click="pan(0,-.15)">↑</button><button type="button" aria-label="マップを下へ" @click="pan(0,.15)">↓</button>
      <button type="button" @click="zoom=1;vx=0;vy=0">全体表示</button>
    </div>
    <div class="map-viewport">
    <svg ref="svg" class="map-water" :viewBox="view" role="img" :aria-label="`${map.name}のエリアマップ`" :class="{interactive:mode!=='view'}" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="pointers.delete($event.pointerId)">
      <defs><marker :id="`arrow-${map.id}`" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
      <path :d="path" fill="#d9f1f7" stroke="#277185" stroke-width=".008" />
      <g v-for="feature in displayFeatures" :key="feature.id" :data-feature-id="feature.id" :data-drag="mode!=='view'&&mode!=='position'?'feature:'+feature.id:undefined">
        <circle :cx="shorePoint(map.outline,feature.anchor).x" :cy="shorePoint(map.outline,feature.anchor).y" r=".055" fill="transparent" />
        <line :x1="shorePoint(map.outline,feature.anchor).x" :y1="shorePoint(map.outline,feature.anchor).y" :x2="featureArrow(feature.anchor.segment,feature.anchor.t,feature.type).x" :y2="featureArrow(feature.anchor.segment,feature.anchor.t,feature.type).y" :stroke="feature.type==='inlet'?'#1260b5':'#b9500a'" stroke-width=".012" :marker-end="`url(#arrow-${map.id})`" />
        <circle :cx="shorePoint(map.outline,feature.anchor).x" :cy="shorePoint(map.outline,feature.anchor).y" :r="selectedFeature===feature.id ? .025 : .015" :fill="feature.type==='inlet'?'#1260b5':'#b9500a'" />
        <text :x="shorePoint(map.outline,feature.anchor).x+.02" :y="shorePoint(map.outline,feature.anchor).y-.025" font-size=".03">{{ feature.type==='inlet'?'💧入':'💧出' }}</text>
        <title>{{ feature.label || (feature.type==='inlet'?'インレット':'アウトレット') }}</title>
      </g>
      <g v-if="mode==='outline'">
        <g v-for="(p,i) in map.outline" :key="i" :data-drag="'vertex:'+i" :data-vertex="i"><circle :cx="p.x" :cy="p.y" r=".045" fill="transparent" /><circle :cx="p.x" :cy="p.y" r=".012" fill="#fff" stroke="#13795b" stroke-width=".006" /></g>
      </g>
      <g v-if="spot" data-drag="spot" data-testid="fishing-position-marker">
        <circle :cx="spot.x" :cy="spot.y" r=".055" fill="transparent" /><circle :cx="spot.x" :cy="spot.y" r=".024" fill="#c53059" stroke="white" stroke-width=".008" />
        <line v-if="castDirection!==undefined" :x1="spot.x" :y1="spot.y" :x2="spot.x+.16*Math.cos(angle)" :y2="spot.y+.16*Math.sin(angle)" stroke="#c53059" stroke-width=".012" :marker-end="`url(#arrow-${map.id})`" />
      </g>
    </svg>
    <div class="map-compass" data-testid="map-compass" role="img" :aria-label="map.northAngle===undefined?'北方向：未設定（上向き0度は目安）':`北方向：${map.northAngle}度（マップ上から時計回り・手動設定）`" :data-north-angle="map.northAngle??0" :data-configured="map.northAngle!==undefined">
      <svg class="compass-icon" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="white" stroke="#bbc8cd" />
        <g :transform="`rotate(${map.northAngle??0} 24 24)`" data-testid="compass-needle">
          <path d="M24 13 L30 31 L24 27 L18 31 Z" :fill="map.northAngle===undefined?'#7b8790':'#126652'" />
        </g>
        <text :x="24+17*Math.sin(northRadians)" :y="27-17*Math.cos(northRadians)" text-anchor="middle" font-size="10" font-weight="bold" fill="#17212b">N</text>
      </svg>
      <span>{{ map.northAngle===undefined?'北：未設定':`北 ${map.northAngle}°` }}</span>
      <span v-if="map.northAngle!==undefined">手動</span>
    </div>
    </div>
    <p v-if="mode!=='view'" class="hint">岸をタップして指定。マーカーはドラッグで調整できます。2本指で拡大・移動、背景ドラッグで移動。</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </div>
</template>
<style scoped>
.map-canvas { min-width:0; } .map-water { display:block; width:100%; aspect-ratio:1; background:#f5f5ef; border-radius:12px; } svg.interactive { touch-action:none; user-select:none; }
.map-viewport { position:relative; }
.map-compass { position:absolute; top:6px; right:6px; display:grid; justify-items:center; padding:3px; border-radius:8px; background:rgb(255 255 255 / 90%); font-size:10px; line-height:1.3; color:#17212b; pointer-events:none; user-select:none; }
.compass-icon { display:block; width:40px; height:40px; }
.map-tools { display:flex; flex-wrap:wrap; gap:4px; margin:8px 0; }.map-tools button { min-width:44px; min-height:44px; padding:7px; border:1px solid #b5c6cc; border-radius:8px; background:white;color:#17212b; font:inherit; }.hint { font-size:12px; color:#52606b; }
</style>
