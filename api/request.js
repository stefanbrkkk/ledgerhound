// Vercel serverless function — founding/demogate request intake.
// POST /api/request  { email, firm?, plan?, source?, tag? }
// If RESEND_API_KEY + NOTIFY_EMAIL env vars are set, sends a notification email.
// Otherwise returns ok and logs — submissions are never lost silently (client queues too).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  let body = {};
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch (e) {
    res.status(400).json({ error: "bad json" });
    return;
  }
  const email = String(body.email || "").trim().slice(0, 200);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!EMAIL_RE.test(email)) {
    res.status(422).json({ error: "invalid email" });
    return;
  }
  const record = {
    email,
    firm: String(body.firm || "").trim().slice(0, 120),
    plan: String(body.plan || "").trim().slice(0, 40) || "founding",
    source: String(body.source || "site").trim().slice(0, 60),
    tag: String(body.tag || "").trim().slice(0, 60),
    ts: new Date().toISOString(),
    ua: String(req.headers["user-agent"] || "").slice(0, 160)
  };

  const key = process.env.RESEND_API_KEY;
  const notify = process.env.NOTIFY_EMAIL;
  let delivered = false;
  if (key && notify) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM || "Ledgerhound <onboarding@resend.dev>",
          to: [notify],
          subject: "Ledgerhound request — " + (record.plan === "founding" ? "FOUNDING" : record.plan) + " · " + (record.firm || record.email),
          text:
            "New request on ledgerhound\n\n" +
            "Type:   " + record.plan + (record.tag ? " (" + record.tag + ")" : "") + "\n" +
            "Email:  " + record.email + "\n" +
            "Firm:   " + (record.firm || "-") + "\n" +
            "Source: " + record.source + "\n" +
            "When:   " + record.ts + "\n"
        })
      });
      delivered = r.ok;
    } catch (e) {
      delivered = false;
    }
  }

  console.log("LEDGERHOUND_REQUEST " + JSON.stringify(record) + (delivered ? " notified" : " queued-only"));
  res.status(200).json({ ok: true, notified: delivered });
}
