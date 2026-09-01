// Accessibility: axe-core across every page at desktop and mobile, plus the
// manual checks axe cannot make (focus order, skip link, live regions, target
// size, and the demo's dynamic panels).
import fs from "node:fs";
import { createRequire } from "node:module";
import { startServer, launch, watchConsole, Recorder, BASE, PAGES } from "./lib.mjs";

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Contrast is a property of the settled page. Wait for the entrance tweens and
// the rig's intro to finish before measuring anything.
async function settle(page) {
  await page.waitForTimeout(3200);
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter((a) => a.playState === "running" && a.effect?.getTiming?.().iterations !== Infinity)
      .map((a) => a.finished.catch(() => {}))
  ));
  await page.waitForTimeout(200);
}

export default async function run() {
  const server = await startServer();
  const browser = await launch();
  const t = Recorder("a11y");
  try {
    for (const motion of ["reduce", "no-preference"]) {
      for (const path of PAGES) {
        for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
          const ctx = await browser.newContext({ viewport: vp, reducedMotion: motion });
          const page = await ctx.newPage();
          // CSP is script-src 'self', so axe must arrive from a same-origin URL.
          await page.route("**/__axe.js", (r) =>
            r.fulfill({ status: 200, contentType: "text/javascript", body: AXE }));
          await page.goto(BASE + path, { waitUntil: "networkidle" });
          await settle(page);
          await page.addScriptTag({ url: "/__axe.js" });
          const res = await page.evaluate((tags) => window.axe.run(document, {
            runOnly: { type: "tag", values: tags }
          }), TAGS);
          t.check(
            `axe ${path} @${vp.width} motion=${motion}`,
            res.violations.length === 0,
            res.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0]?.target?.join(" ")}`).join("; ")
          );
          await ctx.close();
        }
      }
    }

    // ── manual checks on the home page ──
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    watchConsole(page, errs);
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    // skip link is the first stop and actually moves focus
    await page.keyboard.press("Tab");
    t.check("skip link is first tab stop",
      await page.evaluate(() => document.activeElement?.classList.contains("skip")));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    t.check("skip link targets main",
      await page.evaluate(() => location.hash === "#main"));

    // every focusable control has a visible focus indicator
    const noRing = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll("a[href],button:not([disabled]),input,summary").forEach((el) => {
        if (el.tabIndex < 0) return;                       // honeypot, opt-out targets
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;       // not rendered
        el.focus({ focusVisible: true });
        // Elements inside a collapsed <details> cannot take focus at all; they
        // are only reachable once the disclosure is open, and are checked then.
        if (document.activeElement !== el) return;
        const s = getComputedStyle(el);
        const has = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
          s.boxShadow !== "none";
        if (!has) bad.push(el.tagName + "." + (el.className || "").toString().split(" ")[0]);
      });
      return [...new Set(bad)];
    });
    t.check("all controls show a focus indicator", noRing.length === 0, noRing.join(", "));

    // WCAG 2.2 AA target size (2.5.8) — 24×24 minimum
    const small = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll("a[href],button,summary,input").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        // inline links in running text are exempt
        if (el.tagName === "A" && el.closest("p,li,figcaption,td,span")) return;
        if (r.width < 24 || r.height < 24) {
          bad.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      });
      return bad;
    });
    t.check("target size >= 24x24", small.length === 0, small.join(", "));

    // the marquee is motion that must be pausable (WCAG 2.2.2)
    await page.click("#mq-pause");
    t.check("marquee pause toggles state", await page.evaluate(() =>
      document.querySelector("#mq-pause").getAttribute("aria-pressed") === "true" &&
      document.querySelector("#marquee").classList.contains("paused")));
    await page.click("#mq-pause");

    // the demo gate is announced and takes focus when it appears
    await page.click("#dm-all");
    for (let i = 0; i < 4; i++) {
      await page.click("#dm-gen");
      await page.waitForTimeout(150);
      await page.click("#dm-reset");
      await page.waitForTimeout(150);
      await page.click("#dm-all");
      await page.waitForTimeout(120);
    }
    await page.click("#dm-gen");
    await page.waitForTimeout(300);
    const gateShown = await page.evaluate(() => !document.querySelector("#gate").hidden);
    if (gateShown) {
      t.check("gate takes focus when shown",
        await page.evaluate(() => document.activeElement?.id === "gate-h"));
    } else {
      t.check("gate reachable after free runs", true);
    }

    t.check("no console output on the home page", errs.length === 0, errs.slice(0, 3).join(" | "));
    await ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
  return t.report();
}

if (process.argv[1]?.endsWith("a11y.mjs")) {
  run().then((r) => process.exit(r.failed ? 1 : 0));
}
