import { noaColorDefinitions } from '../data/noaSharedColors'
import { noaExternalLinks } from '../data/noaExternalLinks'
import { noaModelExternalLinks } from '../data/noaModelExternalLinks'
import { noaAdditionalExternalLinks } from '../data/noaExternalReferences'
import { noaRetailerProductLinks } from '../data/noaRetailerProductLinks'
import type { SharedLureColor } from '../db/lurePhotoTypes'
import type { LureOption } from './catchRegistration'

export type PhotoOption = Pick<LureOption, 'variantId' | 'modelId' | 'manufacturerName' | 'seriesName' | 'modelName' | 'colorName'>
export const noaFamilyKey = 'rodio-craft:noa'
const fold = (s: string) => s.normalize('NFKC').replace(/\s/g, '').toLowerCase()
const families = new Set(['noa', 'noajr.', 'noajr', 'noas', 'noab', 'noaboss', 'noa(b/jr./boss)'])
export function isNoaOption(option: PhotoOption): boolean {
  return ['rodiocraft', 'ロデオクラフト'].includes(fold(option.manufacturerName)) &&
    families.has(fold(option.seriesName)) && /^NOA(?:$|[\s.(]|Jr\b|Boss\b)/i.test(option.modelName.normalize('NFKC'))
}
export function photoOptionIdentity(option: PhotoOption): string {
  return JSON.stringify([option.manufacturerName, option.seriesName, option.modelName, option.colorName].map(fold))
}
/** Existing product pages match the selected model and full color name. */
export function modelProductLinkForOption(option: PhotoOption) {
  if (!isNoaOption(option)) return
  return [...noaModelExternalLinks, ...noaAdditionalExternalLinks].find(link => fold(link.modelName) === fold(option.modelName) &&
    link.colorNames.some(name => fold(name) === fold(option.colorName)))
}
/** Pages with reviewed individual photos stay scoped to the original model/color name. */
export function retailerProductLinkForOption(option: PhotoOption) {
  if (!isNoaOption(option)) return
  return noaRetailerProductLinks.find(link => fold(link.modelName) === fold(option.modelName) &&
    link.colorNames.some(name => fold(name) === fold(option.colorName)))
}
/** Only exact catalog names plus explicit numeric prefixes are merged. Similar labels stay separate. */
export function sharedColorForOption(option: PhotoOption): SharedLureColor | undefined {
  if (!isNoaOption(option)) return
  const raw = option.colorName.normalize('NFKC').trim(), prefix = raw.match(/^#(\d+)\s+(.+)$/)
  const name = prefix?.[2] ?? raw
  const definition = noaColorDefinitions.find(c => fold(c.name) === fold(name) && (!prefix || c.code === String(Number(prefix[1]))))
  const colorName = definition?.name ?? raw, colorCode = definition?.code ?? prefix?.[1] ?? ''
  const id = `${noaFamilyKey}:${encodeURIComponent(fold(definition?.name ?? raw))}`
  const source = noaExternalLinks.find(c => fold(c.colorName) === fold(colorName) && c.colorCode === colorCode)
  return { id, familyKey: noaFamilyKey, colorName, colorCode, aliases: [option.colorName],
    colorVerificationStatus: definition ? 'catalog-match' : 'review-needed',
    imageAvailability: source ? 'external' : 'none', verificationStatus: source ? 'verified' : 'unverified',
    rightsStatus: 'unknown', sourceName: source?.sourceName ?? '', lastCheckedAt: source?.lastCheckedAt ?? '',
    ...(source ? { externalProductUrl: source.externalProductUrl, externalVerified: true } : {}),
  }
}
export function validateProductUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password ||
    /(?:^|\/)search(?:\/|$)|mode=srh|[?&]q=/i.test(url.href) ||
    !(url.searchParams.get('pid')?.match(/^\d+$/) || /\/(?:products?|items?)\/[^/]+/.test(url.pathname) || /\/.+\.html?$/.test(url.pathname) ||
      url.hostname === 'store.castingnet.jp' && /^\/shop\/g\/g\d{8,14}\/$/.test(url.pathname))) {
    throw new Error('写真を確認できる個別商品ページのHTTPS URLを入力してください。')
  }
  return url.href
}
export function matchesPhotoColorSearch(option: PhotoOption, query: string): boolean {
  const search = fold(query), shared = sharedColorForOption(option)
  if (shared && /^#?\d+$/.test(search)) return shared.colorCode === String(Number(search.replace('#', '')))
  return fold([option.manufacturerName, option.seriesName, option.modelName, option.colorName, shared?.colorCode ?? '', shared?.colorName ?? ''].join(' ')).includes(search)
}
