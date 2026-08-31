/* Ledgerhound — motion + forms + marquee (console-clean, reduced-motion aware) */
(function () {
  "use strict";

  // ── Launch configuration ─────────────────────────────────────────────
  // Intake route: Vercel serverless /api/request (works out of the box).
  // Set RESEND_API_KEY + NOTIFY_EMAIL in the Vercel dashboard to get email
  // notifications; until then requests are logged server-side and the
  // client keeps a local queue as backup.
  var FORM_ENDPOINT = "/api/request";

  var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) document.documentElement.classList.add("reduced");

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  // ── Marquee ──────────────────────────────────────────────────────────
  var MQ_ITEMS = ["Bank statements", "P&L drafts", "Receipts", "Payroll reports", "VAT returns",
    "1099 confirmations", "Mileage logs", "Loan statements", "Trial balances", "Invoice copies"];
  function buildMarquee() {
    var track = $("#marquee-track");
    if (!track || track.dataset.built) return;
    track.dataset.built = "1";
    var html = "";
    for (var pass = 0; pass < 2; pass++) {
      MQ_ITEMS.forEach(function (t) { html += '<span class="mq-item">' + t + "</span>"; });
    }
    track.innerHTML = html;
  }
  function initMarqueePause() {
    var btn = $("#mq-pause");
    var mq = $("#marquee");
    if (!btn || !mq) return;
    btn.addEventListener("click", function () {
      var paused = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", paused ? "false" : "true");
      btn.textContent = paused ? "Pause" : "Resume";
      mq.classList.toggle("paused", !paused);
    });
    mq.addEventListener("mouseenter", function () { mq.classList.add("paused"); });
    mq.addEventListener("mouseleave", function () {
      if (btn.getAttribute("aria-pressed") !== "true") mq.classList.remove("paused");
    });
  }

  // ── Ticker (derived estimate, clearly labeled) ───────────────────────
  function initTicker() {
    var el = $("#ticker-num");
    if (!el) return;
    var target = parseInt(el.dataset.target, 10);
    if (prefersReduced || !window.gsap) { el.textContent = target.toLocaleString("en-US"); return; }
    var obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 1.8, ease: "power3.out", delay: 1.1,
      onUpdate: function () { el.textContent = Math.round(obj.v).toLocaleString("en-US"); }
    });
  }

  // ── Hero intro + scroll reveals ─────────────────────────────────────
  function initMotion() {
    if (!window.gsap) { // no-JS / failed load: show everything
      $$("[data-motion], .mailcard, .crow, .stamp").forEach(function (el) { el.style.opacity = 1; el.style.transform = "none"; });
      return;
    }
    gsap.registerPlugin(window.ScrollTrigger);

    var mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: reduce)", function () {
      gsap.set("[data-motion], .mailcard, .crow, .stamp", { opacity: 1, y: 0, x: 0, scale: 1, clearProps: "transform" });
      return function () {};
    });

    mm.add("(prefers-reduced-motion: no-preference)", function () {
      var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".hero .eyebrow", { opacity: 1, y: 0, duration: 0.4 }, 0.05)
        .fromTo(".hero-h", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.7 }, 0.12)
        .to(".hero .lede", { opacity: 1, y: 0, duration: 0.45 }, 0.5)
        .to(".hero-actions", { opacity: 1, y: 0, duration: 0.45 }, 0.62)
        .to(".hero-note", { opacity: 1, y: 0, duration: 0.4 }, 0.72)
        .fromTo(".mc-1", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45 }, 0.85)
        .fromTo(".mc-2", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45 }, 1.0)
        .fromTo(".mc-3", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45 }, 1.15);

      var rows = $$(".machine-list .crow");
      rows.forEach(function (row, i) {
        tl.to(row, { opacity: 1, x: 0, duration: 0.35 }, 1.25 + i * 0.16);
        var stamp = row.querySelector(".stamp");
        if (stamp) {
          var rot = row.classList.contains("is-out") ? -3 : 2.4;
          tl.fromTo(stamp,
            { opacity: 0, scale: 1.9, rotation: rot * 3 },
            { opacity: 1, scale: 1, rotation: rot, duration: 0.32, ease: "power4.in" },
            1.32 + i * 0.16);
        }
      });

      // scroll reveals — one-shot
      $$("[data-motion]").forEach(function (el) {
        if (el.closest(".hero")) return; // hero handled above
        gsap.fromTo(el, { opacity: 0, y: 14 }, {
          opacity: 1, y: 0, duration: 0.5, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true }
        });
      });
      gsap.utils.toArray(".exhibit").forEach(function (el, i) {
        gsap.fromTo(el, { opacity: 0, y: 18 }, {
          opacity: 1, y: 0, duration: 0.5, delay: i * 0.08, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true }
        });
      });
      return function () { /* cleanup handled by gsap.matchMedia */ };
    });
  }

  // ── Forms (craft: blur-then-input validation, role=alert inline) ────
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function wireField(input, errEl, message) {
    if (!input || !errEl) return;
    input.addEventListener("blur", function () {
      if (input.value && !EMAIL_RE.test(input.value)) {
        errEl.hidden = false;
        errEl.textContent = message;
        input.setAttribute("aria-invalid", "true");
      }
    });
    input.addEventListener("input", function () {
      if (EMAIL_RE.test(input.value)) {
        errEl.hidden = true;
        input.removeAttribute("aria-invalid");
      }
    });
  }

  function queueLocal(payload) {
    try {
      var key = "lh_requests_v1";
      var arr = JSON.parse(window.localStorage.getItem(key) || "[]");
      arr.push({ t: new Date().toISOString(), p: payload });
      window.localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) { /* private mode */ }
  }

  function initForms() {
    wireField($("#rq-email"), $("#rq-email-err"), "That doesn't look like a work email — mind checking it?");
    wireField($("#gate-email"), $("#gate-email-err"), "That doesn't look like a work email — mind checking it?");

    var form = $("#req-form");
    if (!form) return;
    var status = $("#req-status");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = $("#rq-email").value.trim();
      var hp = $("#rq-website").value;
      status.classList.remove("is-err");
      if (!email || !EMAIL_RE.test(email)) {
        status.textContent = "Add your work email first — that's where the invite goes.";
        status.classList.add("is-err");
        $("#rq-email").focus();
        return;
      }
      if (hp) { // honeypot: silently accept but do nothing
        status.textContent = "Thanks — you're on the list.";
        return;
      }
      var payload = {
        email: email,
        firm: $("#rq-firm").value.trim(),
        plan: "founding",
        source: "site-request-form"
      };
      if (FORM_ENDPOINT) {
        status.textContent = "Sending…";
        fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload)
        }).then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        }).then(function (r) {
          if (r.ok) {
            status.textContent = r.data && r.data.notified
              ? "Request received — founding invites go out weekly, either way you'll hear from us."
              : "Request received — you're in the queue; invites go out weekly.";
            form.reset();
          } else {
            queueLocal(payload);
            showFallback(status, payload);
          }
        }).catch(function () {
          queueLocal(payload);
          showFallback(status, payload);
        });
      } else {
        queueLocal(payload);
        showFallback(status, payload);
      }
    });
  }

  function showFallback(status, payload) {
    var body = encodeURIComponent("Hi,\n\nI'd like to request a founding spot for " + (payload.firm || "my firm") + ".\nEmail: " + payload.email + "\n\nThanks!");
    status.innerHTML = "Request queued. To make sure it reaches us today, <a href=\"mailto:hello@ledgerhound.app?subject=" +
      encodeURIComponent("Founding spot request") + "&body=" + body + "\">send it in one click</a> — or wait for our weekly review.";
  }

  // exposed for the demo unlock
  window.LH_MAIL = function (email, tag) {
    queueLocal({ email: email, tag: tag, source: "demo-gate" });
    if (FORM_ENDPOINT) {
      fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email, tag: tag, plan: "demo-unlock", source: "demo-gate" })
      }).catch(function () {});
    }
  };

  // ── boot ─────────────────────────────────────────────────────────────
  function boot() {
    buildMarquee();
    initMarqueePause();
    initMotion();
    initForms();
    initTicker();
    initTickerFallback();
  }
  function initTickerFallback() {
    // if GSAP never loads (offline vendor), show final number
    if (!window.gsap) {
      var el = $("#ticker-num");
      if (el) el.textContent = parseInt(el.dataset.target, 10).toLocaleString("en-US");
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
