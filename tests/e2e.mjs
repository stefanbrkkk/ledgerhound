// End-to-end behaviour: every control, the full demo flow, the request form's
// success and failure paths, link integrity, and the three degraded modes that
// must still render a complete page (no JS, blocked vendor scripts, reduced
// motion).
import { startServer, launch, watchConsole, Recorder, BASE, PAGES } from "./lib.mjs";

export default async function run() {
  const server = await startServer();
  const browser = await launch();
  const t = Recorder("e2e");

  try {
    /* ── 1. links and anchors resolve ── */
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const bad = [];
      for (const p of [...PAGES, "/404.html"]) {
        await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
        const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
        const ids = await page.$$eval("[id]", (es) => es.map((e) => e.id));
        for (const h of hrefs) {
          if (h.startsWith("#")) {
            if (h.length > 1 && !ids.includes(h.slice(1))) bad.push(`${p} → ${h}`);
          } else if (!h.startsWith("mailto:") && !h.startsWith("http")) {
            const r = await page.request.get(BASE + h.split("#")[0]);
            if (r.status() >= 400) bad.push(`${p} → ${h} = ${r.status()}`);
          }
        }
      }
      t.check("every link and anchor resolves", bad.length === 0, bad.join(", "));
      t.check("unknown path returns 404",
        (await page.request.get(BASE + "/definitely-not-here")).status() === 404);
      await ctx.close();
    }

    /* ── 2. the demo, end to end ── */
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const errs = [];
      watchConsole(page, errs);
      await page.goto(BASE + "/#demo", { waitUntil: "networkidle" });
      await page.waitForTimeout(600);

      t.check("six sample emails render", (await page.$$("#mails .mail")).length === 6);
      t.check("checklist renders eight documents", (await page.$$("#cl-list .cl-row")).length === 8);

      // generating with an empty inbox explains itself instead of printing junk
      await page.click("#dm-gen");
      await page.waitForTimeout(200);
      t.check("empty inbox is explained",
        (await page.$eval("#chase-out", (e) => e.textContent)).includes("empty inbox"));

      // forward one email
      await page.click('.mail-fwd[data-i="0"]');
      await page.waitForTimeout(200);
      t.check("forwarding marks the email", (await page.$$("#mails .mail.is-fwd")).length === 1);
      t.check("forward count updates",
        (await page.$eval("#dm-count", (e) => e.textContent)).startsWith("1 / 6"));

      await page.click("#dm-all");
      await page.waitForTimeout(250);
      t.check("forward-all forwards everything",
        (await page.$$("#mails .mail.is-fwd")).length === 6);
      t.check("forward-all disables once complete",
        await page.$eval("#dm-all", (e) => e.disabled));
      t.check("checklist shows six received",
        (await page.$eval("#cl-count", (e) => e.textContent)) === "6 received");

      await page.click("#dm-gen");
      await page.waitForTimeout(1400);
      const chase = await page.$eval("#chase-out", (e) => e.innerText);
      const drafts = await page.$eval("#drafts", (e) => e.innerText);

      // the regression that mattered most: every row was once "Unassigned client"
      t.check("no unassigned clients in the chase list", !/Unassigned/i.test(chase), chase.slice(0, 120));
      t.check("no unassigned clients in the drafts", !/Unassigned/i.test(drafts));
      t.check("chase list names real clients",
        /Harbor Dental/.test(chase) && /Wren Fabrication/.test(chase), chase.slice(0, 160));
      t.check("missing documents are the two undelivered ones",
        /Loan statement/.test(chase) && /1099/.test(chase));
      t.check("two drafts, addressed to the two owing clients",
        (await page.$$("#drafts .draft")).length === 2 &&
        /to Harbor Dental/i.test(drafts) && /to Wren Fabrication/i.test(drafts));
      t.check("chase rows are all revealed",
        await page.$$eval("#chase-out li", (ls) => ls.every((l) => l.classList.contains("show"))));

      // the week label is computed, not frozen at "Week 36"
      const week = await page.$eval("#chase-week", (e) => e.textContent);
      const expected = (() => {
        const d = new Date();
        const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
        const ys = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
        return Math.ceil((((x - ys) / 86400000) + 1) / 7);
      })();
      t.check("week number is computed from today", week.includes(`Week ${expected}`), week);

      // reset must not hand back free runs
      const runsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("lh_demo_v1")).runs);
      await page.click("#dm-reset");
      await page.waitForTimeout(300);
      const runsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("lh_demo_v1")).runs);
      t.check("reset clears the inbox", (await page.$$("#mails .mail.is-fwd")).length === 0);
      t.check("reset does not refund free runs", runsAfter === runsBefore, `${runsBefore} → ${runsAfter}`);

      // burn the remaining runs and meet the gate
      for (let i = 0; i < 4; i++) {
        await page.click("#dm-all");
        await page.waitForTimeout(120);
        await page.click("#dm-gen");
        await page.waitForTimeout(200);
        await page.click("#dm-reset");
        await page.waitForTimeout(200);
      }
      await page.click("#dm-all");
      await page.waitForTimeout(120);
      await page.click("#dm-gen");
      await page.waitForTimeout(300);
      t.check("gate appears after the free runs", await page.evaluate(() =>
        !document.querySelector("#gate").hidden));

      // invalid then valid unlock
      await page.fill("#gate-email", "nope");
      await page.click('#gate-form button[type="submit"]');
      await page.waitForTimeout(200);
      t.check("gate rejects an invalid email",
        await page.evaluate(() => !document.querySelector("#gate-email-err").hidden));
      await page.fill("#gate-email", "hello@brightline.example");
      await page.click('#gate-form button[type="submit"]');
      await page.waitForTimeout(300);
      t.check("gate unlocks", await page.evaluate(() =>
        /Unlocked/.test(document.querySelector("#gate").textContent)));
      await page.click("#gate .gate-card button");
      await page.waitForTimeout(400);
      t.check("generating works again after unlock",
        await page.evaluate(() => !document.querySelector("#chasecard").hidden));

      // state survives a reload
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      t.check("unlock state persists across reload", await page.evaluate(() =>
        JSON.parse(localStorage.getItem("lh_demo_v1")).unlocked === true));

      t.check("demo produced no console output", errs.length === 0, errs.slice(0, 3).join(" | "));
      await ctx.close();
    }

    /* ── 3. the request form ── */
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const errs = [];
      watchConsole(page, errs);
      await page.goto(BASE + "/#request", { waitUntil: "networkidle" });

      await page.click('#req-form button[type="submit"]');
      await page.waitForTimeout(200);
      t.check("empty submit is rejected inline",
        (await page.$eval("#req-status", (e) => e.textContent)).includes("work email"));

      await page.fill("#rq-email", "not-an-email");
      await page.click('#req-form button[type="submit"]');
      await page.waitForTimeout(200);
      t.check("malformed email is rejected",
        await page.$eval("#req-status", (e) => e.classList.contains("is-err")));

      await page.fill("#rq-email", "owner@brightline.example");
      await page.fill("#rq-firm", "Brightline Bookkeeping");
      await page.click('#req-form button[type="submit"]');
      await page.waitForTimeout(700);
      t.check("valid submit is accepted",
        /Request received/.test(await page.$eval("#req-status", (e) => e.textContent)));
      t.check("form clears after a successful submit",
        (await page.$eval("#rq-email", (e) => e.value)) === "");

      t.check("form flow produced no console output", errs.length === 0, errs.slice(0, 3).join(" | "));

      // Network failure must degrade to the mailto fallback. Aborting the route
      // is itself a network error, so stop asserting console silence past here.
      errs.length = 0;
      await page.route("**/api/request", (r) => r.abort());
      await page.fill("#rq-email", "owner2@brightline.example");
      await page.click('#req-form button[type="submit"]');
      await page.waitForTimeout(700);
      const status = await page.$eval("#req-status", (e) => e.innerHTML);
      t.check("network failure offers a mailto fallback", /mailto:/.test(status));
      t.check("failed request is queued locally", await page.evaluate(() =>
        JSON.parse(localStorage.getItem("lh_requests_v1") || "[]").length > 0));
      t.check("submit button is re-enabled after failure",
        !(await page.$eval('#req-form button[type="submit"]', (e) => e.disabled)));
      await ctx.close();
    }

    /* ── 4. FAQ and navigation ── */
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const n = (await page.$$(".qa")).length;
      for (let i = 0; i < n; i++) {
        await page.click(`.qa:nth-of-type(${i + 1}) summary`);
      }
      await page.waitForTimeout(200);
      t.check("every FAQ item opens",
        (await page.$$eval(".qa", (qs) => qs.filter((q) => q.open).length)) === n);
      await ctx.close();
    }

    /* ── 5. degraded modes: nothing may be left invisible ── */
    const hiddenCount = (page) => page.evaluate(() =>
      [...document.querySelectorAll("[data-motion], .beat, .dm, .dr, .ticker, .exhibit, .tier, .step")]
        .filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.5).length);

    {
      // (a) JavaScript disabled entirely
      const ctx = await browser.newContext({ javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "load" });
      t.check("no-JS: nothing is invisible", (await hiddenCount(page)) === 0);
      t.check("no-JS: the device still shows its finished state",
        (await page.$$("#drows .dr.on")).length === 6);
      t.check("no-JS: the ticker shows the real number",
        (await page.$eval("#ticker-num", (e) => e.textContent)).trim() === "261,000");
      await ctx.close();
    }
    {
      // (b) the GSAP bundle fails to load
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.route("**/vendor/*.js", (r) => r.abort());
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.waitForTimeout(800);
      t.check("GSAP blocked: nothing is invisible", (await hiddenCount(page)) === 0);
      t.check("GSAP blocked: the demo still works",
        (await page.$$("#mails .mail")).length === 6);
      await ctx.close();
    }
    {
      // (c) reduced motion
      const ctx = await browser.newContext({ reducedMotion: "reduce" });
      const page = await ctx.newPage();
      const errs = [];
      watchConsole(page, errs);
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      t.check("reduced motion: nothing is invisible", (await hiddenCount(page)) === 0);
      t.check("reduced motion: no animation class applied",
        !(await page.evaluate(() => document.documentElement.classList.contains("js-motion"))));
      t.check("reduced motion: console silent", errs.length === 0, errs.slice(0, 2).join(" | "));
      await ctx.close();
    }
    {
      // (d) deep links must not strand any section mid-reveal once the reader
      //     has scrolled through the page
      for (const hash of ["#faq", "#founding", "#demo"]) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(BASE + "/" + hash, { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        await page.evaluate(async () => {
          // The page sets scroll-behavior: smooth, so a plain scrollTo loop
          // keeps retargeting an in-flight animation and never traverses.
          const step = window.innerHeight * 0.8;
          for (let y = 0; y <= document.body.scrollHeight; y += step) {
            window.scrollTo({ top: y, behavior: "instant" });
            await new Promise((r) => setTimeout(r, 120));
          }
          window.scrollTo({ top: 0, behavior: "instant" });
          await new Promise((r) => setTimeout(r, 200));
        });
        await page.waitForTimeout(1200);
        t.check(`deep link ${hash}: nothing left invisible after scrolling`,
          (await hiddenCount(page)) === 0);
        await ctx.close();
      }
    }

    /* ── 6. the API contract ── */
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const get = await page.request.get(BASE + "/api/request");
      t.check("GET /api/request is rejected", get.status() === 405);
      const bad = await page.request.post(BASE + "/api/request", { data: { email: "x" } });
      t.check("invalid email is rejected", bad.status() === 422);
      const hp = await page.request.post(BASE + "/api/request",
        { data: { email: "a@b.co", website: "spam" } });
      t.check("honeypot is enforced server-side", hp.status() === 200);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  return t.report();
}

if (process.argv[1]?.endsWith("e2e.mjs")) {
  run().then((r) => process.exit(r.failed ? 1 : 0));
}
