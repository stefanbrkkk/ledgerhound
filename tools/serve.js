// Local server that mirrors the production deployment: it applies the real
// headers from vercel.json (including the strict CSP), resolves clean URLs, and
// serves the 404 page for unknown paths. Testing against plain `http.server`
// hides CSP failures, so the test suite always runs against this.
//
//   node tools/serve.js [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8123);

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml"
};

function headersFor(pathname) {
  const out = [];
  for (const rule of cfg.headers || []) {
    // vercel.json sources are path patterns; the few used here are simple
    // enough to translate directly into a regular expression.
    const re = new RegExp("^" + rule.source.replace(/\//g, "\\/").replace(/\(\.\*\)/g, ".*") + "$");
    if (re.test(pathname)) out.push(...rule.headers);
  }
  return out;
}

// Stand-in for the serverless function so end-to-end form tests have a real
// endpoint. Mirrors api/request.js's contract, not its delivery.
function handleApi(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "POST only" }));
  }
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "bad json" }));
    }
    if (String(body.website || "").trim()) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, notified: false }));
    }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(body.email || "").trim());
    res.writeHead(ok ? 200 : 422, { "Content-Type": "application/json" });
    res.end(JSON.stringify(ok ? { ok: true, notified: false } : { error: "invalid email" }));
  });
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  for (const h of headersFor(pathname)) res.setHeader(h.key, h.value);

  if (pathname === "/api/request") return handleApi(req, res);

  // Refuse to serve anything outside the project root.
  let file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("forbidden");
  }

  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  } catch {
    if (fs.existsSync(file + ".html")) file = file + ".html"; // cleanUrls
  }
  if (!fs.existsSync(file)) {
    file = path.join(ROOT, "404.html");
    res.statusCode = 404;
  }
  res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});

export function start(port = PORT) {
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] && process.argv[1].endsWith("serve.js")) {
  start().then(() => console.log(`Ledgerhound (production-parity) → http://127.0.0.1:${PORT}`));
}
