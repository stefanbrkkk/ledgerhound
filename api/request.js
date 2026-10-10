// Vercel serverless function — founding / demo-gate request intake.
//
//   POST /api/request  { email, firm?, plan?, source?, tag?, website? }
//
// If RESEND_API_KEY + NOTIFY_EMAIL are set the request is emailed onward.
// Otherwise it is written to the function log, which is the queue of record
// until email delivery is configured — the client also keeps a local copy.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = 4096;
const RATE_LIMIT = 8; // requests per window, per IP
const RATE_WINDOW_MS = 60_000;

// Best-effort burst control. A serverless instance is ephemeral and there may
// be several, so this throttles abuse on a warm instance rather than acting as
// a strong guarantee; put a WAF / platform rate limit in front for that.
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear(); // bound memory
    return false;
  }
  rec.n += 1;
  return rec.n > RATE_LIMIT;
}

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST only" });
    return;
  }

  // Same-origin only: the browser sends Origin on cross-site POSTs, so a
  // mismatch is a request this form never made.
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }
    if (!originHost || originHost !== host) {
      res.status(403).json({ error: "cross-origin request rejected" });
      return;
    }
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "too many requests" });
    return;
  }

  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    res.status(413).json({ error: "body too large" });
    return;
  }

  let body;
  try {
    if (typeof req.body === "object" && req.body !== null) {
      // Vercel can hand us an already parsed JSON object. Apply the same
      // byte ceiling to that path instead of silently bypassing the limit.
      if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > MAX_BODY_BYTES) {
        res.status(413).json({ error: "body too large" });
        return;
      }
      body = req.body;
    } else {
      const raw = String(req.body || "");
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
        res.status(413).json({ error: "body too large" });
        return;
      }
      body = JSON.parse(raw || "{}");
    }
  } catch {
    res.status(400).json({ error: "bad json" });
    return;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "bad json" });
    return;
  }

  // Server-side honeypot. The client hides this field; a real person never
  // fills it, and a bot posting directly is filtered here rather than only in
  // the browser. Answer 200 so the bot learns nothing.
  if (clean(body.website, 200)) {
    res.status(200).json({ ok: true, notified: false });
    return;
  }

  const email = clean(body.email, 200);
  if (!EMAIL_RE.test(email)) {
    res.status(422).json({ error: "invalid email" });
    return;
  }

  const record = {
    email,
    firm: clean(body.firm, 120),
    plan: clean(body.plan, 40) || "founding",
    source: clean(body.source, 60) || "site",
    tag: clean(body.tag, 60),
    ts: new Date().toISOString()
  };

  const key = process.env.RESEND_API_KEY;
  const notify = process.env.NOTIFY_EMAIL;
  let delivered = false;

  if (key && notify) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM || "Ledgerhound <onboarding@resend.dev>",
          to: [notify],
          subject: `Ledgerhound request — ${record.plan === "founding" ? "FOUNDING" : record.plan} · ${record.firm || record.email}`,
          text: [
            "New request on ledgerhound",
            "",
            `Type:   ${record.plan}${record.tag ? ` (${record.tag})` : ""}`,
            `Email:  ${record.email}`,
            `Firm:   ${record.firm || "-"}`,
            `Source: ${record.source}`,
            `When:   ${record.ts}`
          ].join("\n")
        })
      });
      delivered = r.ok;
      if (!r.ok) console.error("LEDGERHOUND_RESEND_FAILED status=%s", r.status);
    } catch {
      console.error("LEDGERHOUND_RESEND_ERROR");
    }
  }

  if (delivered) {
    // Delivery is the durable copy; diagnostic logs need no contact payload.
    console.log("LEDGERHOUND_REQUEST notified");
  } else {
    // Existing fallback queue of record. Removing this payload would silently
    // lose requests until deployment has a durable inbox/outbox configured.
    console.log("LEDGERHOUND_REQUEST %s queued-only", JSON.stringify(record));
  }
  res.status(200).json({ ok: true, notified: delivered });
}
