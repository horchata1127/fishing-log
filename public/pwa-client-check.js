// A suspended/hidden window counts too. Never activate while another app window exists.
self.addEventListener('message', event => {
  if (!['FISHING_LOG_CLIENTS', 'FISHING_LOG_UPDATE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => new URL(client.url).pathname.startsWith('/fishing-log/'));
    const safe = windows.length === 1 && windows[0].id === event.source?.id;
    event.ports[0]?.postMessage({ safe });
    if (safe && event.data.type === 'FISHING_LOG_UPDATE') await self.skipWaiting();
  })());
});
