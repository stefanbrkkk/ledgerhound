import assert from "node:assert/strict";
import { test } from "node:test";
import handler from "../api/request.js";

// Exercise the actual Vercel handler without sending mail or retaining test PII.
delete process.env.RESEND_API_KEY;
delete process.env.NOTIFY_EMAIL;
let sequence = 0;
async function submit(body, headers = {}) {
  const req = { method: "POST", headers: { host: "example.test", "x-forwarded-for": `192.0.2.${++sequence}`, ...headers }, body };
  const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
  const log = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args);
  try { await handler(req, res); } finally { console.log = log; }
  res.logs = logs;
  return res;
}

test("pre-parsed objects cannot bypass the 4 KiB limit", async () => {
  assert.equal((await submit({ email: "test@example.test", firm: "x".repeat(5000) })).statusCode, 413);
});
test("raw UTF-8 bodies count bytes rather than characters", async () => {
  assert.equal((await submit(JSON.stringify({ email: "test@example.test", firm: "ć".repeat(2100) }))).statusCode, 413);
});
test("declared oversize requests are rejected", async () => {
  assert.equal((await submit({ email: "test@example.test" }, { "content-length": "5000" })).statusCode, 413);
});
test("JSON null is a bad request rather than a handler crash", async () => {
  assert.equal((await submit("null")).statusCode, 400);
});
test("valid same-origin forms and honeypots retain their response contract", async () => {
  assert.deepEqual((await submit({ email: "test@example.test", firm: "Test firm" }, { origin: "https://example.test" })).body, { ok: true, notified: false });
  assert.deepEqual((await submit({ website: "bot" })).body, { ok: true, notified: false });
  assert.equal((await submit({ email: "test@example.test" }, { origin: "https://other.test" })).statusCode, 403);
  assert.equal((await submit("{" )).statusCode, 400);
  assert.equal((await submit({ email: "invalid" })).statusCode, 422);
});


test("successful email delivery does not duplicate contact data into logs", async () => {
  const previousFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-only-placeholder";
  process.env.NOTIFY_EMAIL = "operator@example.test";
  globalThis.fetch = async () => ({ ok: true });
  try {
    const response = await submit({ email: "test@example.test", firm: "Test firm" });
    assert.deepEqual(response.body, { ok: true, notified: true });
    assert.equal(response.logs.some((args) => JSON.stringify(args).includes("test@example.test")), false);
  } finally {
    globalThis.fetch = previousFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFY_EMAIL;
  }
});
