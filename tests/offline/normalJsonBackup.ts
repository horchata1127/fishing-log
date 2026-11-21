import { expect } from '@playwright/test'

/** Legacy JSON regression fixtures contain no photos/maps. Verify that before projecting optional stores. */
export function expectedNormalJson(state: Record<string, any[]>, version: number) {
  const result = { ...state }
  for (const name of ['sharedLureColors', 'lureColorPhotoLinks', 'lureColorPhotos', 'lurePhotoBlobs']) {
    expect(result[name] ?? [], `legacy fixture ${name}`).toEqual([])
    delete result[name]
  }
  if (version < 12) { expect(result.areaMaps ?? []).toEqual([]); delete result.areaMaps }
  if (version < 9) { expect(result.lureMasterImportHistory ?? []).toEqual([]); delete result.lureMasterImportHistory }
  return result
}
