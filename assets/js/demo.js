/* Ledgerhound — deterministic demo engine (client-side, zero API, zero upload).
 *
 * Every document on the checklist belongs to a client, and every sample email
 * delivers a known subset. Forwarding an email marks its documents as arrived;
 * everything still outstanding is attributed to the client who owes it, which
 * is what makes the generated chase list and the nudge drafts meaningful.
 */
(function () {
  "use strict";

  var CLIENTS = {
    harbor: "Harbor Dental",
    cedar: "Cedar Coffee Co.",
    wren: "Wren Fabrication"
  };

  /* The Q3 checklist: 8 documents, each owed by exactly one client. */
  var DOCS = [
    { id: "stmts", client: "harbor", name: "Bank statements — August" },
    { id: "pnl", client: "wren", name: "Profit & loss — Q3 draft" },
    { id: "recs", client: "cedar", name: "Receipts — fuel & software" },
    { id: "pay", client: "wren", name: "Payroll report — September" },
    { id: "vat", client: "cedar", name: "VAT / sales tax returns" },
    { id: "m1099", client: "wren", name: "1099 / supplier confirmations" },
    { id: "mile", client: "harbor", name: "Mileage log" },
    { id: "loan", client: "harbor", name: "Loan statement — Q3" }
  ];

  /* Six overnight emails. Between them they deliver 6 of the 8 documents, so a
     full run always ends with a real two-client chase list rather than an
     empty or nonsensical one. */
  var MAILS = [
    { from: "Marta K.", client: "harbor", subj: "August statements attached", docs: ["stmts"] },
    { from: "Dev P.", client: "cedar", subj: "receipts pile from the van", docs: ["recs"] },
    { from: "Priya S.", client: "wren", subj: "P&L draft for the quarter", docs: ["pnl"] },
    { from: "Tom W.", client: "wren", subj: "payroll report", docs: ["pay"] },
    { from: "Sam R.", client: "harbor", subj: "mileage log from the site visits", docs: ["mile"] },
    { from: "Ana G.", client: "cedar", subj: "the VAT sheet", docs: ["vat"] }
  ];

  var FREE_RUNS = 3;

  var NUDGES = {
    polite: function (client, docList) {
      return "Subject: " + client + " — quick check on " + docList[0] +
        "\n\nHi there,\n\nJust doing the monthly round-up and noticed we're still waiting on " +
        joinList(docList) + " from your side. No rush at all — if you can send " +
        (docList.length > 1 ? "them" : "it") +
        " over by Friday, we'll have everything closed off in time for the monthly report." +
        "\n\nThanks so much,\n[Your name]";
    },
    firm: function (client, docList) {
      return "Subject: " + client + " — still needed: " + docList[0] +
        "\n\nHi,\n\nFollowing up on " + joinList(docList) + " — we still haven't received " +
        (docList.length > 1 ? "them" : "it") +
        ", and the month-end close is starting to slip because of it. If there's anything " +
        "blocking on your side, let me know and we'll sort it out together. Otherwise, can " +
        "we aim for Monday?\n\nBest,\n[Your name]";
    }
  };

  function joinList(items) {
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + " and " + items[1];
    return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
  }

  function $(s, r) { return (r || document).querySelector(s); }

  var state = { fwd: {}, runs: 0, unlocked: false, lastSig: "", inited: false };
  var LS = "lh_demo_v1";

  function loadLS() {
    try {
      var raw = window.localStorage.getItem(LS);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && typeof d === "object") {
        state.fwd = d.fwd || {};
        state.runs = d.runs || 0;
        state.unlocked = !!d.unlocked;
        state.lastSig = d.lastSig || "";
      }
    } catch { /* private mode — in-memory only */ }
  }

  function saveLS() {
    try {
      window.localStorage.setItem(LS, JSON.stringify({
        fwd: state.fwd, runs: state.runs, unlocked: state.unlocked, lastSig: state.lastSig
      }));
    } catch { /* ignore */ }
  }

  function motionOn() {
    return document.documentElement.classList.contains("js-motion");
  }

  /* ── Arrival model ────────────────────────────────────────────────────────
     Computed once per render instead of re-scanning every mail for every doc. */
  function arrivedSet() {
    var set = {};
    Object.keys(state.fwd).forEach(function (k) {
      if (!state.fwd[k]) return;
      var mail = MAILS[Number(k)];
      if (!mail) return;
      mail.docs.forEach(function (id) { set[id] = true; });
    });
    return set;
  }

  function anyFwd() {
    return Object.keys(state.fwd).some(function (k) { return state.fwd[k]; });
  }

  function fwdSignature() {
    return Object.keys(state.fwd)
      .filter(function (k) { return state.fwd[k]; })
      .sort()
      .join(",");
  }

  /* ISO-8601 week number, so the chase list is dated rather than hardcoded. */
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  }

  /* ── Render: inbox ───────────────────────────────────────────────────── */
  function renderMails() {
    var ul = $("#mails");
    if (!ul) return;
    ul.textContent = "";
    MAILS.forEach(function (m, i) {
      var docNames = m.docs.map(function (id) { return docById(id).name; });
      var li = document.createElement("li");
      li.className = "mail" + (state.fwd[i] ? " is-fwd" : "");

      var top = el("div", "mail-top");
      var meta = document.createElement("div");
      meta.appendChild(el("div", "mail-from", m.from + " · " + CLIENTS[m.client]));
      meta.appendChild(el("div", "mail-subj", m.subj));
      meta.appendChild(el("div", "mail-doc", "delivers: " + docNames.join(" · ")));
      top.appendChild(meta);

      if (state.fwd[i]) {
        top.appendChild(el("span", "fwd-mark", "FWD ✓"));
      } else {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mail-fwd";
        btn.dataset.i = String(i);
        btn.textContent = "Forward";
        btn.setAttribute("aria-label", "Forward the email from " + m.from + " at " + CLIENTS[m.client]);
        top.appendChild(btn);
      }
      li.appendChild(top);
      ul.appendChild(li);
    });
    updateCounts();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function docById(id) {
    for (var i = 0; i < DOCS.length; i++) if (DOCS[i].id === id) return DOCS[i];
    return null;
  }

  /* ── Render: checklist ───────────────────────────────────────────────── */
  function renderChecklist() {
    var ul = $("#cl-list");
    if (!ul) return;
    var arrived = arrivedSet();
    var started = anyFwd();
    var received = 0;
    ul.textContent = "";
    DOCS.forEach(function (d) {
      var isIn = !!arrived[d.id];
      if (isIn) received++;
      var li = el("li", "cl-row " + (isIn ? "is-in" : started ? "is-out" : "is-pending"));
      li.appendChild(el("span", "cl-doc", d.name));
      li.appendChild(el("span", "cl-state", isIn ? "Received" : started ? "Missing" : "Waiting"));
      ul.appendChild(li);
      if (isIn) slamStamp(li);
    });
    $("#cl-count").textContent = received + " received";
  }

  function updateCounts() {
    var n = Object.keys(state.fwd).filter(function (k) { return state.fwd[k]; }).length;
    var el2 = $("#dm-count");
    if (el2) el2.textContent = n + " / " + MAILS.length + " forwarded";
    var all = $("#dm-all");
    if (all) {
      var done = n >= MAILS.length;
      all.disabled = done;
      all.textContent = done ? "All six forwarded" : "Forward all six";
    }
  }

  function slamStamp(row) {
    var st = row.querySelector(".cl-state");
    if (!st || !motionOn() || typeof st.animate !== "function") return;
    st.animate(
      [{ transform: "scale(1.9) rotate(-7deg)", opacity: 0.4 },
        { transform: "scale(1) rotate(-2deg)", opacity: 1 }],
      { duration: 260, easing: "cubic-bezier(.2,0,0,1)", fill: "both" }
    );
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */
  function forward(i) {
    if (!(i >= 0 && i < MAILS.length) || state.fwd[i]) return;
    state.fwd[i] = true;
    saveLS();
    renderMails();
    renderChecklist();
    maybeRefreshChase();
  }

  function forwardAll() {
    MAILS.forEach(function (_, i) { state.fwd[i] = true; });
    saveLS();
    renderMails();
    renderChecklist();
    maybeRefreshChase();
  }

  /* Documents that have not arrived, grouped by the client who owes them. */
  function missingByClient() {
    var arrived = arrivedSet();
    var groups = [];
    var index = {};
    DOCS.forEach(function (d) {
      if (arrived[d.id]) return;
      var name = CLIENTS[d.client];
      if (index[name] === undefined) {
        index[name] = groups.length;
        groups.push({ client: name, docs: [] });
      }
      groups[index[name]].docs.push(d.name);
    });
    return groups;
  }

  function generate() {
    var card = $("#chasecard");

    // Nothing forwarded: explain rather than print a nonsense list.
    if (!anyFwd()) {
      card.hidden = false;
      var out0 = $("#chase-out");
      out0.textContent = "";
      var li0 = document.createElement("li");
      li0.appendChild(el("span", "co-client",
        "Forward at least one client email first — the hound can't read an empty inbox."));
      li0.classList.add("show");
      out0.appendChild(li0);
      $("#drafts").textContent = "";
      $("#gate").hidden = true;
      return;
    }

    // Re-rendering the same inbox state costs nothing and burns no run.
    var sig = fwdSignature();
    if (sig === state.lastSig && !card.hidden) { renderChase(); return; }

    if (state.runs >= FREE_RUNS && !state.unlocked) {
      card.hidden = true;
      showGate();
      return;
    }

    state.runs++;
    state.lastSig = sig;
    saveLS();
    renderChase();
  }

  function renderChase() {
    var groups = missingByClient();
    var card = $("#chasecard");
    card.hidden = false;
    $("#gate").hidden = true;

    var now = new Date();
    $("#chase-week").textContent = "Week " + isoWeek(now) + " · " +
      now.toLocaleDateString("en-US", { month: "short", year: "numeric" });

    var out = $("#chase-out");
    out.textContent = "";
    var rows = [];
    groups.forEach(function (g) {
      g.docs.forEach(function (doc) { rows.push({ client: g.client, doc: doc }); });
    });

    var animate = motionOn();
    if (!rows.length) {
      var liDone = document.createElement("li");
      liDone.appendChild(el("span", "co-client co-clear",
        "All documents received. Zero chasing needed this week."));
      out.appendChild(liDone);
      reveal(liDone, 0, animate);
    } else {
      rows.forEach(function (r, i) {
        var li = document.createElement("li");
        li.appendChild(el("span", "co-client", r.client));
        li.appendChild(el("span", "co-doc", "MISSING — " + r.doc));
        out.appendChild(li);
        reveal(li, i, animate);
      });
    }

    // One draft per client that owes something, up to two.
    var drafts = $("#drafts");
    drafts.textContent = "";
    if (groups[0]) {
      drafts.appendChild(draftEl(
        "Draft 1 · gentle nudge · to " + groups[0].client,
        NUDGES.polite(groups[0].client, groups[0].docs)));
    }
    if (groups[1]) {
      drafts.appendChild(draftEl(
        "Draft 2 · firmer nudge · to " + groups[1].client,
        NUDGES.firm(groups[1].client, groups[1].docs)));
    }
    renderGateStatus();
  }

  function reveal(li, i, animate) {
    if (!animate) { li.classList.add("show"); return; }
    window.setTimeout(function () { li.classList.add("show"); }, 120 + i * 160);
  }

  function draftEl(title, body) {
    var d = el("div", "draft");
    var head = el("div", "draft-head");
    head.appendChild(el("span", null, title));
    head.appendChild(el("span", null, "YOUR SEND BUTTON"));
    d.appendChild(head);
    d.appendChild(el("div", "draft-body", body));
    return d;
  }

  function maybeRefreshChase() {
    if (!$("#chasecard").hidden) renderChase(); // live re-render, costs no run
  }

  /* Reset clears the inbox and the output but deliberately does NOT reset the
     run counter — otherwise the three-free-lists gate is bypassed by clicking
     Reset. Unlock state is preserved too. */
  function reset() {
    state.fwd = {};
    state.lastSig = "";
    saveLS();
    renderMails();
    renderChecklist();
    $("#chasecard").hidden = true;
    $("#gate").hidden = true;
    $("#chase-out").textContent = "";
    $("#drafts").textContent = "";
    renderGateStatus();
    var dm = $("#demo");
    if (dm) dm.scrollIntoView({ behavior: motionOn() ? "smooth" : "auto", block: "start" });
  }

  function renderGateStatus() {
    var elx = $("#runs-left");
    if (!elx) return;
    if (state.unlocked) { elx.textContent = "Unlocked — generate as many lists as you like."; return; }
    var left = Math.max(0, FREE_RUNS - state.runs);
    elx.textContent = left > 0
      ? left + " free " + (left === 1 ? "list" : "lists") + " left — then unlock."
      : "0 lists left — unlock below.";
  }

  /* ── Gate ────────────────────────────────────────────────────────────── */
  function showGate() {
    var g = $("#gate");
    g.hidden = false;
    var h = $("#gate-h");
    if (h) h.focus(); // move focus to the panel that just appeared
  }

  function showUnlocked(email) {
    var g = $("#gate");
    g.textContent = "";
    var card = el("div", "gate-card");
    var h = el("h3", null, "Unlocked.");
    h.id = "gate-h";
    h.tabIndex = -1;
    card.appendChild(h);
    card.appendChild(el("p", null,
      "Three more lists are yours — and the founding invite is on its way to " + email +
      " when the cohort opens."));
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-accent";
    btn.textContent = "Generate another list";
    btn.addEventListener("click", function () {
      g.hidden = true;
      var gen = $("#dm-gen");
      if (gen) { gen.focus(); }
      generate();
    });
    card.appendChild(btn);
    g.appendChild(card);
    h.focus();
  }

  /* ── Init ────────────────────────────────────────────────────────────── */
  function init() {
    if (state.inited) return;
    var ul = $("#mails");
    if (!ul) return; // not the index page
    state.inited = true;
    loadLS();
    renderMails();
    renderChecklist();
    renderGateStatus();

    ul.addEventListener("click", function (ev) {
      var b = ev.target.closest(".mail-fwd");
      if (b) forward(parseInt(b.dataset.i, 10));
    });
    $("#dm-all").addEventListener("click", forwardAll);
    $("#dm-gen").addEventListener("click", function () { generate(); });
    $("#dm-reset").addEventListener("click", reset);

    var gateForm = $("#gate-form");
    var gateEmail = $("#gate-email");
    var gateErr = $("#gate-email-err");

    gateForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var value = gateEmail.value.trim();
      if (!gateForm.checkValidity() || !value) {
        gateErr.hidden = false;
        gateErr.textContent = "That doesn't look like a work email — mind checking it?";
        gateEmail.setAttribute("aria-invalid", "true");
        gateEmail.focus();
        return;
      }
      state.unlocked = true;
      saveLS();
      if (window.LH_MAIL) window.LH_MAIL(value, "ledgerhound-demo-unlock");
      showUnlocked(value);
      renderGateStatus();
    });

    gateEmail.addEventListener("blur", function () {
      if (this.value && !this.checkValidity()) {
        gateErr.hidden = false;
        gateErr.textContent = "That doesn't look like a work email — mind checking it?";
        this.setAttribute("aria-invalid", "true");
      }
    });
    gateEmail.addEventListener("input", function () {
      if (this.checkValidity()) {
        gateErr.hidden = true;
        gateErr.textContent = "";
        this.removeAttribute("aria-invalid");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
