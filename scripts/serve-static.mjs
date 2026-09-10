/**
 * Static file server for the exported site.
 *
 * `next start` cannot serve a static export, so this serves `out/` — the same
 * files the deployment target serves from nginx, which keeps local and
 * deployed behaviour identical.
 */

import { createServer } from "node:http"
import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"

const ROOT = new URL("../out/", import.meta.url).pathname
const PORT = Number(process.env.PORT ?? 3999)

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
}

if (!existsSync(ROOT)) {
  console.error(`No export found at ${ROOT}. Run \`npm run build\` first.`)
  process.exit(1)
}

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0])
  // Contain the path: a request may not escape the export directory.
  let file = join(ROOT, normalize(url).replace(/^(\.\.[/\\])+/, ""))

  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html")
  if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`
  // Unknown paths fall back to the 404 page the export produced.
  if (!existsSync(file)) file = join(ROOT, "404.html")
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" })
    return res.end("Not found")
  }

  const type = TYPES[extname(file)] ?? "application/octet-stream"
  const immutable = file.includes("/_next/static/")
  res.writeHead(200, {
    "content-type": type,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  })
  createReadStream(file).pipe(res)
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`))
