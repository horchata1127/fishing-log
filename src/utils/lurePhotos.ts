import { db } from '../db/database'
import type { SharedLureColor, LureColorPhoto, LurePhotoBlob, PhotoFace } from '../db/lurePhotoTypes'
import { photoOptionIdentity, sharedColorForOption, modelProductLinkForOption, retailerProductLinkForOption, externalImageForOption, validateProductUrl, noaFamilyKey, type PhotoOption } from './noaPhotoCatalog'
import { noaUnavailableProductLinks } from '../data/noaUnavailableProductLinks'

export const photoTableNames = ['sharedLureColors', 'lureColorPhotoLinks', 'lureColorPhotos', 'lurePhotoBlobs'] as const
export const photoLimits = { inputBytes: 15 * 1024 * 1024, storedBytes: 2 * 1024 * 1024, edge: 1280, pixels: 40_000_000, archiveBytes: 150 * 1024 * 1024 }
const listeners = new Set<() => void>()
export function subscribePhotos(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function changed() { for (const listener of listeners) listener() }
const photoTables = () => photoTableNames.map(n => db.table(n))
const catalogTables = () => [db.lureVariants, db.lureModels, db.lureSeries, db.lureManufacturers]

export async function currentPhotoCatalog(): Promise<PhotoOption[]> {
  const [variants, models, series, makers] = await Promise.all([db.lureVariants.toArray(), db.lureModels.toArray(), db.lureSeries.toArray(), db.lureManufacturers.toArray()])
  return variants.flatMap(v => {
    const model = models.find(m => m.id === v.modelId), parent = series.find(s => s.id === model?.seriesId), maker = makers.find(m => m.id === parent?.manufacturerId)
    return model && parent && maker && v.id ? [{ variantId: v.id, modelId: model.id!, manufacturerName: maker.name, seriesName: parent.name, modelName: model.name, colorName: v.colorName }] : []
  })
}
export async function photoDetails(option: PhotoOption) {
  const derived = sharedColorForOption(option)
  if (!derived) return undefined
  const [stored, rows] = await Promise.all([db.sharedLureColors.get(derived.id), db.lureColorPhotos.where('sharedColorId').equals(derived.id).toArray()])
  return { shared: stored ?? derived, hasStoredShared: !!stored, photos: rows.filter(p => !p.variantIdentity || p.variantIdentity === photoOptionIdentity(option)) }
}
export async function resolveColorPhoto(option: PhotoOption, face: PhotoFace = 'front') {
  const detail = await photoDetails(option)
  if (!detail) return undefined
  const eligible = detail.photos.filter(p => p.verificationStatus === 'verified')
  const local = eligible.filter(p => p.imageAvailability === 'local' && p.imageType === face && p.blobId && ['user-owned', 'permitted'].includes(p.rightsStatus))
    .sort((a, b) => Number(!!b.variantIdentity) - Number(!!a.variantIdentity) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
  const override = eligible.find(p => p.imageAvailability === 'external' && p.variantIdentity && p.externalProductUrl)
  const supplied = detail.shared.externalVerified === undefined ? modelProductLinkForOption(option) : undefined
  const previousUrl = override?.externalProductUrl ?? (detail.shared.externalVerified === true ? detail.shared.externalProductUrl : supplied?.externalProductUrl)
  const previousSource = override?.sourceName ?? supplied?.sourceName ?? detail.shared.sourceName
  const retailer = retailerProductLinkForOption(option)
  const userChoice = !!override || detail.hasStoredShared && detail.shared.externalVerified !== undefined
  const suppressed = !override && detail.shared.externalVerified === false
  const externalProductUrl = userChoice ? previousUrl : retailer?.externalProductUrl ?? previousUrl
  const sourceName = externalProductUrl && externalProductUrl === retailer?.externalProductUrl ? retailer.sourceName : previousSource
  const additionalProductLinks: { url: string; sourceName: string }[] = []
  if (!suppressed) {
    if (retailer && retailer.externalProductUrl !== externalProductUrl) additionalProductLinks.push({ url: retailer.externalProductUrl, sourceName: retailer.sourceName })
    if (!userChoice && previousUrl && previousUrl !== externalProductUrl && !noaUnavailableProductLinks.includes(previousUrl)) additionalProductLinks.push({ url: previousUrl, sourceName: previousSource })
  }
  const imageReference = externalImageForOption(option)
  return { shared: detail.shared, local, faces: [...new Set(eligible.filter(p => p.imageAvailability === 'local').map(p => p.imageType))], externalProductUrl, additionalProductLinks, sourceName,
    imageReference: face === 'front' || imageReference?.imageKind === 'weight-common-color-sample' ? imageReference : undefined }
}

export async function hashPhoto(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return 'sha256:' + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function imageSignature(bytes: Uint8Array, mime: string) {
  return mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/png' ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
    : mime === 'image/webp' && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
}
function rasterSize(bytes: Uint8Array, mime: string): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mime === 'image/png' && bytes.length >= 24 && new TextDecoder().decode(bytes.slice(12, 16)) === 'IHDR') return [view.getUint32(16), view.getUint32(20)]
  if (mime === 'image/jpeg') {
    let offset = 2
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) break
      while (bytes[offset] === 255) offset++
      const marker = bytes[offset++]!
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 1 || marker >= 0xd0 && marker <= 0xd7) continue
      if (offset + 2 > bytes.length) break
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length) break
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && size >= 8) return [view.getUint16(offset + 5), view.getUint16(offset + 3)]
      offset += size
    }
  }
  if (mime === 'image/webp' && bytes.length >= 25) {
    const type = new TextDecoder().decode(bytes.slice(12, 16))
    if (type === 'VP8X' && bytes.length >= 30) return [1 + bytes[24]! + bytes[25]! * 256 + bytes[26]! * 65536, 1 + bytes[27]! + bytes[28]! * 256 + bytes[29]! * 65536]
    if (type === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff]
    if (type === 'VP8L' && bytes[20] === 0x2f) return [1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8), 1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10)]
  }
  throw new Error('写真の画像サイズを確認できません。JPEG・PNG・WebPを選択してください。')
}
export async function validatePhotoBlob(row: LurePhotoBlob) {
  if (!(row.blob instanceof Blob) || !row.blob.size || row.blob.size > photoLimits.storedBytes ||
    !Number.isInteger(row.width) || !Number.isInteger(row.height) || row.width <= 0 || row.height <= 0 || Math.max(row.width, row.height) > photoLimits.edge ||
    !imageSignature(new Uint8Array(await row.blob.slice(0, 16).arrayBuffer()), row.blob.type) || await hashPhoto(row.blob) !== row.id) {
    throw new Error('写真の形式・容量・サイズ・ハッシュを確認してください。')
  }
  const [width, height] = rasterSize(new Uint8Array(await row.blob.arrayBuffer()), row.blob.type)
  if (width !== row.width || height !== row.height) throw new Error('写真の実際のサイズと登録情報が一致しません。')
}
/** Decode only user-selected local files; never fetch source/image URLs. */
export async function preparePhoto(file: File): Promise<LurePhotoBlob> {
  if (!file.size || file.size > photoLimits.inputBytes || !imageSignature(new Uint8Array(await file.slice(0, 16).arrayBuffer()), file.type)) {
    throw new Error('15MB以下のJPEG・PNG・WebP写真を選択してください。HEICはJPEGへ変換してください。')
  }
  const [width, height] = rasterSize(new Uint8Array(await file.arrayBuffer()), file.type)
  if (!width || !height || width * height > photoLimits.pixels) throw new Error('写真の画素数が大きすぎます。4000万画素以下にしてください。')
  const url = URL.createObjectURL(file), img = new Image()
  try {
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('写真を読み込めませんでした。')); img.src = url })
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > photoLimits.pixels) throw new Error('写真の画素数が大きすぎます。4000万画素以下にしてください。')
    const scale = Math.min(1, photoLimits.edge / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('写真の縮小に失敗しました。')
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('写真を圧縮できませんでした。')), 'image/jpeg', .82))
    const row = { id: await hashPhoto(blob), blob, width: canvas.width, height: canvas.height }
    await validatePhotoBlob(row)
    return row
  } finally { img.src = ''; URL.revokeObjectURL(url) }
}

function validatePhoto(photo: LureColorPhoto) {
  if (!photo || typeof photo !== 'object' || !photo.id || !photo.sharedColorId?.startsWith(noaFamilyKey + ':') ||
    !['front', 'back', 'other'].includes(photo.imageType) || !['verified', 'unverified'].includes(photo.verificationStatus) ||
    !Number.isSafeInteger(photo.revision) || photo.revision < 1 || !Number.isFinite(Date.parse(photo.updatedAt)) ||
    typeof photo.sourceName !== 'string' || !photo.sourceName.trim() || typeof photo.rightsNote !== 'string' || typeof photo.sourceUrl !== 'string' ||
    (photo.variantIdentity !== undefined) !== (photo.variantId !== undefined) ||
    (photo.variantId !== undefined && (!Number.isSafeInteger(photo.variantId) || photo.variantId <= 0 || typeof photo.variantIdentity !== 'string')) ||
    (photo.sourceUrl && !/^https:\/\//.test(photo.sourceUrl))) throw new Error('写真の出典・確認状態・所属が不正です。')
  if (photo.imageAvailability === 'local') {
    if (!photo.blobId?.match(/^sha256:[a-f0-9]{64}$/) || photo.externalProductUrl || !['user-owned', 'permitted'].includes(photo.rightsStatus) ||
      photo.rightsStatus === 'permitted' && !photo.rightsNote.trim()) throw new Error('ローカル保存と写真バックアップを含む利用許可を確認してください。')
  } else if (photo.imageAvailability === 'external') {
    if (photo.blobId || !photo.variantIdentity || photo.id !== `external:${photo.variantIdentity}` || !photo.externalProductUrl || photo.rightsStatus !== 'unknown') throw new Error('商品ページリンクの設定が不正です。')
    validateProductUrl(photo.externalProductUrl)
  } else throw new Error('写真の保存方式が不正です。')
}
function validateShared(color: SharedLureColor) {
  if (!color || color.familyKey !== noaFamilyKey || typeof color.colorName !== 'string' || !color.colorName || typeof color.colorCode !== 'string' ||
    color.id !== `${noaFamilyKey}:${encodeURIComponent(color.colorName.normalize('NFKC').replace(/\s/g, '').toLowerCase())}` ||
    !Array.isArray(color.aliases) || color.aliases.some(a => typeof a !== 'string') ||
    !['catalog-match', 'review-needed'].includes(color.colorVerificationStatus) || !['local', 'external', 'none'].includes(color.imageAvailability) ||
    !['verified', 'unverified'].includes(color.verificationStatus) || !['unknown', 'user-owned', 'permitted'].includes(color.rightsStatus) ||
    typeof color.sourceName !== 'string' || typeof color.lastCheckedAt !== 'string' || color.externalVerified !== undefined && typeof color.externalVerified !== 'boolean') throw new Error('共通カラー情報が不正です。')
  if (color.externalProductUrl) validateProductUrl(color.externalProductUrl)
}
async function bindCurrent(option: PhotoOption) {
  const catalog = await currentPhotoCatalog(), current = catalog.find(c => c.variantId === option.variantId)
  if (!current || photoOptionIdentity(current) !== photoOptionIdentity(option)) throw new Error('カラーが変更されました。辞書を開き直してください。')
  const derived = sharedColorForOption(current)
  if (!derived) throw new Error('写真の対象はRODIO CRAFTのNOAシリーズです。')
  const shared = await db.sharedLureColors.get(derived.id) ?? derived
  const peers = catalog.filter(c => sharedColorForOption(c)?.id === shared.id)
  shared.aliases = [...new Set([...shared.aliases, ...peers.map(c => c.colorName)])]
  validateShared(shared)
  await db.sharedLureColors.put(shared)
  await db.lureColorPhotoLinks.bulkPut(peers.map(c => ({ variantId: c.variantId, sharedColorId: shared.id, identity: photoOptionIdentity(c) })))
  return shared
}
async function pruneBlob(blobId?: string) {
  if (blobId && !await db.lureColorPhotos.where('blobId').equals(blobId).count()) await db.lurePhotoBlobs.delete(blobId)
}
async function updateAvailability(sharedColorId: string) {
  const shared = await db.sharedLureColors.get(sharedColorId)
  if (!shared) return
  const local = (await db.lureColorPhotos.where('sharedColorId').equals(sharedColorId).toArray())
    .find(p => !p.variantIdentity && p.imageAvailability === 'local' && p.verificationStatus === 'verified')
  shared.imageAvailability = local ? 'local' : shared.externalProductUrl && shared.externalVerified ? 'external' : 'none'
  shared.rightsStatus = local?.rightsStatus ?? 'unknown'
  if (local) { shared.verificationStatus = 'verified'; if (!shared.externalProductUrl) { shared.sourceName = local.sourceName; shared.lastCheckedAt = local.updatedAt } }
  else if (!shared.externalProductUrl) shared.verificationStatus = 'unverified'
  if (local) shared.imageId = local.id
  else delete shared.imageId
  await db.sharedLureColors.put(shared)
}
export type PhotoDraft = Pick<LureColorPhoto, 'imageType' | 'sourceUrl' | 'sourceName' | 'rightsStatus' | 'rightsNote' | 'verificationStatus'> & { modelOnly: boolean }
export async function saveColorPhoto(option: PhotoOption, image: LurePhotoBlob, draft: PhotoDraft, previous?: LureColorPhoto) {
  await validatePhotoBlob(image) // WebCrypto and decoding stay outside IndexedDB transactions.
  const result = await db.transaction('rw', [...photoTables(), ...catalogTables()], async () => {
    const shared = await bindCurrent(option), old = previous && await db.lureColorPhotos.get(previous.id)
    if (previous && (!old || JSON.stringify(old) !== JSON.stringify(previous) || old.sharedColorId !== shared.id)) throw new Error('写真が変更されました。再読み込みしてください。')
    const { modelOnly, ...fields } = draft
    const row: LureColorPhoto = { ...fields, id: old?.id ?? crypto.randomUUID(), sharedColorId: shared.id, imageAvailability: 'local', blobId: image.id,
      ...(modelOnly ? { variantId: option.variantId, variantIdentity: photoOptionIdentity(option) } : {}),
      updatedAt: new Date().toISOString(), revision: (old?.revision ?? 0) + 1 }
    validatePhoto(row)
    if (!await db.lurePhotoBlobs.get(image.id)) await db.lurePhotoBlobs.add(image)
    await db.lureColorPhotos.put(row); await pruneBlob(old?.blobId); await updateAvailability(shared.id)
    return row
  })
  changed(); return result
}
export async function deleteColorPhoto(photo: LureColorPhoto) {
  await db.transaction('rw', photoTables(), async () => {
    const current = await db.lureColorPhotos.get(photo.id)
    if (!current || JSON.stringify(current) !== JSON.stringify(photo)) throw new Error('写真が変更されました。再読み込みしてください。')
    await db.lureColorPhotos.delete(photo.id); await pruneBlob(photo.blobId); await updateAvailability(photo.sharedColorId)
  }); changed()
}
/** One common external URL, or one explicit model override. No URL is fetched. */
export async function saveExternalPhotoLink(option: PhotoOption, url: string, sourceName: string, verified: boolean, modelOnly = false) {
  if (url) validateProductUrl(url)
  if (url && (!sourceName.trim() || !verified)) throw new Error('商品ページのカラーと写真を確認してください。')
  await db.transaction('rw', [...photoTables(), ...catalogTables()], async () => {
    const shared = await bindCurrent(option)
    if (modelOnly) {
      const identity = photoOptionIdentity(option), id = `external:${identity}`
      if (!url) await db.lureColorPhotos.delete(id)
      else {
        const old = await db.lureColorPhotos.get(id)
        const photo: LureColorPhoto = { id, sharedColorId: shared.id, variantId: option.variantId, variantIdentity: identity,
          imageAvailability: 'external', externalProductUrl: url, imageType: 'other', sourceUrl: url, sourceName: sourceName.trim(),
          rightsStatus: 'unknown', rightsNote: '', verificationStatus: 'verified', updatedAt: new Date().toISOString(), revision: (old?.revision ?? 0) + 1 }
        validatePhoto(photo); await db.lureColorPhotos.put(photo)
      }
    } else {
      shared.externalProductUrl = url; shared.sourceName = sourceName.trim(); shared.verificationStatus = url ? 'verified' : 'unverified'
      shared.externalVerified = !!url && verified
      shared.lastCheckedAt = new Date().toISOString(); validateShared(shared); await db.sharedLureColors.put(shared); await updateAvailability(shared.id)
    }
  }); changed()
}

function toBase64(bytes: Uint8Array): string {
  let value = ''
  for (let i = 0; i < bytes.length; i += 16384) value += String.fromCharCode(...bytes.subarray(i, i + 16384))
  return btoa(value)
}
export async function createPhotoBackup() {
  const data = await db.transaction('r', photoTables(), async () => ({
    sharedColors: await db.sharedLureColors.toArray(), links: await db.lureColorPhotoLinks.toArray(),
    photos: await db.lureColorPhotos.toArray(), blobs: await db.lurePhotoBlobs.toArray(),
  }))
  return { format: 'fishing-log-lure-photos', version: 1, exportedAt: new Date().toISOString(), ...data,
    blobs: await Promise.all(data.blobs.map(async row => ({ id: row.id, width: row.width, height: row.height, mime: row.blob.type, data: toBase64(new Uint8Array(await row.blob.arrayBuffer())) }))),
  }
}
export async function importPhotoBackup(file: Pick<File, 'text' | 'size'>) {
  if (file.size > photoLimits.archiveBytes) throw new Error('写真バックアップは150MB以下に分けてください。')
  const text = await file.text()
  if (text.length > photoLimits.archiveBytes) throw new Error('写真バックアップが大きすぎます。')
  const input = JSON.parse(text)
  if (input?.format !== 'fishing-log-lure-photos' || input.version !== 1 || !Number.isFinite(Date.parse(input.exportedAt)) ||
    !['sharedColors', 'photos', 'blobs', 'links'].every(k => Array.isArray(input[k]) && input[k].length <= 5000)) throw new Error('写真バックアップの形式が不正です。')
  const colors = input.sharedColors as SharedLureColor[], photos = input.photos as LureColorPhoto[]
  colors.forEach(validateShared); photos.forEach(validatePhoto)
  const blobs: LurePhotoBlob[] = await Promise.all(input.blobs.map(async (r: { id: string; width: number; height: number; mime: string; data: string }) => {
    if (typeof r.data !== 'string' || r.data.length > photoLimits.storedBytes * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(r.data)) throw new Error('写真の容量・エンコードが不正です。')
    const binary = atob(r.data), row = { id: r.id, width: r.width, height: r.height, blob: new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: r.mime }) }
    await validatePhotoBlob(row); return row
  }))
  for (const rows of [colors, photos, blobs]) if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('写真バックアップのIDが重複しています。')
  const colorIds = new Set(colors.map(c => c.id)), blobIds = new Set(blobs.map(b => b.id))
  if (photos.some(p => !colorIds.has(p.sharedColorId) || p.imageAvailability === 'local' && !blobIds.has(p.blobId!)) ||
    colors.some(c => c.imageId && !photos.some(p => p.id === c.imageId && p.sharedColorId === c.id)) ||
    input.links.some((l: { variantId: number; sharedColorId: string; identity: string }) => !Number.isSafeInteger(l.variantId) || l.variantId <= 0 || !colorIds.has(l.sharedColorId) || typeof l.identity !== 'string')) throw new Error('写真の参照先が不正です。')
  await db.transaction('rw', [...photoTables(), ...catalogTables()], async () => {
    for (const row of photos) {
      const existing = await db.lureColorPhotos.get(row.id)
      if (existing && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error('端末の写真情報と競合しています。既存の写真は変更しません。')
    }
    for (const color of colors) {
      const existing = await db.sharedLureColors.get(color.id)
      if (existing && (existing.colorName !== color.colorName || existing.colorCode !== color.colorCode ||
        (existing.externalProductUrl ?? '') !== (color.externalProductUrl ?? '') || !!existing.externalVerified !== !!color.externalVerified ||
        existing.externalProductUrl && existing.sourceName !== color.sourceName)) throw new Error('端末の共通カラー・リンクと競合しています。既存の情報は変更しません。')
      await db.sharedLureColors.put(existing ? { ...color, ...existing, aliases: [...new Set([...existing.aliases, ...color.aliases])] } : color)
    }
    await db.lureColorPhotos.bulkPut(photos)
    for (const blob of blobs) if (!await db.lurePhotoBlobs.get(blob.id)) await db.lurePhotoBlobs.add(blob)
    // Rebind only full natural identities to this device's catalog IDs; never trust restored numeric IDs.
    const catalog = await currentPhotoCatalog()
    const links = catalog.flatMap(c => { const shared = sharedColorForOption(c); return shared && colorIds.has(shared.id) ? [{ variantId: c.variantId, sharedColorId: shared.id, identity: photoOptionIdentity(c) }] : [] })
    await db.lureColorPhotoLinks.bulkPut(links)
    for (const color of colors) await updateAvailability(color.id)
  }); changed()
}
