export type TackleField = {
  key: string
  label: string
  number?: boolean
  options?: 'rods' | 'reels' | 'lines' | 'materials'
  required?: boolean
}

/** Vue number inputs produce numbers; select/text inputs produce strings. */
export function normalizeTackleField(value: unknown, field: TackleField): string | number | undefined {
  const cleaned = typeof value === 'string' ? value.trim() : value
  if (cleaned === undefined || cleaned === null || cleaned === '') {
    if (field.required) throw new Error(`${field.label}: 入力が必要です。`)
    return undefined
  }
  if (field.number || (field.options && field.options !== 'materials')) {
    if (typeof cleaned !== 'number' && typeof cleaned !== 'string') {
      throw new Error(`${field.label}: 数値が必要です。`)
    }
    const numeric = typeof cleaned === 'number' ? cleaned : Number(cleaned)
    if (!Number.isFinite(numeric) || numeric <= 0) throw new Error(`${field.label}: 正の数を入力してください。`)
    return numeric
  }
  if (typeof cleaned !== 'string') throw new Error(`${field.label}: 文字列が必要です。`)
  return cleaned
}
