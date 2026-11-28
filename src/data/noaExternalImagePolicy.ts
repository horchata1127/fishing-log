// Add a source only when reviewed evidence covers in-app display of its entire candidate set.
const approvedDisplayEvidence: ReadonlyMap<string, string> = new Map()

export function externalImageHoldReason(sourceName: string): string | undefined {
  if (approvedDisplayEvidence.get(sourceName)?.trim()) return undefined
  if (sourceName === '城峰釣具店' || sourceName === 'JOINTER / WILD-1') return 'アプリ内画像表示の明示許諾未確認'
  if (sourceName === 't-Route') return '出典の利用規約により許諾確認待ち'
  if (sourceName === 'オープンウォーター' || sourceName === 'ウインズ') return '出典の利用条件について許諾確認待ち'
  return '出典の利用条件未確認'
}
