import { rc20Catalog } from './rc20Catalog'

// Explicit product-reviewed allowlist; palettes remain the frozen RC20 originals.
export const rc21ModelAllowlist = [
  {
    "manufacturer": "ベルベットアーツ",
    "series": "フォルテ",
    "model": "フォルテ 0.6g",
    "weight": 0.6,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "フォルテ",
    "model": "フォルテ 0.9g",
    "weight": 0.9,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "フォルテ",
    "model": "フォルテ 1.5g",
    "weight": 1.5,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "フォルテ",
    "model": "フォルテ 1.8g",
    "weight": 1.8,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "フォルテ",
    "model": "フォルテ 2.1g",
    "weight": 2.1,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "デイジー",
    "model": "デイジー 0.4g",
    "weight": 0.4,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "デイジー",
    "model": "デイジー 0.8g",
    "weight": 0.8,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "デイジー",
    "model": "デイジー 1.3g",
    "weight": 1.3,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "デイジー",
    "model": "デイジー 2.5g",
    "weight": 2.5,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "ゴーレム",
    "model": "ゴーレム 2.2g",
    "weight": 2.2,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ベルベットアーツ",
    "series": "ゴーレム",
    "model": "ゴーレム 2.9g",
    "weight": 2.9,
    "expectedManufacturerId": 62,
    "category": "スプーン",
    "productVerified": true
  },
  {
    "manufacturer": "ロブルアー",
    "series": "S-Plug",
    "model": "S-Plug 1.8g",
    "weight": 1.8,
    "expectedManufacturerId": 71,
    "category": "その他",
    "productVerified": true
  },
  {
    "manufacturer": "ロブルアー",
    "series": "S-Plug",
    "model": "S-Plug 2.2g",
    "weight": 2.2,
    "expectedManufacturerId": 71,
    "category": "その他",
    "productVerified": true
  },
  {
    "manufacturer": "ロブルアー",
    "series": "チェルシー",
    "model": "チェルシー SS",
    "weight": 1.8,
    "expectedManufacturerId": 71,
    "category": "その他",
    "productVerified": true
  },
  {
    "manufacturer": "ロブルアー",
    "series": "チェルシー",
    "model": "チェルシー F",
    "weight": 1.4,
    "expectedManufacturerId": 71,
    "category": "その他",
    "productVerified": true
  },
  {
    "manufacturer": "ロブルアー",
    "series": "パパバービー",
    "model": "パパバービー",
    "weight": 3.4,
    "expectedManufacturerId": 71,
    "category": "その他",
    "productVerified": true
  },
  {
    "manufacturer": "ロブルアー",
    "series": "モーストバービー",
    "model": "モーストバービー",
    "weight": 3.4,
    "expectedManufacturerId": 71,
    "category": "その他",
    "productVerified": true
  },
  {
    "manufacturer": "ロブルアー",
    "series": "もぐたそ",
    "model": "もぐたそ",
    "weight": 4.2,
    "expectedManufacturerId": 71,
    "category": "その他",
    "productVerified": true
  }
] as const

export const rc21Catalog = rc21ModelAllowlist.map(permission => {
  const target = rc20Catalog.find(t => t.manufacturer === permission.manufacturer && t.series === permission.series && t.model === permission.model && t.weight === permission.weight)
  if (!target) throw new Error(`RC21 official product missing: ${permission.model}`)
  return { ...target, ...permission, allowNewModel: permission.productVerified }
})
