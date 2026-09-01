/* Ledgerhound — motion, the Monday-machine scroll rig, marquee and forms.
 *
 * MOTION CONTRACT
 * The stylesheet renders the finished, readable page. Nothing is hidden by
 * default. This file adds `js-motion` to <html> only after it has confirmed
 * that GSAP loaded and reduced motion is not requested; only then do the
 * hide-then-reveal rules in styles.css §4 apply.
 *
 * That means no-JS, a blocked vendor script, a selector this file forgets, or
 * a ScrollTrigger that never fires can never leave content stranded invisible.
 */
(function () {
  "use strict";

  /* Intake route: the Vercel serverless function at /api/request. Set
     RESEND_API_KEY + NOTIFY_EMAIL in the Vercel dashboard to receive email
     notifications; until then requests are logged server-side and the client
     keeps a local queue as a backup. */
  var FORM_ENDPOINT = "/api/request";

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var prefersReduced = !!(reduceMQ && reduceMQ.matches);
  /* Animation runs only when GSAP is actually present AND motion is welcome. */
  var motionOn = !prefersReduced && !!window.gsap;

  /* ── Marquee ─────────────────────────────────────────────────────────── */
  var MQ_ITEMS = ["Bank statements", "P&L drafts", "Receipts", "Payroll reports", "VAT returns",
    "1099 confirmations", "Mileage logs", "Loan statements", "Trial balances", "Invoice copies"];

  function buildMarquee() {
    var track = $("#marquee-track");
    if (!track || track.dataset.built) return;
    track.dataset.built = "1";
    // two identical passes so the -50% keyframe loops seamlessly
    var frag = document.createDocumentFragment();
    for (var pass = 0; pass < 2; pass++) {
      MQ_ITEMS.forEach(function (t) {
        var s = document.createElement("span");
        s.className = "mq-item";
        s.textContent = t;
        frag.appendChild(s);
      });
    }
    track.appendChild(frag);
  }

  function initMarqueePause() {
    var btn = $("#mq-pause");
    var mq = $("#marquee");
    if (!btn || !mq) return;
    function setPaused(paused) {
      btn.setAttribute("aria-pressed", paused ? "true" : "false");
      btn.textContent = paused ? "Resume" : "Pause";
      mq.classList.toggle("paused", paused);
    }
    btn.addEventListener("click", function () {
      setPaused(btn.getAttribute("aria-pressed") !== "true");
    });
    mq.addEventListener("mouseenter", function () { mq.classList.add("paused"); });
    mq.addEventListener("mouseleave", function () {
      if (btn.getAttribute("aria-pressed") !== "true") mq.classList.remove("paused");
    });
  }

  /* ── Ticker ───────────────────────────────────────────────────────────────
     The element ships with the final number already in the markup, so it is
     correct with no JS. When motion is on we rewind it to 0 and count up. */
  function initTicker() {
    var el = $("#ticker-num");
    if (!el) return;
    var target = parseInt(el.dataset.target, 10);
    if (!isFinite(target)) return;
    var final = target.toLocaleString("en-US");
    if (!motionOn) { el.textContent = final; return; }
    var obj = { v: 0 };
    el.textContent = "0";
    window.gsap.to(obj, {
      v: target, duration: 1.8, ease: "power3.out", delay: 0.9,
      onUpdate: function () { el.textContent = Math.round(obj.v).toLocaleString("en-US"); },
      onComplete: function () { el.textContent = final; }
    });
  }

  /* ── The Monday machine ───────────────────────────────────────────────────
     One scalar, p (0 → 1), drives every frame of the device. ScrollTrigger
     scrubs it across the tall copy column while the device sticks beside it.
     With motion off, frame(1) is simply the markup's resting state. */
  function initMachine() {
    var rig = $("#machine-rig");
    if (!rig) return;

    var mails = $$("#dmails .dm");
    var rows = $$("#drows .dr");
    var scan = $("#dscan");
    var phone = $("#dphone");
    var filed = $("#dfiled");
    var tray = $("#dtray");
    var laptop = $("#laptop");
    var clock = $("#dclock");
    var readct = $("#dreadct");
    var clct = $("#dclct");
    var rhead = $("#drhead");
    var beats = $$("#beats .beat");

    // map global progress onto a sub-range, clamped to 0..1
    function seg(p, a, b) {
      var t = (p - a) / (b - a);
      return t < 0 ? 0 : t > 1 ? 1 : t;
    }

    function frame(p) {
      rig.style.setProperty("--p", p.toFixed(3));

      // 0.00–0.16 · the forwarded threads land in the inbox pane
      for (var i = 0; i < mails.length; i++) {
        var t = seg(p, 0.01 + i * 0.045, 0.11 + i * 0.045);
        mails[i].style.opacity = t;
        mails[i].style.transform =
          "translateX(" + ((1 - t) * -34).toFixed(1) + "px) rotate(" + ((1 - t) * -4).toFixed(2) + "deg)";
      }

      // 0.16–0.42 · the read sweep tags each document
      var sp = seg(p, 0.16, 0.42);
      if (scan) {
        scan.style.opacity = sp > 0 && sp < 1 ? "1" : "0";
        scan.style.transform = "translateY(" + (10 + sp * 96).toFixed(1) + "px)";
      }
      var read = 0;
      for (var j = 0; j < mails.length; j++) {
        var on = sp > (j + 0.75) / mails.length;
        mails[j].classList.toggle("read", on);
        if (on) read++;
      }
      if (readct) readct.textContent = read + "/" + mails.length;

      // 0.42–0.74 · every checklist row is stamped
      var got = 0, stamped = 0;
      for (var k = 0; k < rows.length; k++) {
        var rowOn = seg(p, 0.42 + k * 0.05, 0.5 + k * 0.05) > 0.5;
        rows[k].classList.toggle("on", rowOn);
        if (rowOn) {
          stamped++;
          if (rows[k].classList.contains("got")) got++;
        }
      }
      if (clct) clct.textContent = got + " received";
      if (rhead) rhead.textContent = p > 0.74 ? "Monday chase list" : "Checklist";
      if (tray) tray.classList.toggle("on", stamped === rows.length);

      // 0.74–0.92 · the nudge draft rises on the phone
      if (phone) phone.classList.toggle("on", p > 0.74);
      // 0.92–1.00 · filed
      if (filed) filed.classList.toggle("on", p > 0.92);

      if (clock) {
        clock.textContent = p < 0.16 ? "MON 09:00"
          : p < 0.42 ? "MON 09:04"
            : p < 0.74 ? "MON 09:12" : "MON 09:15";
      }
      if (laptop) laptop.style.transform = "rotateX(" + (7 * (1 - seg(p, 0, 0.3))).toFixed(2) + "deg)";

      // the beat list tracks the same clock
      var active = p < 0.16 ? 0 : p < 0.42 ? 1 : p < 0.74 ? 2 : 3;
      for (var b = 0; b < beats.length; b++) {
        beats[b].classList.toggle("on", Number(beats[b].dataset.beat) === active);
      }
    }

    if (!motionOn) { frame(1); return; }

    /* Two inputs feed the same render: an intro tween so the device fills in
       on load rather than sitting empty, and the scroll position. The larger
       wins, so scrolling immediately takes over from the intro. */
    var scrollP = 0, introP = 0;
    function render() { frame(scrollP > introP ? scrollP : introP); }

    frame(0);
    var intro = { v: 0 };
    window.gsap.to(intro, {
      v: 0.2, duration: 1.2, delay: 0.45, ease: "power2.out",
      onUpdate: function () { introP = intro.v; render(); }
    });

    window.ScrollTrigger.create({
      trigger: rig,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      onUpdate: function (self) { scrollP = self.progress; render(); }
    });
  }

  /* ── Entrance reveals ─────────────────────────────────────────────────── */
  function initReveals() {
    if (!motionOn) return;
    var gsap = window.gsap;

    var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.to(".hero .eyebrow", { opacity: 1, y: 0, duration: 0.4 }, 0.05)
      .fromTo(".hero-h", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.7 }, 0.12)
      .to(".hero .lede", { opacity: 1, y: 0, duration: 0.45 }, 0.42)
      .to(".hero-actions", { opacity: 1, y: 0, duration: 0.45 }, 0.54)
      .to(".hero-note", { opacity: 1, y: 0, duration: 0.4 }, 0.64);

    // Anything still hidden by [data-motion] outside the hero reveals on scroll.
    $$("[data-motion]").forEach(function (el) {
      if (el.closest(".hero")) return; // handled by the timeline above
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

    /* Safety net: an element the reader has already scrolled past must never
       still be transparent. This only touches elements at or above the fold —
       anything further down is left to its scroll trigger. */
    function rescueVisible() {
      $$("[data-motion]").forEach(function (el) {
        var box = el.getBoundingClientRect();
        if (box.top > window.innerHeight) return; // not reached yet
        if (parseFloat(window.getComputedStyle(el).opacity) < 0.99) {
          el.style.opacity = "1";
          el.style.transform = "none";
        }
      });
    }
    window.setTimeout(rescueVisible, 2500);
    window.addEventListener("scroll", function () {
      window.clearTimeout(rescueVisible.t);
      rescueVisible.t = window.setTimeout(rescueVisible, 600);
    }, { passive: true });
  }

  /* ── Forms ───────────────────────────────────────────────────────────── */
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
        errEl.textContent = "";
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
    } catch { /* private mode — nothing to queue into */ }
  }

  /* Builds the fallback message as DOM rather than innerHTML so the mailto
     payload can never be parsed as markup. */
  function showFallback(status, payload) {
    var subject = "Founding spot request";
    var body = "Hi,\n\nI'd like to request a founding spot for " +
      (payload.firm || "my firm") + ".\nEmail: " + payload.email + "\n\nThanks!";
    status.textContent = "Request queued. To make sure it reaches us today, ";
    var a = document.createElement("a");
    a.href = "mailto:hello@ledgerhound.app?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
    a.textContent = "send it in one click";
    status.appendChild(a);
    status.appendChild(document.createTextNode(" — or wait for our weekly review."));
  }

  function initForms() {
    wireField($("#rq-email"), $("#rq-email-err"), "That doesn't look like a work email — mind checking it?");
    wireField($("#gate-email"), $("#gate-email-err"), "That doesn't look like a work email — mind checking it?");

    var form = $("#req-form");
    if (!form) return;
    var status = $("#req-status");
    var busy = false;

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;

      var emailEl = $("#rq-email");
      var email = emailEl.value.trim();
      var hp = $("#rq-website").value;
      status.classList.remove("is-err");
      status.textContent = "";

      if (!email || !EMAIL_RE.test(email)) {
        status.textContent = "Add your work email first — that's where the invite goes.";
        status.classList.add("is-err");
        emailEl.focus();
        return;
      }
      if (hp) { // honeypot tripped: acknowledge, send nothing
        status.textContent = "Thanks — you're on the list.";
        return;
      }

      var payload = {
        email: email,
        firm: $("#rq-firm").value.trim(),
        plan: "founding",
        source: "site-request-form"
      };

      busy = true;
      var submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      status.textContent = "Sending…";

      function done() {
        busy = false;
        if (submit) submit.disabled = false;
      }

      window.fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
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
        done();
      }).catch(function () {
        queueLocal(payload);
        showFallback(status, payload);
        done();
      });
    });
  }

  /* Used by demo.js when the demo gate is unlocked. */
  window.LH_MAIL = function (email, tag) {
    var payload = { email: email, tag: tag, plan: "demo-unlock", source: "demo-gate" };
    queueLocal(payload);
    window.fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }).catch(function () { /* queued locally already */ });
  };

  /* ── Boot ────────────────────────────────────────────────────────────── */
  function boot() {
    if (motionOn) document.documentElement.classList.add("js-motion");
    buildMarquee();
    initMarqueePause();
    if (motionOn) window.gsap.registerPlugin(window.ScrollTrigger);
    initReveals();
    initMachine();
    initTicker();
    initForms();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
