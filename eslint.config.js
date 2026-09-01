// Flat config. Three environments live in this repo:
//   assets/js/*  — browser, ES5-style IIFEs (no build step, must run everywhere)
//   api/*        — Vercel serverless, modern ESM on Node
//   tools|tests  — Node ESM scripts
import js from "@eslint/js";

const browserGlobals = {
  window: "readonly", document: "readonly", navigator: "readonly",
  localStorage: "readonly", fetch: "readonly", setTimeout: "readonly",
  clearTimeout: "readonly", requestAnimationFrame: "readonly", console: "readonly",
  gsap: "readonly", ScrollTrigger: "readonly", Event: "readonly", URL: "readonly",
  IntersectionObserver: "readonly", matchMedia: "readonly", getComputedStyle: "readonly",
};
const nodeGlobals = {
  process: "readonly", console: "readonly", fetch: "readonly", URL: "readonly",
  setTimeout: "readonly", Buffer: "readonly", __dirname: "readonly",
};

export default [
  { ignores: ["assets/js/vendor/**", "node_modules/**", "qa/**"] },
  js.configs.recommended,
  {
    files: ["assets/js/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: {
      "no-unused-vars": ["error", { args: "after-used" }],
      "no-undef": "error",
      eqeqeq: ["error", "smart"],
      "no-implicit-globals": "error",
      "prefer-const": "off",
      "no-var": "off",
    },
  },
  {
    files: ["api/**/*.js", "tools/**/*.{js,mjs}", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: { "no-unused-vars": ["error", { args: "after-used" }], eqeqeq: ["error", "smart"] },
  },
  {
    // Test files mix Node and, inside page.evaluate() callbacks, the browser.
    files: ["tests/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...nodeGlobals, ...browserGlobals, location: "readonly", performance: "readonly", PerformanceObserver: "readonly" },
    },
    rules: { "no-unused-vars": ["error", { args: "after-used" }], eqeqeq: ["error", "smart"] },
  },
];
