// Layout integrity: no horizontal overflow at any width, the design system is
// actually applied (fonts loaded, no stray sizes), the scroll rig plays through
// its whole range, and layout shift stays negligible.
import fs from "node:fs";
import path from "node:path";
import { startServer, launch, Recorder, BASE, ROOT } from "./lib.mjs";

const WIDTHS = [320, 360, 390, 414, 480, 640, 768, 834, 1024, 1180, 1280, 1440, 1728, 1920, 2560];
const SHOTS = path.join(ROOT, "test-results");

export default async function run({ screenshots = false } = {}) {
  const server = await startServer();
  const browser = await launch();
  const t = Recorder("visual");
  if (screenshots) fs.mkdirSync(SHOTS, { recursive: true });

  try {
    /* ── 1. no horizontal overflow, any width ── */
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto(BASE + "/", { waitUntil: "networkidle" });
        await page.waitForTimeout(200);
        const r = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth
        }));
        t.check(`no horizontal overflow @${w}`, r.scrollW <= r.clientW + 1,
          `scrollWidth ${r.scrollW} > clientWidth ${r.clientW}`);
        if (screenshots) {
          await page.screenshot({ path: path.join(SHOTS, `w-${w}.png`), fullPage: w <= 480 });
        }
      }
      await ctx.close();
    }

    /* ── 2. the design system is actually in force ── */
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(3400); // the ticker count-up ends at ~2.7s

      t.check("all six font faces load",
        (await page.evaluate(() => document.fonts.size)) === 6,
        String(await page.evaluate(() => document.fonts.size)));
      t.check("headings render in Bricolage Grotesque",
        await page.evaluate(() => document.fonts.check('700 40px "Bricolage Grotesque"')));
      t.check("body renders in Figtree",
        await page.evaluate(() => document.fonts.check('420 17px "Figtree"')));
      t.check("functional text renders in JetBrains Mono",
        await page.evaluate(() => document.fonts.check('600 11px "JetBrains Mono"')));

      // the hero statistic must be visible — it was once permanently at opacity 0
      t.check("hero ticker is visible",
        (await page.$eval(".ticker", (e) => parseFloat(getComputedStyle(e).opacity))) === 1);
      t.check("hero ticker shows the final number",
        (await page.$eval("#ticker-num", (e) => e.textContent)).trim() === "261,000");

      // every declared font-size resolves to a scale token
      const scale = await page.evaluate(() => {
        const toks = ["--t-3xs", "--t-2xs", "--t-xs", "--t-sm", "--t-base", "--t-md",
          "--t-lg", "--t-xl", "--t-2xl", "--t-3xl", "--t-4xl", "--t-5xl", "--t-num"];
        // Several tokens are clamp() expressions, so resolve each by measuring a
        // probe element rather than parsing the declaration.
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        document.body.appendChild(probe);
        const allowed = new Set(toks.map((k) => {
          probe.style.fontSize = `var(${k})`;
          return parseFloat(getComputedStyle(probe).fontSize);
        }));
        probe.remove();
        const bad = [];
        document.querySelectorAll("body *").forEach((el) => {
          const s = parseFloat(getComputedStyle(el).fontSize);
          if (!allowed.has(s) && !el.closest(".rig")) {
            bad.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}=${s}`);
          }
        });
        return [...new Set(bad)];
      });
      t.check("all type comes from the scale", scale.length === 0, scale.slice(0, 8).join(", "));
      await ctx.close();
    }

    /* ── 3. the scroll rig plays its whole range ── */
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(1900);

      const readP = () => page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector("#machine-rig")).getPropertyValue("--p")));

      const atTop = await readP();
      t.check("rig starts partway in from the intro tween", atTop > 0.1 && atTop < 0.5, String(atTop));

      await page.evaluate(() => {
        const r = document.querySelector("#machine-rig");
        window.scrollTo(0, r.offsetTop + r.offsetHeight);
      });
      await page.waitForTimeout(1400);
      const atEnd = await readP();
      t.check("rig reaches the end of its range", atEnd > 0.95, String(atEnd));
      t.check("all six checklist rows end stamped",
        (await page.$$("#drows .dr.on")).length === 6);
      t.check("the nudge phone is shown at the end",
        await page.$eval("#dphone", (e) => e.classList.contains("on")));
      t.check("the FILED stamp lands", await page.$eval("#dfiled", (e) => e.classList.contains("on")));
      t.check("the last beat is active",
        await page.$eval('.beat[data-beat="3"]', (e) => e.classList.contains("on")));

      if (screenshots) await page.screenshot({ path: path.join(SHOTS, "rig-end.png") });
      await ctx.close();
    }

    /* ── 4. layout shift ── */
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);
      const cls = await page.evaluate(() => window.__cls);
      t.check("cumulative layout shift under 0.1", cls < 0.1, `CLS ${cls.toFixed(4)}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  return t.report();
}

if (process.argv[1]?.endsWith("visual.mjs")) {
  run({ screenshots: process.argv.includes("--screenshots") })
    .then((r) => process.exit(r.failed ? 1 : 0));
}
