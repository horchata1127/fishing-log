import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
const root = resolve('dist')
let version = 'A'
let missingHits = 0
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4188')
  if (url.pathname === '/__test/version' && req.method === 'POST') {
    version = url.searchParams.get('v') ?? 'A'; missingHits = 0; res.end('ok'); return
  }
  if (url.pathname === '/__test/status') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ missingHits })); return }
  if (!url.pathname.startsWith('/fishing-log/')) { res.writeHead(404); res.end('outside scope'); return }
  const name = url.pathname.slice('/fishing-log/'.length) || 'index.html'
  if (name === 'missing-update.js') missingHits++
  const path = resolve(root, name)
  if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return }
  try {
    let content = await readFile(path)
    if (name === 'index.html') content = Buffer.from(content.toString().replace('</head>', `<meta name="test-version" content="${version}"></head>`))
    if (name === 'sw.js') {
      let script = content.toString().replace(/url:"index.html",revision:"([^"]+)"/, `url:"index.html",revision:"$1-${version}"`)
      if (version === 'broken') script = script.replace('precacheAndRoute([', 'precacheAndRoute([{url:"missing-update.js",revision:"broken"},')
      content = Buffer.from(script + `\n// test version ${version}\n`)
    }
    res.writeHead(200, { 'Content-Type': mime[extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content)
  } catch { res.writeHead(404); res.end('missing') }
}).listen(4188, '127.0.0.1')
