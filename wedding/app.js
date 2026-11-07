// Wedding guest list.
//
// Guests: { id, first, last, side: "groom"|"bride", priority: "1"|"2"|"3", relation, email, address }
// Saved to /api/store?doc=wedding (Vercel Blob, behind the private login) and kept in
// this browser too (localStorage "weddingGuests", the same key the old planner used,
// so guests added there carry over). Whichever copy is newer wins when the page loads.
(function () {
  "use strict";

  var LS_KEY = "weddingGuests";
  var LS_UPDATED = "weddingGuestsUpdated";
  var API = "/api/store?doc=wedding";

  var PRI = { "1": "Must", "2": "Want", "3": "If space" };
  var SIDES = [["groom", "Nate’s side"], ["bride", "Dilan’s side"]];

  var guests = [];
  var updated = null;
  var sync = "loading";
  var reachable = false;
  var filter = "all";   // all | 1 | 2 | 3 | missing
  var query = "";
  var editing = null;   // null = closed; { id: null } = adding; guest copy = editing

  var app = document.getElementById("app");
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  };

  // ---------- storage + sync ----------
  function clean(list) {
    return (Array.isArray(list) ? list : []).filter(function (g) { return g && g.first; }).map(function (g, i) {
      return {
        id: +g.id || Date.now() + i,
        first: String(g.first || "").trim(),
        last: String(g.last || "").trim(),
        side: g.side === "bride" ? "bride" : "groom",
        priority: ["1", "2", "3"].indexOf(String(g.priority)) >= 0 ? String(g.priority) : "1",
        relation: String(g.relation || "").trim(),
        email: String(g.email || "").trim(),
        address: String(g.address || "").trim(),
      };
    });
  }
  function readLocal() {
    try { return { guests: clean(JSON.parse(localStorage.getItem(LS_KEY) || "[]")), updated: localStorage.getItem(LS_UPDATED) }; }
    catch (e) { return { guests: [], updated: null }; }
  }
  function writeLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(guests)); if (updated) localStorage.setItem(LS_UPDATED, updated); } catch (e) { /* storage blocked */ }
  }

  async function load() {
    var local = readLocal(), remote = null;
    try {
      var r = await fetch(API, { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { reachable = true; remote = (await r.json()).data; }
      else if (r.status === 401) sync = "signedout";
    } catch (e) { /* offline or no API */ }
    if (reachable) {
      sync = "synced";
      var localNewer = local.guests.length && (!remote || !remote.updated || !local.updated || local.updated > remote.updated);
      if (localNewer) { guests = local.guests; updated = local.updated; push(); }
      else if (remote) { guests = clean(remote.guests); updated = remote.updated; }
      else { guests = local.guests; updated = local.updated; }
    } else {
      if (sync !== "signedout") sync = "device";
      guests = local.guests; updated = local.updated;
    }
    writeLocal();
  }

  var pushing = null, again = false;
  async function push() {
    if (!reachable) return renderSync();
    if (pushing) { again = true; return; }       // one save at a time; the latest list wins
    pushing = true;
    sync = "saving"; renderSync();
    try {
      var r = await fetch(API, {
        method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guests: guests }),
      });
      if (!r.ok) throw new Error(r.status);
      var j = await r.json();
      updated = j.updated || updated;
      writeLocal();
      sync = "synced";
    } catch (e) { sync = "error"; }
    pushing = null;
    if (again) { again = false; return push(); }
    renderSync();
  }
  function save() { updated = new Date().toISOString(); writeLocal(); push(); }

  function renderSync() {
    var el = $("sync");
    var m = {
      synced: ["ok", "Saved"], saving: ["", "Saving…"], device: ["warn", "This browser only"],
      error: ["err", "Not saved to your account"], signedout: ["err", "Signed out"], loading: ["", ""],
    }[sync];
    el.hidden = !m[1];
    el.className = "sync " + m[0];
    el.textContent = m[1];
    el.title = {
      device: "Saved in this browser. Saving to your account works on nate-holland.com.",
      error: "Couldn’t reach the server. Saved in this browser; it will retry on your next change.",
    }[sync] || "";
  }

  var toastTimer;
  function toast(msg, err) {
    var t = $("toast");
    t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  // ---------- helpers ----------
  function fullName(g) { return (g.first + " " + g.last).trim(); }
  function initials(g) { return ((g.first[0] || "") + (g.last[0] || "")).toUpperCase(); }
  function missing(g) { return !g.email || !g.address; }
  function matches(g) {
    if (filter === "missing" && !missing(g)) return false;
    if (["1", "2", "3"].indexOf(filter) >= 0 && g.priority !== filter) return false;
    if (!query) return true;
    var q = query.toLowerCase();
    return [fullName(g), g.relation, g.email, g.address].join(" ").toLowerCase().indexOf(q) >= 0;
  }
  function sortGuests(a, b) {
    return a.priority !== b.priority ? +a.priority - +b.priority : fullName(a).localeCompare(fullName(b));
  }

  // ---------- render ----------
  function render() {
    renderSync();
    var count = function (fn) { return guests.filter(fn).length; };
    var stats = [
      ["Total", guests.length, null],
      [SIDES[0][1], count(function (g) { return g.side === "groom"; }), "var(--groom)"],
      [SIDES[1][1], count(function (g) { return g.side === "bride"; }), "var(--bride)"],
      ["Must invite", count(function (g) { return g.priority === "1"; }), null],
      ["Want to invite", count(function (g) { return g.priority === "2"; }), null],
      ["Missing details", count(missing), null],
    ];
    var shown = guests.filter(matches).sort(sortGuests);

    var html = '<div class="stats">' + stats.map(function (s) {
      return '<div class="stat" style="cursor:default"><span class="l">' + (s[2] ? '<i style="background:' + s[2] + '"></i>' : "") + esc(s[0]) + '</span><span class="v">' + s[1] + "</span></div>";
    }).join("") + "</div>";

    if (editing) html += editorHtml();

    if (!guests.length && !editing) {
      html += '<div class="card empty"><h2>No guests yet</h2><p>Add everyone you’re thinking of inviting, with their email and home address for invitations.</p>' +
        '<button class="btn dark" type="button" data-act="add">' + ICON.plus + "Add your first guest</button></div>";
      app.innerHTML = html;
      return;
    }

    html += '<div class="toolbar"><div class="left"><div class="filters" role="group" aria-label="Filter guests">' +
      [["all", "All"], ["1", "Must"], ["2", "Want"], ["3", "If space"], ["missing", "Missing details"]].map(function (f) {
        return '<button type="button" data-act="filter" data-v="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + "</button>";
      }).join("") + "</div></div>" +
      '<div class="right"><label class="search">' + ICON.search + '<input type="search" id="q" placeholder="Search name, email, address" value="' + esc(query) + '" aria-label="Search guests"></label>' +
      '<button class="btn" type="button" data-act="csv">' + ICON.down + "Export CSV</button>" +
      '<button class="btn dark" type="button" data-act="add">' + ICON.plus + "Add guest</button></div></div>";

    html += '<div class="sides">' + SIDES.map(function (s) {
      var list = shown.filter(function (g) { return g.side === s[0]; });
      return '<section class="card side" aria-label="' + esc(s[1]) + '"><div class="side-head"><i style="background:var(--' + s[0] + ')"></i><h3>' + esc(s[1]) + '</h3><span class="n">' + list.length + "</span></div>" +
        (list.length ? '<ul class="guests">' + list.map(guestRow).join("") + "</ul>"
          : '<p class="empty-side">' + (filter !== "all" || query ? "No guests here match." : "Nobody on this side yet.") + "</p>") +
        "</section>";
    }).join("") + "</div>";
    if (filter !== "all" || query) html += '<p class="count">Showing ' + shown.length + " of " + guests.length + " guests</p>";

    app.innerHTML = html;
  }

  function guestRow(g) {
    var city = g.address ? g.address.split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean).slice(-2).join(", ") : "";
    return '<li><button class="guest" type="button" data-act="edit" data-id="' + g.id + '" aria-label="Edit ' + esc(fullName(g)) + '">' +
      '<span class="avatar" aria-hidden="true">' + esc(initials(g)) + "</span>" +
      '<span class="who"><span class="name">' + esc(fullName(g)) + "</span>" +
        (g.relation ? '<span class="rel">' + esc(g.relation) + "</span>" : "") +
        '<span class="contact">' +
          (g.email ? "<span>" + ICON.mail + "<em>" + esc(g.email) + "</em></span>" : '<span class="missing">' + ICON.mail + "<em>No email</em></span>") +
          (g.address ? "<span>" + ICON.pin + "<em>" + esc(city) + "</em></span>" : '<span class="missing">' + ICON.pin + "<em>No address</em></span>") +
        "</span></span>" +
      '<span class="pri p' + g.priority + '">' + PRI[g.priority] + "</span></button></li>";
  }

  function editorHtml() {
    var g = editing, adding = g.id == null;
    var seg = function (key, opts) {
      return '<div class="seg" role="radiogroup">' + opts.map(function (o) {
        return '<button type="button" role="radio" data-act="pick" data-k="' + key + '" data-v="' + o[0] + '" aria-checked="' + (g[key] === o[0]) + '">' + esc(o[1]) + "</button>";
      }).join("") + "</div>";
    };
    var input = function (k, label, type, ph, cls, err) {
      return '<div class="field ' + (cls || "") + '" data-f="' + k + '"><label for="g-' + k + '">' + label + "</label>" +
        '<input id="g-' + k + '" data-k="' + k + '" type="' + type + '" value="' + esc(g[k]) + '" placeholder="' + esc(ph) + '" autocomplete="off">' +
        (err ? '<span class="err">' + err + "</span>" : "") + "</div>";
    };
    return '<form class="card editor" id="editor" novalidate><div class="editor-head"><div><p class="eyebrow">' + (adding ? "New guest" : "Edit guest") + "</p><h2>" +
      (adding ? "Add a guest" : esc(fullName(g))) + "</h2></div>" +
      '<button class="btn ghost" type="button" data-act="close">Close</button></div>' +
      '<div class="fields">' +
        input("first", "First name", "text", "e.g. James", "", "A first name is needed.") +
        input("last", "Last name", "text", "e.g. Smith") +
        '<div class="field"><span class="label">Side</span>' + seg("side", SIDES) + "</div>" +
        '<div class="field"><span class="label">Priority</span>' + seg("priority", [["1", "Must"], ["2", "Want"], ["3", "If space"]]) + "</div>" +
        input("email", "Email", "email", "name@example.com", "span2", "That doesn’t look like an email address.") +
        input("relation", "Relationship", "text", "e.g. Brother, school friend", "span2") +
        '<div class="field full"><label for="g-address">Home address</label><textarea id="g-address" data-k="address" rows="3" placeholder="Street and number&#10;Postcode and city&#10;Country">' + esc(g.address) + "</textarea></div>" +
      "</div>" +
      '<div class="editor-actions">' +
        (adding ? "" : '<button class="btn ghost danger" type="button" data-act="delete">Remove guest</button>') +
        '<span class="spacer"></span><button class="btn ghost" type="button" data-act="close">Cancel</button>' +
        '<button class="btn dark" type="submit">' + (adding ? "Add guest" : "Save") + "</button>" +
      "</div></form>";
  }

  // ---------- actions ----------
  function openEditor(g) {
    editing = g ? Object.assign({}, g) : { id: null, first: "", last: "", side: "groom", priority: "1", relation: "", email: "", address: "" };
    render();
    var f = $("editor");
    if (f) { f.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(function () { $("g-first").focus({ preventScroll: true }); }, 250); }
  }

  function submitEditor(e) {
    e.preventDefault();
    var g = editing, ok = true;
    g.first = g.first.trim(); g.last = g.last.trim(); g.email = g.email.trim(); g.relation = g.relation.trim(); g.address = g.address.trim();
    var mark = function (k, bad) { var f = document.querySelector('.field[data-f="' + k + '"]'); if (f) f.classList.toggle("error", bad); if (bad) ok = false; };
    mark("first", !g.first);
    mark("email", !!g.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email));
    if (!ok) return;
    var adding = g.id == null;
    if (adding) { g.id = Date.now(); guests.push(g); }
    else guests = guests.map(function (x) { return x.id === g.id ? g : x; });
    editing = null;
    save();
    render();
    toast(adding ? fullName(g) + " added" : "Saved");
  }

  function exportCsv() {
    var cell = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [["First name", "Last name", "Side", "Priority", "Relationship", "Email", "Address"]].concat(
      guests.slice().sort(sortGuests).map(function (g) {
        return [g.first, g.last, g.side === "groom" ? "Nate" : "Dilan", PRI[g.priority], g.relation, g.email, g.address];
      }));
    var csv = "﻿" + rows.map(function (r) { return r.map(cell).join(","); }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "wedding-guests.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.dataset.act;
    if (act === "add") return openEditor(null);
    if (act === "edit") return openEditor(guests.filter(function (g) { return g.id === +b.dataset.id; })[0]);
    if (act === "close") { editing = null; return render(); }
    if (act === "pick") {
      editing[b.dataset.k] = b.dataset.v;
      b.parentNode.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
      return;
    }
    if (act === "delete") {
      if (!confirm("Remove " + fullName(editing) + " from the guest list?")) return;
      var name = fullName(editing);
      guests = guests.filter(function (g) { return g.id !== editing.id; });
      editing = null; save(); render(); return toast(name + " removed");
    }
    if (act === "filter") { filter = b.dataset.v; return render(); }
    if (act === "csv") return exportCsv();
  });
  app.addEventListener("input", function (e) {
    var k = e.target.dataset && e.target.dataset.k;
    if (k && editing) {
      editing[k] = e.target.value;
      var f = e.target.closest(".field"); if (f) f.classList.remove("error");
    }
    if (e.target.id === "q") {
      query = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var q = $("q"); q.focus(); q.setSelectionRange(pos, pos);
    }
  });
  app.addEventListener("submit", function (e) { if (e.target.id === "editor") submitEditor(e); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && editing) { editing = null; render(); } });

  (async function init() { await load(); render(); })();
})();
