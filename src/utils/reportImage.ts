export async function renderReportPng(element: HTMLElement): Promise<Blob> {
  await document.fonts.ready
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, {
    width: 1080, height: 1350, scale: 1, backgroundColor: '#f4f8f5', logging: false,
    windowWidth: 1200, windowHeight: 1600, scrollX: 0, scrollY: 0,
    onclone(document) {
      const stage = document.querySelector<HTMLElement>('[data-report-stage]')
      if (stage) { stage.style.left = '0'; stage.style.top = '0' }
    },
  })
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNGを生成できませんでした。もう一度お試しください。')), 'image/png'))
}
export function downloadReport(file: File, existingUrl?: string) {
  const url = existingUrl ?? URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url; link.download = file.name
  document.body.appendChild(link)
  try { link.click() }
  finally { link.remove(); if (!existingUrl) setTimeout(() => URL.revokeObjectURL(url), 60000) }
}
/** Call directly from a second user click, after PNG generation has completed. */
export async function shareReport(file: File, text: string, existingUrl?: string): Promise<'shared' | 'cancelled' | 'downloaded'> {
  try {
    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Fishing Log', text })
      return 'shared'
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
  }
  downloadReport(file, existingUrl)
  return 'downloaded'
}
