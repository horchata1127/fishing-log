export type PhotoFace = 'front' | 'back' | 'other'
export type PhotoRights = 'user-owned' | 'permitted'
export interface SharedLureColor {
  id: string
  familyKey: string
  colorName: string
  colorCode: string
  aliases: string[]
  colorVerificationStatus: 'catalog-match' | 'review-needed'
  imageId?: string
  externalProductUrl?: string
  externalVerified?: boolean
  sourceName: string
  imageAvailability: 'local' | 'external' | 'none'
  verificationStatus: 'verified' | 'unverified'
  rightsStatus: PhotoRights | 'unknown'
  lastCheckedAt: string
}
export interface LureColorPhotoLink {
  variantId: number
  sharedColorId: string
  /** Full parent/name identity protects against ID reuse after old JSON restores. */
  identity: string
}
export interface LureColorPhoto {
  id: string
  sharedColorId: string
  variantId?: number
  variantIdentity?: string
  imageType: PhotoFace
  imageAvailability: 'local' | 'external'
  blobId?: string
  externalProductUrl?: string
  sourceUrl: string
  sourceName: string
  rightsStatus: PhotoRights | 'unknown'
  rightsNote: string
  verificationStatus: 'verified' | 'unverified'
  updatedAt: string
  revision: number
}
export interface LurePhotoBlob {
  id: string
  blob: Blob
  width: number
  height: number
}
