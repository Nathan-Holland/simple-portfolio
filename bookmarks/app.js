// Bookmarks: websites and inspiration, in the wishlist's style.
//
// Data: { items: [{ id, url, title, description, image, icon, category, note, added }], categories: [...] }
// Saved to /api/store?doc=bookmarks (Vercel Blob, behind the private login) and kept in
// this browser as a backup. Link details come from /api/store?preview=<url>.
// Import accepts this app's JSON export or a browser bookmarks export (.html).
(function () {
  "use strict";

  var LS_KEY = "bookmarks";
  var LS_UPDATED = "bookmarksUpdated";
  var API = "/api/store?doc=bookmarks";
  var PREVIEW = "/api/store?preview=";
  var PREFS = "bookmarksPrefs";

  var items = [], categories = [], updated = null;
  var sync = "loading", reachable = false;
  var prefs = readPrefs();
  var filter = prefs.filter || "all", sort = prefs.sort || "new", query = "";
  var editing = null; // the bookmark open in the sheet

  var app = document.getElementById("app");
  var sheet = document.getElementById("sheet");
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var ICON = {
    plus: '<svg class="plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8M9 8h7v7"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
    import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  };

  // ---------- helpers ----------
  function readPrefs() { try { return JSON.parse(localStorage.getItem(PREFS) || "{}"); } catch (e) { return {}; } }
  function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify({ filter: filter, sort: sort })); } catch (e) { /* ignore */ } }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
  function normUrl(u) {
    try {
      var x = new URL(String(u).trim().match(/^[a-z]+:/i) ? String(u).trim() : "https://" + String(u).trim());
      if (!/^https?:$/.test(x.protocol)) return "";
      ["srsltid", "ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"].forEach(function (k) { x.searchParams.delete(k); });
      if (x.hash === "#top" || x.hash === "#") x.hash = "";
      return x.toString();
    } catch (e) { return ""; }
  }
  function sameUrl(a, b) { return normUrl(a).replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "") === normUrl(b).replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, ""); }
  function cleanItem(b, i) {
    var url = normUrl(b && b.url);
    if (!url) return null;
    var http = function (v) { return typeof v === "string" && /^https?:\/\//i.test(v) ? v : ""; };
    return {
      id: +b.id || Date.now() + i,
      url: url,
      title: String(b.title || "").trim().slice(0, 200),
      description: String(b.description || "").trim().slice(0, 300),
      image: http(b.image), icon: http(b.icon),
      category: String(b.category || "").trim().slice(0, 60),
      note: String(b.note || "").trim().slice(0, 1000),
      added: b.added && !isNaN(Date.parse(b.added)) ? b.added : new Date().toISOString(),
    };
  }
  function allCategories() {
    var seen = {}, out = [];
    categories.concat(items.map(function (b) { return b.category; })).forEach(function (c) { if (c && !seen[c]) { seen[c] = 1; out.push(c); } });
    return out;
  }

  // ---------- storage + sync ----------
  function readLocal() {
    try {
      var d = JSON.parse(localStorage.getItem(LS_KEY) || "null") || {};
      return { items: (d.items || []).map(cleanItem).filter(Boolean), categories: d.categories || [], updated: localStorage.getItem(LS_UPDATED) };
    } catch (e) { return { items: [], categories: [], updated: null }; }
  }
  function writeLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ items: items, categories: categories })); if (updated) localStorage.setItem(LS_UPDATED, updated); } catch (e) { /* storage full or blocked */ }
  }
  async function load() {
    var local = readLocal(), remote = null;
    try {
      var r = await fetch(API, { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { reachable = true; remote = (await r.json()).data; }
      else if (r.status === 401) sync = "signedout";
    } catch (e) { /* offline or no API */ }
    var use = function (d) { items = (d.items || []).map(cleanItem).filter(Boolean); categories = d.categories || []; updated = d.updated || null; };
    if (reachable) {
      sync = "synced";
      var localNewer = local.items.length && (!remote || !remote.updated || !local.updated || local.updated > remote.updated);
      if (localNewer) { use(local); push(); }
      else if (remote) use(remote);
      else use(local);
    } else {
      if (sync !== "signedout") sync = "device";
      use(local);
    }
    writeLocal();
  }
  var pushing = false, again = false;
  async function push() {
    if (!reachable) return renderSync();
    if (pushing) { again = true; return; }
    pushing = true; sync = "saving"; renderSync();
    try {
      var r = await fetch(API, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items, categories: categories }) });
      if (!r.ok) throw new Error(r.status);
      updated = (await r.json()).updated || updated;
      writeLocal();
      sync = "synced";
    } catch (e) { sync = "error"; }
    pushing = false;
    if (again) { again = false; return push(); }
    renderSync();
  }
  function save() { categories = allCategories(); updated = new Date().toISOString(); writeLocal(); push(); }

  function renderSync() {
    var el = $("sync");
    var m = { synced: ["ok", "Saved"], saving: ["", "Saving…"], device: ["warn", "This browser only"], error: ["err", "Not saved to your account"], signedout: ["err", "Signed out"], loading: ["", ""] }[sync];
    el.hidden = !m[1]; el.className = "sync " + m[0]; el.textContent = m[1];
    el.title = { device: "Saved in this browser. Saving to your account works on nate-holland.com.", error: "Couldn’t reach the server. Saved in this browser; it will retry on your next change." }[sync] || "";
  }
  var toastTimer;
  function toast(msg, err) {
    var t = $("toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  // ---------- link previews ----------
  async function fetchPreview(url) {
    var r = await fetch(PREVIEW + encodeURIComponent(url), { credentials: "same-origin" });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || "Couldn’t read that page");
    return j;
  }
  // After an import, fill in missing images and descriptions a few at a time
  async function fillMissing(list) {
    if (!reachable) return;
    var todo = list.filter(function (b) { return !b.image && !b.description; });
    var changed = 0;
    for (var i = 0; i < todo.length; i++) {
      try {
        var p = await fetchPreview(todo[i].url);
        var b = items.filter(function (x) { return x.id === todo[i].id; })[0];
        if (!b) continue;
        b.image = b.image || p.image || ""; b.icon = b.icon || p.icon || ""; b.description = b.description || p.description || "";
        if (!b.title) b.title = p.title || host(b.url);
        changed++;
        if (changed % 4 === 0) { render(); }
      } catch (e) { /* leave as is */ }
    }
    if (changed) { save(); render(); }
  }

  // ---------- render ----------
  function visible() {
    var q = query.toLowerCase();
    return items.filter(function (b) {
      if (filter === "none" ? b.category : filter !== "all" && b.category !== filter) return false;
      if (!q) return true;
      return [b.title, b.description, b.note, b.category, b.url].join(" ").toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      if (sort === "az") return (a.title || host(a.url)).localeCompare(b.title || host(b.url));
      if (sort === "old") return a.added.localeCompare(b.added);
      return b.added.localeCompare(a.added);
    });
  }

  function render() {
    renderSync();
    var cats = allCategories();
    if (filter !== "all" && filter !== "none" && cats.indexOf(filter) < 0) filter = "all";
    var uncategorised = items.filter(function (b) { return !b.category; }).length;
    $("eyebrow").textContent = items.length ? items.length + (items.length === 1 ? " website" : " websites") + " saved" : "Websites & inspiration";

    if (!items.length) {
      app.innerHTML = '<div class="empty"><h2>Nothing saved yet</h2><p>Save websites, tools and inspiration. Paste a link and its title and preview image are filled in for you.</p>' +
        '<div class="row"><button class="btn dark" type="button" data-act="add">' + ICON.plus + "Add a website</button>" +
        '<button class="btn" type="button" data-act="import">' + ICON.import.replace("<svg", '<svg width="15" height="15"') + "Import bookmarks</button></div></div>";
      return;
    }

    var tab = function (key, label, n) {
      return '<button type="button" role="tab" data-act="filter" data-v="' + esc(key) + '" aria-selected="' + (filter === key) + '">' + esc(label) + ' <span class="count">' + n + "</span></button>";
    };
    var list = visible();
    var html = '<div class="toolbar"><div class="filters" role="tablist" aria-label="Categories">' +
      tab("all", "All", items.length) +
      // Empty categories stay available in the add/edit sheet but don't get a tab
      cats.map(function (c) { var n = items.filter(function (b) { return b.category === c; }).length; return n ? tab(c, c, n) : ""; }).join("") +
      (uncategorised ? tab("none", "No category", uncategorised) : "") +
      '</div><div class="tools">' +
        '<label class="search">' + ICON.search + '<input type="search" id="q" placeholder="Search" value="' + esc(query) + '" aria-label="Search bookmarks"></label>' +
        '<label class="sort"><span class="visually-hidden">Sort</span><select id="sort" aria-label="Sort">' +
          [["new", "Newest"], ["old", "Oldest"], ["az", "A–Z"]].map(function (o) { return '<option value="' + o[0] + '"' + (sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
        "</select></label>" +
        '<div class="more-menu"><button class="icon-btn" type="button" id="moreBtn" aria-haspopup="menu" aria-expanded="false" aria-label="More">' + ICON.more + "</button>" +
          '<div class="menu" id="moreMenu" role="menu" hidden>' +
            '<button type="button" role="menuitem" data-act="import">' + ICON.import + "Import bookmarks</button>" +
            '<button type="button" role="menuitem" data-act="export">' + ICON.export + "Export as a file</button>" +
            '<button type="button" role="menuitem" data-act="refresh">' + ICON.refresh + "Refresh missing previews</button>" +
          "</div></div>" +
        '<button class="btn dark" type="button" data-act="add">' + ICON.plus + "Add</button>" +
      "</div></div>";

    html += list.length ? '<div class="grid">' + list.map(card).join("") + "</div>"
      : '<p class="empty">Nothing matches' + (query ? " “" + esc(query) + "”" : "") + ".</p>";
    app.innerHTML = html;
    // Broken images fall back to the site's icon
    app.querySelectorAll("img[data-fallback]").forEach(function (img) {
      img.addEventListener("error", function () {
        var b = items.filter(function (x) { return x.id === +img.dataset.fallback; })[0];
        if (b) img.replaceWith(fallbackEl(b));
      }, { once: true });
    });
  }

  function fallbackHtml(b) {
    var letter = esc((b.title || host(b.url)).trim().charAt(0).toUpperCase());
    return '<div class="fallback">' + (b.icon ? '<img src="' + esc(b.icon) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<span class=&quot;letter&quot;>' + letter + '</span>\'">' : '<span class="letter">' + letter + "</span>") +
      "<span>" + esc(host(b.url)) + "</span></div>";
  }
  function fallbackEl(b) { var d = document.createElement("div"); d.innerHTML = fallbackHtml(b); return d.firstChild; }

  function card(b) {
    var title = b.title || host(b.url);
    return '<article class="card">' +
      '<a href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(title) + ' (opens in a new tab)">' +
        '<div class="media">' + (b.image ? '<img class="shot" src="' + esc(b.image) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback="' + b.id + '">' : fallbackHtml(b)) +
          '<span class="open" aria-hidden="true">' + ICON.open + "</span></div>" +
        '<div class="info"><p class="meta">' + (b.icon ? '<img src="' + esc(b.icon) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : "") +
          "<span>" + esc(b.category ? b.category + " · " + host(b.url) : host(b.url)) + "</span></p>" +
          '<p class="name">' + esc(title) + "</p>" +
          (b.description ? '<p class="desc">' + esc(b.description) + "</p>" : "") +
          (b.note ? '<p class="note">' + esc(b.note) + "</p>" : "") +
        "</div></a>" +
      '<button class="edit" type="button" data-act="edit" data-id="' + b.id + '" aria-label="Edit ' + esc(title) + '">' + ICON.edit + "<span>Edit</span></button>" +
    "</article>";
  }

  // ---------- add / edit sheet ----------
  function openSheet(b) {
    editing = b ? Object.assign({}, b) : { id: null, url: "", title: "", description: "", image: "", icon: "", category: filter !== "all" && filter !== "none" ? filter : "", note: "" };
    renderSheet();
    sheet.showModal();
    setTimeout(function () { var f = $(editing.id == null ? "f-url" : "f-title"); if (f) f.focus(); }, 60);
  }
  function renderSheet(status, statusErr) {
    var b = editing, adding = b.id == null, cats = allCategories();
    var isNewCat = b.category && cats.indexOf(b.category) < 0;
    sheet.innerHTML = '<form class="sheet-body" id="sheetForm" novalidate>' +
      '<div class="sheet-head"><div><p class="eyebrow">' + (adding ? "New bookmark" : "Edit bookmark") + '</p><h2 id="sheetTitle">' + (adding ? "Save a website" : esc(b.title || host(b.url))) + "</h2></div>" +
        '<button class="icon-btn" type="button" data-act="close" aria-label="Close">' + ICON.x + "</button></div>" +
      '<div class="field" data-f="url"><label for="f-url">Website address</label><div class="url-row">' +
        '<input id="f-url" data-k="url" type="url" inputmode="url" placeholder="Paste a link, e.g. example.com" value="' + esc(b.url) + '" autocomplete="off">' +
        '<button class="btn" type="button" data-act="fetch">Get details</button></div><span class="err">Enter a website address.</span></div>' +
      '<p class="status' + (statusErr ? " err" : "") + '" id="status">' + esc(status || "") + "</p>" +
      (b.title || b.image || b.description ? '<div class="preview"><div class="pimg">' +
        (b.image ? '<img src="' + esc(b.image) + '" alt="" referrerpolicy="no-referrer">' : b.icon ? '<img class="ico" src="' + esc(b.icon) + '" alt="" referrerpolicy="no-referrer">' : "") +
        '</div><div class="ptext"><b>' + esc(b.title || host(b.url)) + "</b><span>" + esc(b.description || host(b.url)) + "</span></div></div>" : "") +
      '<div class="field"><label for="f-title">Title</label><input id="f-title" data-k="title" type="text" value="' + esc(b.title) + '" placeholder="Filled in from the website" autocomplete="off"></div>' +
      '<div class="field"><span class="label">Category</span><div class="chips">' +
        cats.map(function (c) { return '<button type="button" class="chip-btn" data-act="cat" data-v="' + esc(c) + '" aria-pressed="' + (b.category === c) + '">' + esc(c) + "</button>"; }).join("") +
        '<button type="button" class="chip-btn" data-act="cat" data-v="__new" aria-pressed="' + !!isNewCat + '">+ New</button></div>' +
        (isNewCat || b._newCat ? '<input id="f-cat" data-k="category" type="text" value="' + esc(isNewCat ? b.category : "") + '" placeholder="New category name" autocomplete="off">' : "") +
      "</div>" +
      '<div class="field"><label for="f-note">Note <span class="muted">(optional)</span></label><textarea id="f-note" data-k="note" placeholder="Why you saved it, what to look at…">' + esc(b.note) + "</textarea></div>" +
      '<div class="sheet-actions">' + (adding ? "" : '<button class="btn ghost danger" type="button" data-act="delete">Delete</button>') +
        '<span class="spacer"></span><button class="btn ghost" type="button" data-act="close">Cancel</button>' +
        '<button class="btn dark" type="submit">' + (adding ? "Save" : "Save changes") + "</button></div>" +
    "</form>";
  }

  async function getDetails() {
    var url = normUrl(editing.url);
    var f = sheet.querySelector('.field[data-f="url"]');
    if (!url) { f.classList.add("error"); return; }
    editing.url = url;
    var dupe = items.filter(function (x) { return x.id !== editing.id && sameUrl(x.url, url); })[0];
    renderSheet(dupe ? "Already saved as “" + (dupe.title || host(dupe.url)) + "”" + (dupe.category ? " in " + dupe.category : "") + "." : "Getting details…", !!dupe);
    if (dupe) return;
    try {
      var p = await fetchPreview(url);
      editing.url = normUrl(p.url) || url;
      editing.title = editing.title || p.title || host(url);
      editing.description = p.description || editing.description;
      editing.image = p.image || editing.image;
      editing.icon = p.icon || editing.icon;
      renderSheet(p.image ? "" : "No preview image on this site; its icon will be shown.");
    } catch (e) {
      if (!editing.title) editing.title = host(url);
      renderSheet(reachable ? "Couldn’t read that page. You can still save it." : "Details are filled in on nate-holland.com. You can still save it.", reachable);
    }
  }

  function submitSheet(e) {
    e.preventDefault();
    var b = editing, url = normUrl(b.url);
    var f = sheet.querySelector('.field[data-f="url"]');
    if (!url) { f.classList.add("error"); $("f-url").focus(); return; }
    var dupe = items.filter(function (x) { return x.id !== b.id && sameUrl(x.url, url); })[0];
    if (dupe) { renderSheet("Already saved as “" + (dupe.title || host(dupe.url)) + "”.", true); return; }
    b.url = url;
    b.title = (b.title || "").trim() || host(url);
    b.category = (b.category || "").trim();
    b.note = (b.note || "").trim();
    delete b._newCat;
    var adding = b.id == null;
    if (adding) { b.id = Date.now(); b.added = new Date().toISOString(); items.push(cleanItem(b)); }
    else items = items.map(function (x) { return x.id === b.id ? cleanItem(Object.assign({}, x, b)) : x; });
    sheet.close();
    editing = null;
    save(); render();
    toast(adding ? "Saved" : "Changes saved");
    // Added without details (e.g. offline)? Try once more in the background
    if (adding) fillMissing(items.filter(function (x) { return x.id === b.id; }));
  }

  // ---------- import / export ----------
  function parseBrowserHtml(text) {
    // Netscape bookmark format (Chrome, Safari, Firefox exports): folders are <H3>, links are <A HREF>
    var doc = new DOMParser().parseFromString(text, "text/html"), out = [];
    var walk = function (dl, folder) {
      Array.prototype.forEach.call(dl.children, function (dt) {
        if (dt.tagName !== "DT") return;
        var a = dt.querySelector(":scope > a"), h3 = dt.querySelector(":scope > h3"), sub = dt.querySelector(":scope > dl");
        if (a) out.push({ url: a.getAttribute("href"), title: a.textContent, category: folder, added: a.getAttribute("add_date") ? new Date(+a.getAttribute("add_date") * 1000).toISOString() : "", icon: "" });
        if (h3 && sub) walk(sub, /^(bookmarks bar|favourites bar|favorites bar|other bookmarks|bookmarks menu|favourites|favorites)$/i.test(h3.textContent.trim()) ? folder : h3.textContent.trim());
      });
    };
    var top = doc.querySelector("dl");
    if (top) walk(top, "");
    return { items: out, categories: [] };
  }
  async function importFile(file) {
    var text = await file.text(), data;
    try {
      if (/^\s*[{[]/.test(text)) { data = JSON.parse(text); if (Array.isArray(data)) data = { items: data }; }
      else data = parseBrowserHtml(text);
    } catch (e) { return toast("That file couldn’t be read", true); }
    var added = [], skipped = 0;
    (data.items || []).forEach(function (raw, i) {
      var b = cleanItem(Object.assign({}, raw, { id: Date.now() + i }), i);
      if (!b) return;
      if (items.some(function (x) { return sameUrl(x.url, b.url); })) { skipped++; return; }
      items.push(b); added.push(b);
    });
    (data.categories || []).forEach(function (c) { if (c && categories.indexOf(c) < 0) categories.push(c); });
    if (!added.length) return toast(skipped ? "Those are all saved already" : "No websites found in that file", !skipped);
    save(); render();
    toast("Imported " + added.length + (added.length === 1 ? " website" : " websites") + (skipped ? " (" + skipped + " already saved)" : ""));
    fillMissing(added);
  }
  function exportFile() {
    var blob = new Blob([JSON.stringify({ type: "nate-bookmarks", exported: new Date().toISOString(), items: items, categories: allCategories() }, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "bookmarks.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---------- events ----------
  function closeMenu() { var m = $("moreMenu"), b = $("moreBtn"); if (m) m.hidden = true; if (b) b.setAttribute("aria-expanded", "false"); }
  document.addEventListener("click", function (e) {
    if (e.target.closest("#moreBtn")) {
      var m = $("moreMenu"); m.hidden = !m.hidden; $("moreBtn").setAttribute("aria-expanded", String(!m.hidden)); return;
    }
    if (!e.target.closest("#moreMenu")) closeMenu();
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.dataset.act;
    if (act === "add") return openSheet(null);
    if (act === "edit") { e.preventDefault(); return openSheet(items.filter(function (x) { return x.id === +b.dataset.id; })[0]); }
    if (act === "filter") { filter = b.dataset.v; savePrefs(); return render(); }
    if (act === "import") { closeMenu(); return $("importFile").click(); }
    if (act === "export") { closeMenu(); return exportFile(); }
    if (act === "refresh") {
      closeMenu();
      if (!reachable) return toast("Previews load on nate-holland.com", true);
      var missing = items.filter(function (x) { return !x.image && !x.description; });
      toast(missing.length ? "Refreshing " + missing.length + " previews…" : "Nothing missing");
      return fillMissing(missing);
    }
    if (!editing) return;
    if (act === "close") { sheet.close(); editing = null; return; }
    if (act === "fetch") return getDetails();
    if (act === "cat") {
      if (b.dataset.v === "__new") { editing.category = ""; editing._newCat = true; renderSheet(); var c = $("f-cat"); if (c) c.focus(); return; }
      editing.category = editing.category === b.dataset.v ? "" : b.dataset.v;
      editing._newCat = false;
      return renderSheet();
    }
    if (act === "delete") {
      if (!confirm("Delete “" + (editing.title || host(editing.url)) + "”?")) return;
      var id = editing.id;
      items = items.filter(function (x) { return x.id !== id; });
      sheet.close(); editing = null; save(); render(); return toast("Deleted");
    }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "q") {
      query = e.target.value;
      var pos = e.target.selectionStart; render();
      var q = $("q"); q.focus(); q.setSelectionRange(pos, pos);
      return;
    }
    var k = e.target.dataset && e.target.dataset.k;
    if (k && editing) {
      editing[k] = e.target.value;
      var f = e.target.closest(".field"); if (f) f.classList.remove("error");
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "sort") { sort = e.target.value; savePrefs(); render(); }
    if (e.target.id === "importFile" && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ""; }
  });
  // Pasting a link fetches its details straight away
  document.addEventListener("paste", function (e) {
    if (e.target.id !== "f-url") return;
    setTimeout(function () { editing.url = $("f-url").value; if (normUrl(editing.url)) getDetails(); }, 0);
  });
  sheet.addEventListener("submit", function (e) { if (e.target.id === "sheetForm") submitSheet(e); });
  sheet.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "f-url") { e.preventDefault(); getDetails(); }
  });
  sheet.addEventListener("close", function () { editing = null; });
  sheet.addEventListener("click", function (e) { if (e.target === sheet) sheet.close(); }); // click the backdrop

  (async function init() { await load(); render(); })();
})();
