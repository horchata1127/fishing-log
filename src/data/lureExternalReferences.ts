import { rodioExternalReferences } from './rodioExternalReferences'

export interface ExternalModelDetails {
  weightG?: number
  lengthMm?: number
  actionType?: string
  buoyancy?: string
  rattle?: string
}

export interface LureExternalReference {
  manufacturerName: string
  seriesName: string
  modelName: string
  modelDetails: ExternalModelDetails
  colorName: string
  colorCode?: string
  colorAliases?: readonly string[]
  product?: { url: string; verified: boolean; kind?: 'individual-color' | 'model-color-list' }
  image?: {
    url: string
    kind: 'product-photo' | 'official-color-sample' | 'weight-common-color-sample'
    conditions: 'permitted' | 'held' | 'unknown'
    conditionsEvidence?: string
    decoded: boolean
    verifiedHost: string
    holdReason?: string
  }
  propertyEvidence?: string
  sourceName: string
  sourceType: 'manufacturer' | 'retailer'
  checkedAt: string
  evidenceUrl: string
  verificationBasis: string
}

export const lureExternalReferences: readonly LureExternalReference[] = rodioExternalReferences
