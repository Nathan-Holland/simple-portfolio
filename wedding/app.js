// Wedding guest list.
//
// Guests: { id, first, last, side: "groom"|"bride", priority: "1"|"2"|"3", relation, email, address,
//          plusOnes: [{ id, first, last, relation, email, address, sameAddress }], children, childrenNote }
// A +1 has the same details as a guest; their side and priority follow the guest who brings them.
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
    people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
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
        plusOnes: (Array.isArray(g.plusOnes) ? g.plusOnes : []).filter(function (p) { return p && p.first; }).map(function (p, j) {
          return {
            id: +p.id || Date.now() + i * 100 + j,
            first: String(p.first || "").trim(),
            last: String(p.last || "").trim(),
            relation: String(p.relation || "").trim(),
            email: String(p.email || "").trim(),
            address: p.sameAddress ? "" : String(p.address || "").trim(),
            sameAddress: !!p.sameAddress,
          };
        }),
        children: Math.max(0, Math.min(20, Math.round(+g.children) || 0)),
        childrenNote: String(g.childrenNote || "").trim(),
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
  function personMissing(p) { return !p.email || (!p.address && !p.sameAddress); }
  function missing(g) { return personMissing(g) || g.plusOnes.some(personMissing); }
  function adults(g) { return 1 + g.plusOnes.length; }
  function partyLabel(g) {
    var bits = [];
    if (g.plusOnes.length === 1) bits.push("+1 " + fullName(g.plusOnes[0]));
    else if (g.plusOnes.length > 1) bits.push("+" + g.plusOnes.length + " (" + g.plusOnes.map(function (p) { return p.first; }).join(", ") + ")");
    if (g.children) bits.push(g.children + (g.children === 1 ? " child" : " children"));
    return bits.join(" · ");
  }
  function matches(g) {
    if (filter === "missing" && !missing(g)) return false;
    if (["1", "2", "3"].indexOf(filter) >= 0 && g.priority !== filter) return false;
    if (!query) return true;
    var q = query.toLowerCase();
    return [fullName(g), g.relation, g.email, g.address, g.childrenNote].concat(g.plusOnes.map(function (p) {
      return [fullName(p), p.relation, p.email, p.address].join(" ");
    })).join(" ").toLowerCase().indexOf(q) >= 0;
  }
  function sortGuests(a, b) {
    return a.priority !== b.priority ? +a.priority - +b.priority : fullName(a).localeCompare(fullName(b));
  }

  // ---------- render ----------
  function render() {
    renderSync();
    var count = function (fn) { return guests.filter(fn).length; };
    var sum = function (fn, list) { return (list || guests).reduce(function (n, g) { return n + fn(g); }, 0); };
    var people = function (g) { return adults(g) + g.children; };
    var stats = [
      ["People", sum(people), null, guests.length + (guests.length === 1 ? " invitation" : " invitations")],
      [SIDES[0][1], sum(people, guests.filter(function (g) { return g.side === "groom"; })), "var(--groom)", "people"],
      [SIDES[1][1], sum(people, guests.filter(function (g) { return g.side === "bride"; })), "var(--bride)", "people"],
      ["+1s", sum(function (g) { return g.plusOnes.length; }), null, "bringing a partner or friend"],
      ["Children", sum(function (g) { return g.children; }), null, (function (n) { return n + (n === 1 ? " family" : " families"); })(count(function (g) { return g.children > 0; }))],
      ["Missing details", count(missing), null, "invitations"],
    ];
    var shown = guests.filter(matches).sort(sortGuests);

    var html = '<div class="stats">' + stats.map(function (s) {
      return '<div class="stat" style="cursor:default"><span class="l">' + (s[2] ? '<i style="background:' + s[2] + '"></i>' : "") + esc(s[0]) + '</span><span class="v">' + s[1] + "</span>" +
        (s[3] ? '<span class="t">' + esc(s[3]) + "</span>" : "") + "</div>";
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
      var ppl = list.reduce(function (n, g) { return n + adults(g) + g.children; }, 0);
      return '<section class="card side" aria-label="' + esc(s[1]) + '"><div class="side-head"><i style="background:var(--' + s[0] + ')"></i><h3>' + esc(s[1]) + '</h3><span class="n">' + ppl + (ppl === 1 ? " person" : " people") + "</span></div>" +
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
        (partyLabel(g) ? '<span class="party">' + ICON.people + "<em>" + esc(partyLabel(g)) + "</em></span>" : "") +
        '<span class="contact">' +
          (g.email ? "<span>" + ICON.mail + "<em>" + esc(g.email) + "</em></span>" : '<span class="missing">' + ICON.mail + "<em>No email</em></span>") +
          (g.address ? "<span>" + ICON.pin + "<em>" + esc(city) + "</em></span>" : '<span class="missing">' + ICON.pin + "<em>No address</em></span>") +
          (g.plusOnes.some(personMissing) ? '<span class="missing">' + ICON.people + "<em>+1 details missing</em></span>" : "") +
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
      plusOnesHtml(g) +
      childrenHtml(g) +
      '<div class="editor-actions">' +
        (adding ? "" : '<button class="btn ghost danger" type="button" data-act="delete">Remove guest</button>') +
        '<span class="spacer"></span><button class="btn ghost" type="button" data-act="close">Cancel</button>' +
        '<button class="btn dark" type="submit">' + (adding ? "Add guest" : "Save") + "</button>" +
      "</div></form>";
  }

  // +1s: the same details as a guest. Side and priority follow the guest.
  function plusOnesHtml(g) {
    var who = g.first || "this guest";
    var block = function (p, i) {
      var inp = function (k, label, type, ph, cls, err) {
        return '<div class="field ' + (cls || "") + '" data-f="p' + i + "-" + k + '"><label for="p' + i + "-" + k + '">' + label + "</label>" +
          '<input id="p' + i + "-" + k + '" data-p="' + i + '" data-k="' + k + '" type="' + type + '" value="' + esc(p[k]) + '" placeholder="' + esc(ph) + '" autocomplete="off">' +
          (err ? '<span class="err">' + err + "</span>" : "") + "</div>";
      };
      return '<div class="plus" data-p="' + i + '"><div class="plus-head"><h4>' + (p.first ? esc(fullName(p)) : "+1" + (g.plusOnes.length > 1 ? " #" + (i + 1) : "")) + "</h4>" +
        '<button class="btn ghost small" type="button" data-act="remove-plus" data-p="' + i + '">' + ICON.x + "Remove</button></div>" +
        '<div class="fields">' +
          inp("first", "First name", "text", "e.g. Laura", "", "A first name is needed.") +
          inp("last", "Last name", "text", "e.g. Smith") +
          inp("relation", "Relationship", "text", "e.g. " + who + "’s partner", "span2") +
          inp("email", "Email", "email", "name@example.com", "span2", "That doesn’t look like an email address.") +
          '<div class="field span2"><span class="label">Home address</span>' +
            '<label class="check"><input type="checkbox" data-act="same" data-p="' + i + '"' + (p.sameAddress ? " checked" : "") + "><span>Same address as " + esc(who) + "</span></label>" +
            (p.sameAddress ? "" : '<textarea id="p' + i + '-address" data-p="' + i + '" data-k="address" rows="3" placeholder="Street and number&#10;Postcode and city&#10;Country">' + esc(p.address) + "</textarea>") +
          "</div>" +
        "</div></div>";
    };
    return '<div class="sub-section"><div class="sub-head"><div><h3>+1s</h3><p class="muted">Partners or friends coming with ' + esc(who) + ".</p></div>" +
      '<button class="btn small" type="button" data-act="add-plus">' + ICON.plus + "Add a +1</button></div>" +
      g.plusOnes.map(block).join("") + "</div>";
  }

  function childrenHtml(g) {
    return '<div class="sub-section"><div class="sub-head"><div><h3>Children</h3><p class="muted">Kids coming with ' + esc(g.first || "this guest") + ".</p></div>" +
      '<div class="stepper" role="group" aria-label="Number of children">' +
        '<button class="icon-btn" type="button" data-act="kids" data-v="-1" aria-label="One fewer child"' + (g.children ? "" : " disabled") + ">" + ICON.minus + "</button>" +
        '<span class="kids-n" aria-live="polite">' + g.children + "</span>" +
        '<button class="icon-btn" type="button" data-act="kids" data-v="1" aria-label="One more child">' + ICON.plus + "</button>" +
      "</div></div>" +
      (g.children ? '<div class="field full"><label for="g-childrenNote">Names and ages <span class="muted">(optional)</span></label>' +
        '<input id="g-childrenNote" data-k="childrenNote" type="text" value="' + esc(g.childrenNote) + '" placeholder="e.g. Leo (6), Mia (3)" autocomplete="off"></div>' : "") +
      "</div>";
  }

  // Re-draw the open form, keeping the page where it is
  function rerenderEditor(focusId) {
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if (focusId && $(focusId)) $(focusId).focus({ preventScroll: true });
  }

  // ---------- actions ----------
  function openEditor(g) {
    editing = g
      ? Object.assign({}, g, { plusOnes: g.plusOnes.map(function (p) { return Object.assign({}, p); }) })
      : { id: null, first: "", last: "", side: "groom", priority: "1", relation: "", email: "", address: "", plusOnes: [], children: 0, childrenNote: "" };
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
    var emailOk = function (e) { return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); };
    mark("email", !emailOk(g.email));
    // A +1 left blank (the pre-filled last name doesn't count) is ignored; the rest need a first name.
    // Check against the on-screen positions first, then drop the blanks.
    var blank = function (p) { return !p.first.trim() && !p.email.trim() && !p.relation.trim() && !(p.address || "").trim(); };
    g.plusOnes.forEach(function (p, i) {
      p.first = p.first.trim(); p.last = p.last.trim(); p.email = p.email.trim(); p.relation = p.relation.trim();
      p.address = p.sameAddress ? "" : (p.address || "").trim();
      if (blank(p)) return;
      mark("p" + i + "-first", !p.first);
      mark("p" + i + "-email", !emailOk(p.email));
    });
    g.childrenNote = g.children ? g.childrenNote.trim() : "";
    if (!ok) { var bad = document.querySelector(".field.error"); if (bad) bad.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    g.plusOnes = g.plusOnes.filter(function (p) { return !blank(p); });
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
    // One row per adult; +1s list who they're coming with and share the guest's address when ticked
    var rows = [["First name", "Last name", "Type", "Coming with", "Side", "Priority", "Relationship", "Email", "Address", "Children", "Children names"]];
    guests.slice().sort(sortGuests).forEach(function (g) {
      var side = g.side === "groom" ? "Nate" : "Dilan";
      rows.push([g.first, g.last, "Guest", "", side, PRI[g.priority], g.relation, g.email, g.address, g.children || "", g.childrenNote]);
      g.plusOnes.forEach(function (p) {
        rows.push([p.first, p.last, "+1", fullName(g), side, PRI[g.priority], p.relation, p.email, p.sameAddress ? g.address : p.address, "", ""]);
      });
    });
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
    if (act === "add-plus") {
      editing.plusOnes.push({ id: Date.now(), first: "", last: editing.last || "", relation: "", email: "", address: "", sameAddress: true });
      return rerenderEditor("p" + (editing.plusOnes.length - 1) + "-first");
    }
    if (act === "remove-plus") { editing.plusOnes.splice(+b.dataset.p, 1); return rerenderEditor(); }
    if (act === "same") {
      var p = editing.plusOnes[+b.dataset.p];
      p.sameAddress = b.checked;
      return rerenderEditor(p.sameAddress ? null : "p" + b.dataset.p + "-address");
    }
    if (act === "kids") {
      editing.children = Math.max(0, Math.min(20, editing.children + +b.dataset.v));
      return rerenderEditor();
    }
    if (act === "filter") { filter = b.dataset.v; return render(); }
    if (act === "csv") return exportCsv();
  });
  app.addEventListener("input", function (e) {
    var k = e.target.dataset && e.target.dataset.k;
    var pi = e.target.dataset && e.target.dataset.p;
    if (k && editing && pi != null && e.target.type !== "checkbox") {
      editing.plusOnes[+pi][k] = e.target.value;
      var pf = e.target.closest(".field"); if (pf) pf.classList.remove("error");
      if (k === "first" || k === "last") { var h = e.target.closest(".plus").querySelector("h4"); h.textContent = fullName(editing.plusOnes[+pi]) || "+1"; }
      return;
    }
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
