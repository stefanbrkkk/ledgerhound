// Full verification: lint, then every browser suite, repeated N times so that
// flakiness shows up rather than passing once by luck.
//
//   node tests/run-all.mjs [runs]
import { execFileSync } from "node:child_process";
import a11y from "./a11y.mjs";
import e2e from "./e2e.mjs";
import visual from "./visual.mjs";

const RUNS = Number(process.argv[2] || 3);

function lint() {
  const steps = [
    ["html-validate", ["index.html", "404.html", "privacy.html", "terms.html", "refund.html", "security.html", "og-card.html"]],
    ["stylelint", ["styles.css"]],
    ["eslint", ["assets/js/app.js", "assets/js/demo.js", "api", "tools", "tests"]]
  ];
  const failures = [];
  for (const [bin, args] of steps) {
    try {
      execFileSync("npx", [bin, ...args], { stdio: "pipe" });
      console.log(`  ✓ ${bin}`);
    } catch (e) {
      failures.push(bin);
      console.log(`  ✗ ${bin}\n${e.stdout?.toString() || e.message}`);
    }
  }
  console.log(`${failures.length ? "FAIL" : "PASS"}  lint: ${steps.length - failures.length}/${steps.length}`);
  return { total: steps.length, failed: failures.length };
}

const totals = [];
for (let i = 1; i <= RUNS; i++) {
  console.log(`\n═══ RUN ${i} of ${RUNS} ═══`);
  const results = [lint(), await a11y(), await e2e(), await visual({ screenshots: i === RUNS })];
  const failed = results.reduce((n, r) => n + r.failed, 0);
  const total = results.reduce((n, r) => n + r.total, 0);
  totals.push({ run: i, total, failed });
  console.log(`RUN ${i}: ${total - failed}/${total} checks passed`);
}

console.log("\n═══ SUMMARY ═══");
for (const r of totals) {
  console.log(`  run ${r.run}: ${r.total - r.failed}/${r.total} ${r.failed ? "FAIL" : "PASS"}`);
}
const anyFailed = totals.some((r) => r.failed);
console.log(anyFailed ? "\nRESULT: FAILURES PRESENT" : "\nRESULT: ALL GREEN across " + RUNS + " runs");
process.exit(anyFailed ? 1 : 0);
