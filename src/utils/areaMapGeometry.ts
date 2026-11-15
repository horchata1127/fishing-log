import { validMapOutline, type MapPoint } from '../db/database'

export const mapTemplates = [
  ['P01','長方形'],['P02','正方形'],['P03','楕円形'],['P04','円形'],['P05','L字型'],['P06','ひょうたん型'],['P07','三角形'],['P08','不規則形'],
  ['R01','直線型'],['R02','緩やかなカーブ'],['R03','S字型'],['R04','大きな蛇行'],['R05','幅広・淵型'],
] as const
const polygon = (pairs: number[][]): MapPoint[] => pairs.map(([x,y])=>({x:x!,y:y!}))
export function mapTemplate(id: string): MapPoint[] {
  const ellipse = (rx:number,ry:number) => Array.from({length:32},(_,i)=>({x:0.5+rx*Math.cos(i*Math.PI/16),y:0.5+ry*Math.sin(i*Math.PI/16)}))
  switch(id) {
    case 'P01': return polygon([[.12,.25],[.88,.25],[.88,.75],[.12,.75]])
    case 'P02': return polygon([[.18,.18],[.82,.18],[.82,.82],[.18,.82]])
    case 'P03': return ellipse(.4,.27)
    case 'P04': return ellipse(.36,.36)
    case 'P05': return polygon([[.15,.15],[.5,.15],[.5,.5],[.85,.5],[.85,.85],[.15,.85]])
    case 'P06': return Array.from({length:40},(_,i)=>{ const t=i*Math.PI/20,r=.28+.12*Math.cos(2*t);return {x:.5+r*Math.cos(t),y:.5+r*Math.sin(t)} })
    case 'P07': return polygon([[.5,.12],[.9,.85],[.1,.85]])
    case 'P08': return polygon([[.12,.3],[.3,.12],[.65,.2],[.86,.4],[.75,.7],[.5,.88],[.14,.75],[.22,.5]])
  }
  if (!/^R0[1-5]$/.test(id)) throw new Error('テンプレートを選択してください。')
  const bank=(side:number)=>Array.from({length:17},(_,i)=>{
    const t=i/16, bend=id==='R02'?.16*Math.sin(t*Math.PI):id==='R03'?.15*Math.sin(t*2*Math.PI):id==='R04'?.23*Math.sin(t*2*Math.PI):0
    const width=id==='R05'?.10+.14*Math.sin(t*Math.PI)**2:.11
    return {x:.5+bend+side*width,y:.08+.84*t}
  })
  return [...bank(-1),...bank(1).reverse()]
}
export function transformMapOutline(outline: MapPoint[], kind:'rotate'|'flip'|'wider'|'taller'): MapPoint[] {
  const result=outline.map(p=>kind==='rotate'?{x:1-p.y,y:p.x}:kind==='flip'?{x:1-p.x,y:p.y}:
    {x:.5+(p.x-.5)*(kind==='wider'?1.1:1/1.1),y:.5+(p.y-.5)*(kind==='taller'?1.1:1/1.1)})
  if (!validMapOutline(result)) throw new Error('形状が範囲外または小さすぎます。元に戻すか、別の調整を選んでください。')
  return result
}
export function normalizedMapPoint(x:number,y:number): MapPoint { return {x:Math.max(.02,Math.min(.98,x)),y:Math.max(.02,Math.min(.98,y))} }
