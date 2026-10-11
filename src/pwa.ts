import { reactive } from 'vue'
import { registerSW } from 'virtual:pwa-register'

export const offline = reactive({
  enabled: import.meta.env.PROD, installed: false, controlled: false,
  failed: false, updating: false, updateAvailable: false,
  online: navigator.onLine, message: '',
})
let registration: ServiceWorkerRegistration | undefined

function checkController() { offline.controlled = !!navigator.serviceWorker?.controller }
function request(worker: ServiceWorker, type: string): Promise<boolean> {
  return new Promise(resolve => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => { channel.port1.close(); resolve(false) }, 3000)
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close(); resolve(event.data?.safe === true)
    }
    worker.postMessage({ type }, [channel.port2])
  })
}

export function setupOffline() {
  if (!offline.enabled) return
  window.addEventListener('online', () => { offline.online = true })
  window.addEventListener('offline', () => { offline.online = false })
  if (!('serviceWorker' in navigator)) { offline.failed = true; return }
  checkController()
  navigator.serviceWorker.addEventListener('controllerchange', checkController)
  registerSW({
    immediate: true,
    onOfflineReady() { offline.installed = true },
    onNeedRefresh() { offline.updateAvailable = !!registration?.waiting },
    // Workbox can emit controlling for external updates: never reload from that event.
    onNeedReload() { checkController() },
    onRegisterError() { offline.failed = true },
    onRegisteredSW(_url, value) {
      registration = value
      const inspect = () => {
        if (value?.active?.state === 'activated') offline.installed = true
        offline.updateAvailable = !!value?.waiting && value.waiting.state === 'installed'
        checkController()
      }
      const monitor = (worker: ServiceWorker | null | undefined) => worker?.addEventListener('statechange', () => {
        inspect()
        if (worker.state === 'redundant' && !value?.active) offline.failed = true
      })
      inspect()
      monitor(value?.installing)
      value?.addEventListener('updatefound', () => monitor(value.installing))
    },
  })
}

// Called only from the safe home screen. Failure to prove exclusivity defers the update.
export async function applyOfflineUpdate(isSafe: () => boolean) {
  if (!isSafe() || offline.updating || !registration) return
  offline.updating = true
  offline.message = ''
  try {
    const worker = registration.waiting ?? registration.active
    if (!worker || !await request(worker, 'FISHING_LOG_CLIENTS') || !isSafe()) {
      offline.message = '更新を延期しました。他のFishing Log画面を閉じてからお試しください。'
      return
    }
    if (registration.waiting) {
      const pendingWorker = worker
      const activated = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { worker.removeEventListener('statechange', change); reject(new Error('更新を確認できませんでした。後でお試しください。')) }, 10000)
        function change() {
          if (pendingWorker.state === 'activated') { clearTimeout(timer); pendingWorker.removeEventListener('statechange', change); resolve() }
        }
        worker.addEventListener('statechange', change)
      })
      // The waiting worker checks windows again before the explicit skipWaiting.
      if (!await request(worker, 'FISHING_LOG_UPDATE')) {
        void activated.catch(() => {})
        offline.message = '更新を延期しました。他のFishing Log画面を閉じてください。'
        return
      }
      await activated
    }
    if (isSafe()) window.location.reload()
  } catch (error) {
    offline.message = error instanceof Error ? error.message : '準備を確認できませんでした。'
  } finally { offline.updating = false }
}
