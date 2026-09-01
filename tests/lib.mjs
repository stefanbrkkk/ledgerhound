// Shared test scaffolding: a production-parity server, a browser pinned to the
// preinstalled Chromium, and a tiny assertion recorder.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PORT = Number(process.env.PORT || 8181);
export const BASE = `http://127.0.0.1:${PORT}`;
export const PAGES = ["/", "/privacy", "/terms", "/refund", "/security"];

// The sandbox ships a Chromium that may not match playwright's pinned build.
// Prefer it when present, otherwise fall back to playwright's own download.
const PINNED = "/opt/pw-browsers/chromium";
export function launch(opts = {}) {
  const executablePath = fs.existsSync(PINNED) ? PINNED : undefined;
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), ...opts });
}

export async function startServer() {
  const proc = spawn(process.execPath, [path.join(ROOT, "tools", "serve.js"), String(PORT)], {
    cwd: ROOT,
    stdio: "ignore"
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE + "/");
      if (r.ok) return proc;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("server did not start");
}

// Console errors, page errors, failed requests and CSP violations are all
// failures — the site must be silent in a real browser.
export function watchConsole(page, sink, { allowWarnings = false } = {}) {
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || (!allowWarnings && t === "warning")) sink.push(`[${t}] ${m.text()}`);
  });
  page.on("pageerror", (e) => sink.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    if (f && !/ERR_ABORTED/.test(f.errorText)) sink.push(`[requestfailed] ${r.url()} :: ${f.errorText}`);
  });
  page.on("response", (r) => { if (r.status() >= 400) sink.push(`[http ${r.status()}] ${r.url()}`); });
}

export function Recorder(title) {
  const results = [];
  return {
    check(name, ok, detail = "") {
      results.push({ name, ok: !!ok, detail });
      if (!ok) console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
    },
    report() {
      const failed = results.filter((r) => !r.ok);
      console.log(`${failed.length ? "FAIL" : "PASS"}  ${title}: ${results.length - failed.length}/${results.length}`);
      return { total: results.length, failed: failed.length, failures: failed };
    }
  };
}
