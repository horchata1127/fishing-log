import { lureExternalReferences, type ExternalModelDetails, type LureExternalReference } from '../data/lureExternalReferences'
import { isNoaOption, type PhotoOption } from './noaPhotoCatalog'

export type ExternalPhotoOption = PhotoOption & { modelDetails?: ExternalModelDetails; externalColorCode?: string }
export const normalizeExternalName = (name: string) => name.normalize('NFKC').replace(/\s/g, '').toLowerCase()
const sameName = (a: string, b: string) => normalizeExternalName(a) === normalizeExternalName(b)
const makers = new Map([
  ['rodiocraft', 'RODIO CRAFT'], ['ロデオクラフト', 'RODIO CRAFT'],
  ['timon', 'TIMON'], ['ティモン', 'TIMON'], ['jackall(timon)', 'TIMON'],
  ['smith', 'SMITH'], ['スミス', 'SMITH'], ['smithltd.', 'SMITH'],
  ['palms', 'PALMS'], ['パームス', 'PALMS'],
  ['roblure', 'ROB LURE'], ['ロブルアー', 'ROB LURE'],
])
export const externalManufacturer = (name: string) => makers.get(normalizeExternalName(name))

function reviewedUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return
    if (/(?:^|\/)search(?:[./]|$)/i.test(url.pathname) || /^(?:srh|search)$/i.test(url.searchParams.get('mode') ?? '')) return
    for (const key of url.searchParams.keys()) {
      if (/^(q|keyword|token|expires|signature|x-amz-.+|x-goog-.+)$/i.test(key)) return
    }
    return url
  } catch { return undefined }
}

function matchesModel(a: ExternalModelDetails, b: ExternalModelDetails) {
  for (const key of ['weightG', 'lengthMm'] as const) {
    if (a[key] !== b[key] || a[key] !== undefined && (!Number.isFinite(a[key]) || a[key]! <= 0)) return false
  }
  return (['actionType', 'buoyancy', 'rattle'] as const).every(key => sameName(a[key] ?? '', b[key] ?? ''))
}

function matchesColor(ref: LureExternalReference, option: ExternalPhotoOption) {
  if (![ref.colorName, ...ref.colorAliases ?? []].some(name => sameName(name, option.colorName))) return false
  if (!ref.colorCode || !option.externalColorCode) return true
  const code = (value: string) => normalizeExternalName(value).replace(/^#?0*(?=\d+$)/, '')
  return code(ref.colorCode) === code(option.externalColorCode)
}

export function resolveLureExternalReference(
  option: ExternalPhotoOption,
  references: readonly LureExternalReference[] = lureExternalReferences,
  noaProductFallback = false,
) {
  const maker = externalManufacturer(option.manufacturerName)
  if (isNoaOption(option) !== noaProductFallback || !maker || !option.modelDetails) return
  const matched = references.filter(ref => externalManufacturer(ref.manufacturerName) === maker &&
    (ref.sourceType === 'manufacturer' || ref.sourceType === 'retailer' && (maker === 'RODIO CRAFT' || maker === 'TIMON')) &&
    sameName(ref.seriesName, option.seriesName) && sameName(ref.modelName, option.modelName) &&
    matchesModel(ref.modelDetails, option.modelDetails!) &&
    matchesColor(ref, option) &&
    ref.sourceName.trim() && ref.verificationBasis.trim() && reviewedUrl(ref.evidenceUrl))
  if (matched.length !== 1) return
  const ref = matched[0]!
  const linksRequireConditions = maker === 'TIMON' && ref.sourceType === 'retailer'
  const productUrl = ref.product?.verified && (!linksRequireConditions || reviewedUrl(ref.product.conditionsEvidence ?? ''))
    ? reviewedUrl(ref.product.url)?.href
    : undefined
  const imageUrl = ref.image ? reviewedUrl(ref.image.url) : undefined
  const image = !noaProductFallback && ref.image?.conditions === 'permitted' && ref.image.conditionsEvidence?.trim() && ref.image.decoded &&
    imageUrl?.hostname === ref.image.verifiedHost
    ? { imageUrl: imageUrl.href, imageKind: ref.image.kind, externalProductUrl: ref.evidenceUrl, sourceName: ref.sourceName }
    : undefined
  if (!productUrl && !image) return
  return { externalProductUrl: productUrl, imageReference: image, sourceName: ref.sourceName }
}

export function hasLurePhotoDisplay(option: ExternalPhotoOption) {
  return isNoaOption(option) || !!resolveLureExternalReference(option)
}
