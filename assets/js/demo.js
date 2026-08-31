/* Ledgerhound — deterministic demo engine (client-side, zero API, zero upload) */
(function () {
  "use strict";

  var DOCS = [
    { id: "stmts", name: "Bank statements — August",  keys: ["bank statement", "statements"] },
    { id: "pnl",   name: "Profit & loss — Q3 draft",  keys: ["profit and loss", "p&l", "pnl"] },
    { id: "recs",  name: "Receipts — fuel & software", keys: ["receipt"] },
    { id: "pay",   name: "Payroll report — September", keys: ["payroll", "wage report"] },
    { id: "vat",   name: "VAT / sales tax returns",    keys: ["vat", "sales tax"] },
    { id: "m1099", name: "1099 / supplier confirmations", keys: ["1099", "supplier confirmation"] },
    { id: "mile",  name: "Mileage log",                keys: ["mileage", "logbook"] },
    { id: "loan",  name: "Loan statement — Q3",        keys: ["loan statement"] }
  ];

  var MAILS = [
    { from: "Marta K. · Harbor Dental", subj: "August statements attached", body: "Hi — statements for August are attached as one PDF.", docs: ["stmts"], tone: "polite" },
    { from: "Dev P. · Cedar Coffee Co.", subj: "receipts pile from the van", body: "Photo'd the fuel receipts and the software invoice, see below.", docs: ["recs"], tone: "polite" },
    { from: "Priya S. · Wren Fabrication", subj: "P&L draft + loan statement", body: "P&L draft is here and the loan statement from the bank, both attached.", docs: ["pnl", "loan"], tone: "polite" },
    { from: "Tom W. · Wren Fabrication", subj: "payroll report", body: "September payroll report is in the shared drive, link below.", docs: ["pay"], tone: "polite" },
    { from: "Sam R. · Harbor Dental", subj: "mileage log from the site visits", body: "Attaching the mileage log the accountant asked for.", docs: ["mile"], tone: "polite" },
    { from: "Ana G. · Cedar Coffee Co.", subj: "the VAT sheet", body: "VAT numbers for last quarter are in the spreadsheet.", docs: ["vat"], tone: "polite" }
  ];

  // Nudge draft templates — client-side, deterministic
  var NUDGES = {
    polite: function (client, docList) {
      return "Subject: " + client + " — quick check on " + docList[0] + "\n\nHi there,\n\nJust doing the monthly round-up and noticed we're still waiting on " + docList.join(" and ") + " from your side. No rush at all — if you can send it over by Friday, we'll have everything closed off in time for the monthly report.\n\nThanks so much,\n[Your name]";
    },
    firm: function (client, docList) {
      return "Subject: " + client + " — still needed: " + docList[0] + "\n\nHi,\n\nFollowing up on " + docList.join(" and ") + " — we still haven't received " + (docList.length > 1 ? "them" : "it") + ", and the month-end close is starting to slip because of it. If there's anything blocking on your side, let me know and we'll sort it out together. Otherwise, can we aim for Monday?\n\nBest,\n[Your name]";
    }
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var state = { fwd: {}, runs: 0, unlocked: false, lastSig: "", inited: false };

  var LS = "lh_demo_v1";

  function loadLS() {
    try {
      var raw = window.localStorage.getItem(LS);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && typeof d === "object") {
          state.fwd = d.fwd || {};
          state.runs = d.runs || 0;
          state.unlocked = !!d.unlocked;
          state.lastSig = d.lastSig || "";
        }
      }
    } catch (e) { /* private mode — in-memory only */ }
  }
  function saveLS() {
    try {
      window.localStorage.setItem(LS, JSON.stringify({ fwd: state.fwd, runs: state.runs, unlocked: state.unlocked, lastSig: state.lastSig }));
    } catch (e) { /* ignore */ }
  }

  function fmt(n) { return n + ""; }

  function renderMails() {
    var ul = $("#mails");
    if (!ul) return;
    ul.textContent = "";
    MAILS.forEach(function (m, i) {
      var li = document.createElement("li");
      li.className = "mail" + (state.fwd[i] ? " is-fwd" : "");
      var docs = m.docs.map(function (id) { return docById(id).name; });
      li.innerHTML =
        '<div class="mail-top"><div><div class="mail-from">' + esc(m.from) + '</div>' +
        '<div class="mail-subj">' + esc(m.subj) + '</div>' +
        '<div class="mail-doc">delivers: ' + esc(docs.join(" · ")) + '</div></div>' +
        (state.fwd[i]
          ? '<span class="fwd-mark" style="color:var(--green);font-weight:700">FWD ✓</span>'
          : '<button type="button" class="mail-fwd" data-i="' + i + '">Forward</button>') +
        '</div>';
      ul.appendChild(li);
    });
    updateCounts();
  }

  function docById(id) {
    for (var i = 0; i < DOCS.length; i++) if (DOCS[i].id === id) return DOCS[i];
    return null;
  }

  function renderChecklist() {
    var ul = $("#cl-list");
    if (!ul) return;
    ul.textContent = "";
    DOCS.forEach(function (d) {
      var arrived = false;
      Object.keys(state.fwd).forEach(function (k) {
        if (state.fwd[k]) MAILS[+k].docs.forEach(function (did) { if (did === d.id) arrived = true; });
      });
      var cls = arrived ? "is-in" : (anyFwd() ? "is-out" : "is-pending");
      var label = arrived ? "Received" : (anyFwd() ? "Missing" : "Waiting");
      var li = document.createElement("li");
      li.className = "cl-row " + cls;
      li.innerHTML = '<span class="cl-doc">' + esc(d.name) + '</span>' +
        '<span class="cl-state">' + label + '</span>';
      ul.appendChild(li);
      if (arrived) slamStamp(li);
    });
    var rec = receivedCount();
    $("#cl-count").textContent = rec + " received";
  }

  function anyFwd() { return Object.keys(state.fwd).some(function (k) { return state.fwd[k]; }); }
  function receivedCount() {
    var n = 0;
    DOCS.forEach(function (d) {
      var arrived = false;
      Object.keys(state.fwd).forEach(function (k) {
        if (state.fwd[k]) MAILS[+k].docs.forEach(function (did) { if (did === d.id) arrived = true; });
      });
      if (arrived) n++;
    });
    return n;
  }

  function updateCounts() {
    var n = Object.keys(state.fwd).filter(function (k) { return state.fwd[k]; }).length;
    var el = $("#dm-count");
    if (el) el.textContent = n + " / " + MAILS.length + " forwarded";
    $("#dm-all").disabled = n >= MAILS.length;
  }

  function slamStamp(row) {
    var st = row.querySelector(".cl-state");
    if (!st || row.dataset.slammed) return;
    row.dataset.slammed = "1";
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    st.animate(
      [{ transform: "scale(1.9) rotate(-7deg)", opacity: 0.4 }, { transform: "scale(1) rotate(-2deg)", opacity: 1 }],
      { duration: 260, easing: "cubic-bezier(.2,0,0,1)", fill: "both" }
    );
  }

  function forward(i) {
    if (state.fwd[i] || i < 0 || i >= MAILS.length) return;
    state.fwd[i] = true;
    saveLS();
    renderMails();
    renderChecklist();
    maybeRefreshChase();
  }

  function forwardAll() {
    MAILS.forEach(function (_, i) { if (!state.fwd[i]) state.fwd[i] = true; });
    saveLS();
    renderMails();
    renderChecklist();
    maybeRefreshChase();
  }

  function missingDocs() {
    var out = [];
    DOCS.forEach(function (d) {
      var arrived = false;
      Object.keys(state.fwd).forEach(function (k) {
        if (state.fwd[k]) MAILS[+k].docs.forEach(function (did) { if (did === d.id) arrived = true; });
      });
      if (!arrived) out.push(d);
    });
    return out;
  }

  function missingPerClient() {
    var map = {};
    MAILS.forEach(function (m, i) {
      if (!state.fwd[i]) return;
      var client = m.from.split("·")[1] ? m.from.split("·")[1].trim() : m.from;
      var has = {};
      m.docs.forEach(function (d) { has[d] = true; });
      Object.keys(has).forEach(function (d) { map[d] = client; });
    });
    return map;
  }

  function fwdSignature() {
    return Object.keys(state.fwd).filter(function (k) { return state.fwd[k]; }).sort().join(",");
  }

  function generate() {
    // gate check
    var left = 3 - state.runs;
    if (left <= 0 && !state.unlocked) {
      $("#chasecard").hidden = true;
      $("#gate").hidden = false;
      return;
    }
    // empty inbox: guide instead of a nonsense list
    if (!anyFwd()) {
      var card0 = $("#chasecard");
      card0.hidden = false;
      var out0 = $("#chase-out");
      out0.textContent = "";
      var li0 = document.createElement("li");
      li0.innerHTML = '<span class="co-client">Forward at least one client email first — the hound can\'t read an empty inbox.</span>';
      out0.appendChild(li0);
      $("#drafts").textContent = "";
      $("#gate").hidden = true;
      return;
    }
    // unchanged inbox state = same list: re-render without burning a run
    var sig = fwdSignature();
    if (sig === state.lastSig && !$("#chasecard").hidden) {
      renderChase();
      return;
    }
    state.runs++;
    state.lastSig = sig;
    saveLS();
    renderChase();
  }

  function renderChase() {
    var missing = missingDocs();
    var map = missingPerClient();
    var card = $("#chasecard");
    card.hidden = false;
    $("#gate").hidden = true;
    var out = $("#chase-out");
    out.textContent = "";
    var week = "WEEK 36 · " + new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
    $("#chase-week").textContent = week;
    var clients = {};
    missing.forEach(function (d) { clients[map[d.id] || "Unassigned client"] = true; });
    var clientList = Object.keys(clients);
    var rows = [];
    missing.forEach(function (d) {
      var c = map[d.id] || "Unassigned client";
      rows.push({ client: c, doc: d.name });
    });
    rows.forEach(function (r, i) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="co-client">' + esc(r.client) + '</span>' +
        '<span class="co-doc">MISSING — ' + esc(r.doc) + '</span>';
      out.appendChild(li);
      setTimeout(function () { li.classList.add("show"); }, 140 + i * 220);
    });
    if (!rows.length) {
      var li2 = document.createElement("li");
      li2.innerHTML = '<span class="co-client" style="color:var(--green);font-weight:700">All documents received. Zero chasing needed this week.</span>';
      out.appendChild(li2);
      setTimeout(function () { li2.classList.add("show"); }, 140);
    }
    // drafts
    var drafts = $("#drafts");
    drafts.textContent = "";
    var byClient = {};
    rows.forEach(function (r) { (byClient[r.client] = byClient[r.client] || []).push(r.doc); });
    var names = Object.keys(byClient);
    if (names.length) {
      var n1 = NUDGES.polite(names[0], byClient[names[0]]);
      drafts.appendChild(draftEl("Draft 1 · gentle nudge · to " + names[0], n1));
      if (names[1]) {
        drafts.appendChild(draftEl("Draft 2 · firmer nudge · to " + names[1], NUDGES.firm(names[1], byClient[names[1]])));
      } else if (byClient[names[0]].length > 1) {
        drafts.appendChild(draftEl("Draft 2 · firmer nudge · to " + names[0], NUDGES.firm(names[0], byClient[names[0]])));
      }
    }
    renderGateStatus();
  }

  function draftEl(title, body) {
    var d = document.createElement("div");
    d.className = "draft";
    d.innerHTML = '<div class="draft-head"><span>' + esc(title) + '</span><span>YOUR SEND BUTTON</span></div>' +
      '<div class="draft-body">' + esc(body) + '</div>';
    return d;
  }

  function maybeRefreshChase() {
    if (!$("#chasecard").hidden) renderChase(); // re-render live, does NOT consume a run
  }

  function reset() {
    state.fwd = {};
    state.runs = 0;
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
    if (dm) dm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderGateStatus() {
    var left = 3 - state.runs;
    var el = $("#runs-left");
    if (!el) return;
    if (state.unlocked) el.textContent = "Unlimited demos — founding invite sent to your inbox path.";
    else if (left > 0) el.textContent = left + " free " + (left === 1 ? "list" : "lists") + " left — then unlock.";
    else el.textContent = "0 lists left — unlock below.";
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function init() {
    if (state.inited) return;
    state.inited = true;
    loadLS();
    var ul = $("#mails");
    if (!ul) return; // not the index page
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
    gateForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!gateForm.checkValidity()) { gateForm.reportValidity(); return; }
      state.unlocked = true;
      saveLS();
      // deliver email via shared app.js pipeline if present
      var input = $("#gate-email");
      if (window.LH_MAIL) window.LH_MAIL(input.value, "ledgerhound-demo-unlock");
      var g = $("#gate");
      g.innerHTML = '<div class="gate-card"><h3>Unlocked.</h3><p>Three more lists are yours — and the founding invite is on its way to ' +
        esc(input.value) + ' when the cohort opens. Back to the demo:</p>' +
        '<button type="button" class="btn btn-accent" id="gate-close">Generate another list</button></div>';
      $("#gate-close").addEventListener("click", function () { $("#gate").hidden = true; });
      renderGateStatus();
      // re-run available now
    });
    $("#gate-email").addEventListener("blur", function () {
      if (this.value && !this.checkValidity()) {
        var err = $("#gate-email-err");
        err.hidden = false;
        err.textContent = "That doesn't look like a work email — mind checking it?";
        this.setAttribute("aria-invalid", "true");
      }
    });
    $("#gate-email").addEventListener("input", function () {
      if (this.checkValidity()) {
        var err = $("#gate-email-err");
        err.hidden = true;
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
