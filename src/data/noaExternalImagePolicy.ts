/** Source-specific review; never treat a successful HTTP response as permission. */
export function externalImageHoldReason(sourceName: string): string | undefined {
  if (sourceName === 't-Route') return '出典の利用規約により許諾確認待ち'
  if (sourceName === 'オープンウォーター' || sourceName === 'ウインズ') return '出典の利用条件について許諾確認待ち'
  if (!['城峰釣具店', 'JOINTER / WILD-1'].includes(sourceName)) return '出典の利用条件未確認'
}
