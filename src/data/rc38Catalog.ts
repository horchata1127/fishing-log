// Retailer-confirmed 2026-11-04. Existing ambiguous models are never aliases of these products.
import { rc37Catalog } from './rc37Catalog'
const listed = [
  [
    "FOCUSオリーブ",
    "4573151272313",
    "184665432"
  ],
  [
    "24ノブ",
    "4573151272290",
    "184665342"
  ],
  [
    "20井野",
    "4573151272283",
    "184665281"
  ],
  [
    "19早乙女",
    "4573151272276",
    "184665235"
  ],
  [
    "RCポテトヘッド",
    "4573151265711",
    "179903731"
  ],
  [
    "19ノブ",
    "4573151265698",
    "179903727"
  ],
  [
    "クリアー(マット)",
    "4573151255927",
    "171853453"
  ],
  [
    "さちおの茶",
    "4573151245423",
    "156192039"
  ],
  [
    "黒まんじゅう",
    "4573151236445",
    "146121715"
  ],
  [
    "2015 ノブ",
    "4573151232638",
    "139676373"
  ],
  [
    "蛍光ピンク",
    "4573151232621",
    "139676366"
  ],
  [
    "2014 ノブ",
    "4573151232614",
    "139676354"
  ],
  [
    "黄/緑",
    "4573151232607",
    "139676333"
  ],
  [
    "キラキラ",
    "4573151232591",
    "139676319"
  ],
  [
    "S.M VI",
    "4573151232553",
    "139676302"
  ],
  [
    "K.FⅢ（レッドグロー）",
    "4573151232546",
    "139676267"
  ]
] as const
export const rc38Catalog = rc37Catalog.filter(t =>
  ['MOCA DR-F Rattle 2HOOK', 'MOCA DR-SS Rattle 2HOOK'].includes(t.model)).map(t => ({
    ...structuredClone(t), preserveAmbiguousModel: true,
    colors: t.colors.map(c => ({ ...c, jan: '', notes: '2026-11-04 販売店確認。メーカー公式未確認。' })),
  }))
const floating = rc38Catalog.find(t => t.buoyancy === 'F')!
for (const [name, jan, pid] of listed) {
  const sourceUrl = `https://fishing-shop-jh.com/?pid=${pid}`
  const existing = floating.colors.find(c => c.name === name)
  if (existing) Object.assign(existing, { sourceUrl, jan })
  else floating.colors.push({ name, code: '', label: name, aliases: [name], sourceUrl, sourceTier: 'retailer',
    colorClass: 'standard', verified: true, jan, notes: '2026-11-04 商品別に30mm/2.1g/F/ガラスラトル×2を販売店確認。メーカー公式未確認。' })
}
