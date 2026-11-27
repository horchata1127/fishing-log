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
  product?: { url: string; verified: boolean }
  image?: {
    url: string
    kind: 'product-photo' | 'official-color-sample' | 'weight-common-color-sample'
    conditions: 'permitted' | 'held' | 'unknown'
    conditionsEvidence?: string
    decoded: boolean
    verifiedHost: string
    holdReason?: string
  }
  sourceName: string
  sourceType: 'manufacturer' | 'retailer'
  checkedAt: string
  evidenceUrl: string
  verificationBasis: string
}

// RC47-A introduces the contract. Reviewed references are added in later releases.
export const lureExternalReferences: readonly LureExternalReference[] = []
