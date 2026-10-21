(() => {
  // Same paths locally (server.rb) and on Vercel (api/wishlist/*.js).
  const API = "/api/wishlist";

  const SORT_KEY = "wishlist-supply:sort";
  const ALL = "All";
  const BOUGHT = "Bought";

  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), filters = $("filters"), empty = $("empty");
  const detail = $("detail"), editor = $("editor"), form = $("form");

  const gsap = window.gsap;
  const Flip = window.Flip;
  if (gsap && Flip) gsap.registerPlugin(Flip);
  const motion = !!gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches;

  let items = [];
  let updatedAt = null;
  let active = ALL;
  let current = null; // id of item shown in detail
  let sortBy = "priority";
  try { sortBy = localStorage.getItem(SORT_KEY) || sortBy; } catch {}
  let firstRender = true;

  // ---------- editing access ----------
  // Visitors can browse; editing controls (.edit-only) appear once the wishlist password
  // has been entered. The server checks the session cookie on every write regardless.
  let canEdit = false;
  function setEditor(on, local = false) {
    canEdit = !!on;
    document.body.classList.toggle("can-edit", canEdit);
    document.body.classList.toggle("local", !!local);
  }
  async function checkSession() {
    try {
      const s = await fetch(API + "/session", { cache: "no-store" }).then((r) => r.json());
      setEditor(s.editor, s.local);
    } catch {
      setEditor(false);
    }
  }

  // ---------- storage (items.json via server.rb locally, Vercel Blob online) ----------
  async function load() {
    checkSession();
    try {
      const res = await fetch(API + "/items", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      items = data.items;
      updatedAt = data.updated;
    } catch {
      toast("Couldn't load the wishlist", true);
    }
    render();
  }
  async function save() {
    try {
      const res = await fetch(API + "/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (res.status === 401) {
        // Session expired or never signed in: lock editing and show what's actually stored.
        setEditor(false);
        toast("Sign in to edit", true);
        return load();
      }
      if (!res.ok) throw new Error((await res.json()).error);
      updatedAt = (await res.json()).updated;
      render();
    } catch (err) {
      toast("Not saved: " + (err.message || "server unavailable"), true);
    }
  }

  let toastTimer;
  function toast(msg, isError = false, action = null) {
    const t = $("toast");
    t.textContent = msg;
    if (action) {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "toast-action", textContent: action.label });
      b.onclick = () => { clearTimeout(toastTimer); t.hidden = true; action.run(); };
      t.append(b);
    }
    t.className = "toast" + (isError ? " error" : "");
    t.hidden = false;
    if (motion) gsap.fromTo(t, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), action ? 6000 : isError ? 5000 : 2200);
  }

  // ---------- helpers ----------
  const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const money = (n) => (n || n === 0 ? eur.format(n) : "");
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);
  const categories = () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
  const priorityLabel = { 1: "Really want", 2: "Want", 3: "Nice to have" };
  const prioDot = (p) => `<span class="prio p${p || 2}" title="${priorityLabel[p || 2]}" aria-label="${priorityLabel[p || 2]}"></span>`;

  // ---------- icons ----------
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON_ALL = svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>');
  const ICON_BOUGHT = svg('<circle cx="12" cy="12" r="8"/><path d="m8.5 12.2 2.3 2.3 4.7-4.8"/>');
  const ICON_OTHER = svg('<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7Z"/><circle cx="8" cy="8" r="1.3"/>');

  // Category name → icon. Categories are free text, so each matches several spellings;
  // first match wins, so more specific patterns come first.
  const CATEGORY_ICONS = [
    [/watch/i, '<circle cx="12" cy="12" r="5"/><path d="M12 9.8V12l1.5 1M9 7.8 9.6 3h4.8l.6 4.8M9 16.2l.6 4.8h4.8l.6-4.8"/>'],
    [/foot|shoe|sneaker|trainer|boot|loafer|sandal/i, '<path d="M3 9.5V17h18v-1.2a2.3 2.3 0 0 0-1.8-2.2l-4.7-1L10.3 8.6 8 10.4 5.6 9.5Z"/><path d="M3 17v2h18v-2M11 11.2l1.4-1M13 12.4l1.3-.9"/>'],
    [/outer|jacket|coat|blazer|parka/i, '<path d="M9 3.5 4.5 6v14h15V6L15 3.5"/><path d="m9 3.5 3 3 3-3M12 6.5V20M4.5 12h3M16.5 12h3"/>'],
    [/bottom|trouser|pant|jean|short|skirt|chino/i, '<path d="M6.5 4h11l1 16h-4.3L12 10l-2.2 10H5.5Z"/><path d="M6.4 7h11.2"/>'],
    [/\btops?\b|shirt|\btees?\b|knit|sweat|hood|polo|cloth|apparel/i, '<path d="M9 4 4 6.5l1.8 4L8 9.6V20h8V9.6l2.2.9 1.8-4L15 4a3 3 0 0 1-6 0Z"/>'],
    [/\bhats?\b|\bcaps?\b|beanie|headwear/i, '<path d="M4 15.5a8 8 0 0 1 16 0Z"/><path d="M20 15.5h1.5M12 7.5V6"/>'],
    [/glass|eyewear|sunnies|optic/i, '<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3M3.5 14 3 9.5M20.5 14l.5-4.5"/>'],
    [/jewel|\brings?\b|necklace|bracelet|earring/i, '<path d="M7 4h10l3.5 5L12 20 3.5 9Z"/><path d="M3.5 9h17M9.5 4 12 9l2.5-5M12 9v11"/>'],
    [/bag|tote|backpack|wallet|access/i, '<path d="M5.5 8.5h13l-1 11.5h-11Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>'],
    [/fragrance|perfume|scent|beauty|skin|groom|cologne/i, '<rect x="6" y="9" width="12" height="11" rx="2.5"/><path d="M10 9V6h4v3M9.5 3.5h5"/>'],
    [/book|reading|magazine|\bzines?\b/i, '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z"/><path d="M12 6.5v13"/>'],
    [/coffee|\btea\b|espresso|\bmugs?\b|cafe/i, '<path d="M4.5 9.5h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M15.5 11h1.5a2.5 2.5 0 0 1 0 5h-1.8M8 3.5c-.6 1 .6 2 0 3M11.5 3.5c-.6 1 .6 2 0 3"/>'],
    [/kitchen|cook|food|drink|bar\b/i, '<path d="M7 3.5v17M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5M17 20.5V3.5c-2 1-3 3.5-3 6.5s1 3.5 3 3.5"/>'],
    [/headphone|audio|speaker|hifi|hi-fi|sound/i, '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>'],
    [/music|vinyl|record|album|instrument/i, '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'],
    [/camera|photo|film/i, '<path d="M3.5 8.5a2 2 0 0 1 2-2h2l1.5-2.5h6L16.5 6.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.5"/>'],
    [/game|gaming|console/i, '<path d="M7 7.5h10a4.5 4.5 0 0 1 4.4 5.5l-.9 4a2.5 2.5 0 0 1-4.3 1.1L14.5 16h-5l-1.7 2.1a2.5 2.5 0 0 1-4.3-1.1l-.9-4A4.5 4.5 0 0 1 7 7.5Z"/><path d="M8 10.5v3M6.5 12h3M15.5 11.5h.01M17.5 13h.01"/>'],
    [/tech|gadget|electronic|computer|laptop|phone|desk setup/i, '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18M9 15l-.5 4M15 15l.5 4"/>'],
    [/light|lamp/i, '<path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17.5h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5Z"/>'],
    [/furniture|chair|sofa|seating/i, '<path d="M6.5 11V5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 17.5 5v6M5 11h14v4H5ZM6.5 15v5.5M17.5 15v5.5"/>'],
    [/home|decor|interior|living|candle/i, '<path d="M4 10.5 12 4l8 6.5V20H4Z"/><path d="M9.5 20v-5.5h5V20"/>'],
    [/plant|garden|flower/i, '<path d="M12 20.5V11M12 11c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5ZM12 14c0-3-2.3-5-5.5-5 0 3 2.3 5 5.5 5ZM7.5 20.5h9"/>'],
    [/\bart\b|artwork|poster|\bprints?\b|frame/i, '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="m4 16 4.5-4.5L13 16l2.5-2.5L20 18"/><circle cx="15" cy="9" r="1.5"/>'],
    [/stationery|\bpens?\b|notebook|office|writ/i, '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>'],
    [/sport|fitness|\bgym\b|outdoor|running|\bbikes?\b|cycl/i, '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6 6c3 3 3 9 0 12M18 6c-3 3-3 9 0 12"/>'],
    [/travel|luggage|suitcase|\btrips?\b/i, '<rect x="5" y="7" width="14" height="12.5" rx="2"/><path d="M9.5 7V4.5h5V7M9 7v12.5M15 7v12.5"/>'],
    [/toy|kid|baby|child/i, '<circle cx="12" cy="13" r="6.5"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/><path d="M10 14.5c1 1 3 1 4 0M10 11.5h.01M14 11.5h.01"/>'],
    [/gift|present/i, '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3.5 9h17M12 9v11M12 9C10 9 7.5 8 7.5 6a1.8 1.8 0 0 1 3.4-.9L12 9l1.1-3.9a1.8 1.8 0 0 1 3.4.9c0 2-2.5 3-4.5 3Z"/>'],
  ].map(([re, d]) => [re, svg(d)]);

  function iconFor(tab) {
    if (tab === ALL) return ICON_ALL;
    if (tab === BOUGHT) return ICON_BOUGHT;
    return CATEGORY_ICONS.find(([re]) => re.test(tab))?.[1] || ICON_OTHER;
  }
  const ARROW = svg('<path d="M7 17 17 7M8.5 7H17v8.5"/>');
  const CHECK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>');
  const ICON_LINK = svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>');

  // ---------- linked items ----------
  // item.needs = ids of items to buy first (e.g. a game needs the console's disc drive).
  // Ids of deleted items are simply ignored, so Undo brings links back intact.
  const byId = (id) => items.find((x) => x.id === id);
  const needsOf = (i) => (i.needs || []).map(byId).filter(Boolean);
  const stillNeeded = (i) => needsOf(i).filter((n) => !n.bought);
  const neededFor = (i) => items.filter((x) => (x.needs || []).includes(i.id));
  // Does `item` need `id`, directly or through something it needs? (stops loops when linking)
  function needsDeep(item, id, seen = new Set()) {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return needsOf(item).some((n) => n.id === id || needsDeep(n, id, seen));
  }
  const andList = (names) => names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];

  // ---------- sorting ----------
  const SORTS = {
    priority: { label: "Most wanted", fn: (a, b) => (a.priority || 2) - (b.priority || 2) || newest(a, b) },
    newest:   { label: "Newest", fn: (a, b) => newest(a, b) },
    priceAsc: { label: "Price: low to high", fn: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) },
    priceDesc:{ label: "Price: high to low", fn: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) },
    name:     { label: "Name: A–Z", fn: (a, b) => a.name.localeCompare(b.name) },
    brand:    { label: "Brand: A–Z", fn: (a, b) => (a.brand || "").localeCompare(b.brand || "") || a.name.localeCompare(b.name) },
  };
  if (!SORTS[sortBy]) sortBy = "priority";
  // Items without an "added" date keep file order (new items are inserted at the top).
  function newest(a, b) {
    const ta = a.added ? Date.parse(a.added) : 0, tb = b.added ? Date.parse(b.added) : 0;
    return tb - ta || items.indexOf(a) - items.indexOf(b);
  }

  // Images go through the /img proxy (server.rb locally, api/wishlist/img.js on Vercel) so they're same-origin and their pixels can be read.
  const proxied = (url) => API + "/img?url=" + encodeURIComponent(url);

  function media(item) {
    return item.image
      ? `<img src="${esc(proxied(item.image))}" alt="${esc(item.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'placeholder',textContent:'${esc(item.brand || item.category || "Item")}'}))" />`
      : `<span class="placeholder">${esc(item.brand || item.category || "Item")}</span>`;
  }

  // ---------- tile background = the photo's edge colour ----------
  const bgCache = new Map();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Most common colour around the image border (ignores transparent pixels).
  function edgeColor(img) {
    const s = 48, ring = 2;
    canvas.width = canvas.height = s;
    ctx.clearRect(0, 0, s, s);
    ctx.drawImage(img, 0, 0, s, s);
    const d = ctx.getImageData(0, 0, s, s).data;
    const buckets = new Map();
    let total = 0, clear = 0;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (x >= ring && y >= ring && x < s - ring && y < s - ring) continue;
        total++;
        const i = (y * s + x) * 4;
        if (d[i + 3] < 200) { clear++; continue; }
        const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
        const b = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
        b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; b.n++;
        buckets.set(key, b);
      }
    }
    if (clear > total / 2 || !buckets.size) return null; // transparent cut-out: keep the default tile
    const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
    return `rgb(${Math.round(top.r / top.n)}, ${Math.round(top.g / top.n)}, ${Math.round(top.b / top.n)})`;
  }

  function tint(img) {
    const box = img.parentElement;
    if (!box) return;
    if (!bgCache.has(img.src)) {
      try { bgCache.set(img.src, edgeColor(img)); } catch { bgCache.set(img.src, null); }
    }
    const c = bgCache.get(img.src);
    if (c) box.style.backgroundColor = c;
  }
  // `load` doesn't bubble, so listen in the capture phase for every product image.
  document.addEventListener("load", (e) => {
    if (e.target.tagName === "IMG" && e.target.closest(".media, .detail-media")) tint(e.target);
  }, true);

  // ---------- render ----------
  // ---------- bought ----------
  /** Marks an item bought (stamping when) or back to wanted. */
  function setBought(item, bought) {
    if (bought && !item.bought) item.boughtAt = new Date().toISOString();
    if (!bought) delete item.boughtAt;
    item.bought = !!bought;
  }

  // The Bought tab's summary: total spent, a few stats, and spend by category.
  // Numbers count up and bars grow each time you open the tab.
  let summaryShown = false;
  function renderBoughtSummary() {
    const box = $("boughtSummary");
    const show = active === BOUGHT;
    box.hidden = !show;
    if (!show) { summaryShown = false; return; }

    const bought = items.filter((i) => i.bought);
    const wantedNow = items.filter((i) => !i.bought);
    const priced = bought.filter((i) => Number(i.price) > 0);
    const total = priced.reduce((s, i) => s + Number(i.price), 0);
    const stillTotal = wantedNow.reduce((s, i) => s + (Number(i.price) || 0), 0);

    if (!bought.length) {
      box.innerHTML = `
        <div class="bs-empty">
          <div class="bs-empty-icon">${ICON_BOUGHT}</div>
          <p class="bs-empty-title">Nothing bought yet</p>
          <p class="bs-empty-sub">When you mark something as bought, your total spend and stats show up here.${stillTotal ? ` For now, ${money(stillTotal)} is still on the list.` : ""}</p>
        </div>`;
      summaryShown = true;
      return;
    }

    const biggest = priced.reduce((a, b) => (Number(b.price) > Number(a?.price || 0) ? b : a), null);
    const waits = bought
      .filter((i) => i.added && i.boughtAt)
      .map((i) => (Date.parse(i.boughtAt) - Date.parse(i.added)) / 864e5)
      .filter((d) => d >= 0);
    const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
    const waitText = avgWait === null ? null
      : avgWait < 1 ? "Same day"
      : avgWait < 14 ? `${Math.round(avgWait)} day${Math.round(avgWait) === 1 ? "" : "s"}`
      : `${Math.round(avgWait / 7)} weeks`;

    const byCat = new Map();
    for (const i of priced) {
      const c = i.category || "Other";
      byCat.set(c, (byCat.get(c) || 0) + Number(i.price));
    }
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const top = cats[0]?.[1] || 1;

    box.innerHTML = `
      <div class="bs-hero">
        <p class="bs-label">You’ve spent</p>
        <p class="bs-total" data-count="${total}">${money(total)}</p>
        <p class="bs-sub">on ${bought.length} thing${bought.length === 1 ? "" : "s"} you stopped pretending about</p>
      </div>
      <div class="bs-stats">
        <div class="bs-stat"><span class="bs-stat-label">Average price</span><span class="bs-stat-value" data-count="${priced.length ? total / priced.length : 0}">${money(priced.length ? total / priced.length : 0)}</span></div>
        <div class="bs-stat"><span class="bs-stat-label">Biggest buy</span><span class="bs-stat-value">${biggest ? money(biggest.price) : "—"}</span>${biggest ? `<span class="bs-stat-note">${esc(biggest.name)}</span>` : ""}</div>
        <div class="bs-stat"><span class="bs-stat-label">Average wait</span><span class="bs-stat-value">${waitText || "—"}</span><span class="bs-stat-note">${waitText ? "from wishlist to bought" : "shows once you buy from the list"}</span></div>
      </div>
      ${cats.length ? `
      <div class="bs-cats">
        <p class="bs-label">By category</p>
        ${cats.map(([c, v]) => `
          <div class="bs-cat">
            <span class="bs-cat-name">${iconFor(c)}${esc(c)}</span>
            <span class="bs-bar"><span style="--w:${(v / top) * 100}%"></span></span>
            <span class="bs-cat-value">${money(v)}<small>${Math.round((v / total) * 100)}%</small></span>
          </div>`).join("")}
      </div>` : ""}
      ${stillTotal ? `<p class="bs-still">Still pretending: <strong>${money(stillTotal)}</strong> across ${wantedNow.length} thing${wantedNow.length === 1 ? "" : "s"} on your list.</p>` : ""}`;

    // Animate when the tab is opened (not on every re-render while it's open).
    const firstShow = !summaryShown;
    summaryShown = true;
    if (!firstShow) { box.classList.add("bs-in"); return; }
    box.classList.remove("bs-in");
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("bs-in"))); // bars grow via CSS
    if (motion) {
      gsap.from(box.querySelectorAll(".bs-hero, .bs-stat, .bs-cats, .bs-still"), { opacity: 0, y: 14, duration: 0.6, ease: "power3.out", stagger: 0.07 });
      box.querySelectorAll("[data-count]").forEach((el) => {
        const to = Number(el.dataset.count) || 0;
        const n = { v: 0 };
        gsap.to(n, { v: to, duration: 1.1, ease: "power3.out", onUpdate: () => (el.textContent = money(Math.round(n.v))) });
      });
    }
  }

  function render() {
    const wanted = items.filter((i) => !i.bought);
    $("updated").textContent = updatedAt
      ? `Updated ${new Date(updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`
      : "Personal wishlist";

    // filters (keep the sliding indicator element, replace the buttons)
    const tabs = [ALL, ...categories(), BOUGHT];
    if (!tabs.includes(active)) active = ALL;
    filters.querySelectorAll("button").forEach((b) => b.remove());
    filters.insertAdjacentHTML(
      "beforeend",
      tabs
        .map((t) => {
          const n = t === ALL ? wanted.length : t === BOUGHT ? items.length - wanted.length : wanted.filter((i) => i.category === t).length;
          return `<button role="tab" aria-selected="${t === active}" data-tab="${esc(t)}">${iconFor(t)}<span>${esc(t)}</span><span class="count">${n}</span></button>`;
        })
        .join("")
    );
    moveIndicator(firstRender);
    $("cats").innerHTML = categories().map((c) => `<option value="${esc(c)}">`).join("");
    renderSortMenu();
    renderBoughtSummary();

    // cards — persistent elements; filtering hides them, sorting reorders them, Flip animates the move.
    // Cards that are leaving fade out first; then the rest move into place.
    const shown = items
      .filter((i) => (active === BOUGHT ? i.bought : !i.bought && (active === ALL || i.category === active)))
      .sort(SORTS[sortBy].fn);
    const shownIds = new Set(shown.map((i) => i.id));

    leaveTween?.kill();
    leaveTween = null;
    const leaving = motion && !firstRender
      ? [...cardEls.values()].filter((el) => !el.hidden && !shownIds.has(el.dataset.id))
      : [];
    if (leaving.length) {
      leaveTween = gsap.to(leaving, {
        opacity: 0,
        scale: 0.96,
        duration: 0.4,
        ease: "power2.inOut",
        stagger: { amount: Math.min(0.2, 0.04 * (leaving.length - 1)) },
        onComplete: () => { leaveTween = null; layoutCards(shown, shownIds); },
      });
      return;
    }
    layoutCards(shown, shownIds);
  }

  function layoutCards(shown, shownIds) {
    let state = null;
    if (motion && !firstRender) {
      state = Flip.getState(visible()); // captures mid-animation positions too
      flip?.kill();
      const all = [...cardEls.values()];
      gsap.killTweensOf(all, "x,y,opacity,scale");
      gsap.set(all, { clearProps: "transform,opacity" });
    }

    syncCards();
    for (const [id, el] of cardEls) el.hidden = !shownIds.has(id);
    for (const i of shown) grid.appendChild(cardEls.get(i.id)); // moves into sorted order
    empty.hidden = shown.length > 0;

    if (!motion) return;
    if (firstRender) {
      gsap.from(".hero > *", { y: 14, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.08 });
      gsap.from(".toolbar", { y: 10, opacity: 0, duration: 0.7, ease: "power3.out", delay: 0.2 });
      gsap.from(visible(), { y: 28, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.05, delay: 0.25, clearProps: "transform,opacity" });
      firstRender = false;
    } else {
      flip = Flip.from(state, {
        targets: visible(),
        duration: 0.6,
        ease: "power3.inOut",
        onEnter: (els) =>
          gsap.fromTo(els, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.45, ease: "power3.out", delay: 0.12, stagger: 0.03, clearProps: "transform,opacity" }),
        onComplete: () => gsap.set(visible(), { clearProps: "transform" }),
      });
    }
  }

  // Frosted pill on the photo: what this item still needs, with tiny thumbnails.
  function needsBadge(waiting) {
    const thumbs = waiting.slice(0, 3)
      .map((n) => `<span class="nb-thumb">${n.image ? `<img src="${esc(proxied(n.image))}" alt="" loading="lazy" onerror="this.remove()" />` : ""}</span>`)
      .join("");
    const label = waiting.length === 1 ? waiting[0].name : `${waiting.length} items`;
    return `<span class="needs-badge" title="Buy first: ${esc(andList(waiting.map((n) => n.name)))}">
        <span class="nb-thumbs">${thumbs}</span><span class="nb-text"><span class="nb-pre">Needs</span> ${esc(label)}</span>
      </span>`;
  }

  // One element per item, rebuilt only when that item's data changes.
  const cardEls = new Map();
  const visible = () => [...cardEls.values()].filter((el) => !el.hidden);
  let flip = null;
  let leaveTween = null;
  function syncCards() {
    const ids = new Set(items.map((i) => i.id));
    for (const [id, el] of cardEls) if (!ids.has(id)) { el.remove(); cardEls.delete(id); }
    for (const i of items) {
      const waiting = i.bought ? [] : stillNeeded(i);
      const sig = JSON.stringify(i) + "|" + waiting.map((n) => n.id).join();
      const old = cardEls.get(i.id);
      if (old?.dataset.sig === sig) continue;
      const el = document.createElement("article");
      el.className = "card" + (i.bought ? " bought" : "");
      el.tabIndex = 0;
      el.dataset.id = i.id;
      el.dataset.flipId = i.id;
      el.dataset.sig = sig;
      el.setAttribute("aria-label", i.name);
      el.innerHTML = `
        <div class="media">
          ${i.bought ? "" : prioDot(i.priority)}
          ${i.link ? `<a class="ext" href="${esc(i.link)}" target="_blank" rel="noopener" aria-label="Open ${esc(i.name)} on the store site">${ARROW}</a>` : ""}
          ${media(i)}
          ${waiting.length ? needsBadge(waiting) : ""}
        </div>
        <div class="info">
          <p class="meta">${esc([i.brand, i.category].filter(Boolean).join(" · "))}</p>
          <p class="name">${esc(i.name)}</p>
          <p class="price">${money(i.price)}</p>
        </div>`;
      bindHover(el);
      if (old) old.replaceWith(el);
      else grid.appendChild(el);
      cardEls.set(i.id, el);
    }
  }

  function moveIndicator(instant) {
    const ind = filters.querySelector(".indicator");
    const btn = filters.querySelector('[aria-selected="true"]');
    if (!ind || !btn) return;
    const props = { x: btn.offsetLeft, width: btn.offsetWidth };
    if (motion && !instant) gsap.to(ind, { ...props, duration: 0.5, ease: "power3.out" });
    else if (gsap) gsap.set(ind, props);
    else Object.assign(ind.style, { transform: `translateX(${props.x}px)`, width: props.width + "px" });
  }
  addEventListener("resize", () => moveIndicator(true));
  document.fonts?.ready.then(() => moveIndicator(true));

  // ---------- hover (GSAP) ----------
  function bindHover(card) {
    if (!motion) return;
    const img = card.querySelector(".media img");
    const ext = card.querySelector(".ext");
    const arrow = ext?.querySelector("svg");
    // The lift itself is CSS `translate` (see .card:hover) so it never fights Flip's transforms.
    card.addEventListener("mouseenter", () => {
      if (img) gsap.to(img, { scale: 1.06, duration: 1.1, ease: "power3.out", overwrite: "auto" });
      if (ext) gsap.to(ext, { scale: 1.08, duration: 0.4, ease: "back.out(2)", overwrite: "auto" });
    });
    card.addEventListener("mouseleave", () => {
      if (img) gsap.to(img, { scale: 1, duration: 0.9, ease: "power3.out", overwrite: "auto" });
      if (ext) gsap.to(ext, { scale: 1, duration: 0.4, ease: "power3.out", overwrite: "auto" });
    });
    if (ext) {
      // Arrow shoots out the top-right corner and comes back in from the bottom-left
      ext.addEventListener("mouseenter", () => {
        gsap.timeline({ overwrite: true })
          .to(arrow, { x: 14, y: -14, duration: 0.2, ease: "power2.in" })
          .set(arrow, { x: -14, y: 14 })
          .to(arrow, { x: 0, y: 0, duration: 0.35, ease: "power3.out" });
      });
    }
  }

  // ---------- sort menu ----------
  const sortBtn = $("sortBtn"), sortMenu = $("sortMenu");
  function renderSortMenu() {
    $("sortValue").textContent = SORTS[sortBy].label;
    sortMenu.innerHTML = Object.entries(SORTS)
      .map(([k, s]) => `<li role="option" tabindex="-1" data-sort="${k}" aria-selected="${k === sortBy}"><span>${s.label}</span>${CHECK}</li>`)
      .join("");
  }
  function toggleSort(open = sortMenu.hidden) {
    sortBtn.setAttribute("aria-expanded", open);
    const chev = sortBtn.querySelector(".chev");
    if (open) {
      toggleSiteMenu(false);
      sortMenu.hidden = false;
      sortMenu.querySelector('[aria-selected="true"]')?.focus();
      if (motion) {
        gsap.fromTo(sortMenu, { opacity: 0, y: -6, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out" });
        gsap.from(sortMenu.children, { opacity: 0, y: -4, duration: 0.25, stagger: 0.025, ease: "power2.out" });
        gsap.to(chev, { rotation: 180, duration: 0.3, ease: "power3.out" });
      }
    } else if (!sortMenu.hidden) {
      if (motion) {
        gsap.to(chev, { rotation: 0, duration: 0.3, ease: "power3.out" });
        gsap.to(sortMenu, { opacity: 0, y: -6, scale: 0.97, duration: 0.18, ease: "power2.in", onComplete: () => (sortMenu.hidden = true) });
      } else sortMenu.hidden = true;
    }
  }
  sortBtn.onclick = (e) => { e.stopPropagation(); toggleSort(); };
  sortMenu.addEventListener("click", (e) => {
    const li = e.target.closest("[data-sort]");
    if (!li) return;
    sortBy = li.dataset.sort;
    try { localStorage.setItem(SORT_KEY, sortBy); } catch {}
    toggleSort(false);
    sortBtn.focus();
    render();
  });
  sortMenu.addEventListener("keydown", (e) => {
    const opts = [...sortMenu.children];
    const i = opts.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); opts[(i + 1) % opts.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length].focus(); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.activeElement.click(); }
    if (e.key === "Escape") { toggleSort(false); sortBtn.focus(); }
  });
  document.addEventListener("click", (e) => { if (!$("sort").contains(e.target)) toggleSort(false); });

  // ---------- site menu (top-left mark): switch between portfolio sections ----------
  const siteMenuBtn = $("siteMenuBtn"), siteMenuList = $("siteMenuList");
  const siteLinks = () => [...siteMenuList.querySelectorAll("a")];
  function toggleSiteMenu(open = siteMenuList.hidden) {
    siteMenuBtn.setAttribute("aria-expanded", open);
    siteMenuBtn.setAttribute("aria-label", open ? "Close site menu" : "Open site menu");
    if (open) {
      toggleSort(false);
      siteMenuList.hidden = false;
      siteLinks()[0]?.focus();
      if (motion) {
        gsap.fromTo(siteMenuList, { opacity: 0, y: -6, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out" });
        gsap.from(siteMenuList.children, { opacity: 0, y: -4, duration: 0.25, stagger: 0.03, ease: "power2.out" });
      }
    } else if (!siteMenuList.hidden) {
      if (motion) gsap.to(siteMenuList, { opacity: 0, y: -6, scale: 0.97, duration: 0.18, ease: "power2.in", onComplete: () => (siteMenuList.hidden = true) });
      else siteMenuList.hidden = true;
    }
  }
  siteMenuBtn.onclick = (e) => { e.stopPropagation(); toggleSiteMenu(); };
  siteMenuList.addEventListener("keydown", (e) => {
    const links = siteLinks();
    const i = links.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); links[(i + 1) % links.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
    if (e.key === "Escape") { toggleSiteMenu(false); siteMenuBtn.focus(); }
  });
  document.addEventListener("click", (e) => { if (!$("siteMenu").contains(e.target)) toggleSiteMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !siteMenuList.hidden) { toggleSiteMenu(false); siteMenuBtn.focus(); } });

  // ---------- dialogs ----------
  // Entrance is a CSS animation (dialog[open]). Don't tween a modal <dialog> with GSAP: its first
  // transform read briefly detaches fixed-position elements, which drops the dialog out of modal mode.
  function showDialog(d) {
    d.showModal();
  }

  // ---------- card ⇄ detail morph ----------
  // A stand-in copy of the card ("ghost") grows from the card into the dialog's position, then the
  // real dialog takes over. The ghost is animated by setting sizes each frame (GSAP tweens a plain
  // number), never by GSAP-transforming the <dialog> itself, which would drop it out of modal mode.
  let openCard = null;
  let morphTween = null;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const lerpRect = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
  const place = (el, r) => Object.assign(el.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
  const onScreen = (r) => r.w > 0 && r.y + r.h > 0 && r.y < innerHeight && r.x + r.w > 0 && r.x < innerWidth;

  function buildGhost(card) {
    const g = document.createElement("div");
    g.className = "morph";
    const m = document.createElement("div");
    m.className = "morph-media";
    m.style.backgroundColor = getComputedStyle(card.querySelector(".media")).backgroundColor;
    const pic = card.querySelector(".media img, .media .placeholder")?.cloneNode(true);
    if (pic) { pic.removeAttribute("style"); pic.removeAttribute("loading"); m.appendChild(pic); }
    const info = card.querySelector(".info").cloneNode(true);
    info.className = "info morph-info";
    g.append(m, info);
    return { g, m, pic, info };
  }

  // p = 0 is the card, p = 1 is the dialog.
  function morph(card, from, to, onDone) {
    const dMedia = $("dMedia");
    const C = rect(card), CM = rect(card.querySelector(".media")), CI = rect(card.querySelector(".info"));
    const D = rect(detail), M = rect(dMedia);
    const dImg = dMedia.querySelector("img");
    const pad = dImg ? parseFloat(getComputedStyle(dImg).paddingTop) || 0 : 0;
    const cardImg = card.querySelector(".media img");
    const startScale = cardImg ? Number(gsap.getProperty(cardImg, "scale")) || 1 : 1;
    const { g, m, pic, info } = buildGhost(card);
    detail.appendChild(g);
    const step = (p) => {
      const R = lerpRect(C, D, p), MR = lerpRect(CM, M, p);
      place(g, R);
      g.style.borderRadius = lerp(16, 20, p) + "px";
      place(m, { x: MR.x - R.x, y: MR.y - R.y, w: MR.w, h: MR.h });
      m.style.borderRadius = lerp(10, 0, p) + "px";
      if (pic?.tagName === "IMG") {
        pic.style.padding = lerp(0, pad, p) + "px";
        pic.style.transform = `scale(${lerp(startScale, 1, p)})`;
      }
      Object.assign(info.style, { left: CI.x - C.x + "px", top: CI.y - C.y + "px", width: CI.w + "px", opacity: Math.max(0, 1 - p / 0.3) });
      if (to > from) detail.classList.toggle("reveal", p > 0.45);
    };
    const state = { p: from };
    step(from);
    morphTween?.kill();
    morphTween = gsap.to(state, {
      p: to,
      duration: to > from ? 0.6 : 0.45,
      delay: to > from ? 0 : 0.16, // on close, let the content stagger out first
      ease: "power3.inOut",
      onUpdate: () => step(state.p),
      onComplete: () => { g.remove(); morphTween = null; onDone?.(); },
    });
  }

  function closeDetailMorph() {
    const card = openCard;
    const ok = motion && !reduceMotion && card?.isConnected && !card.hidden && onScreen(rect(card));
    if (!ok) return detail.close();
    detail.classList.add("morphing", "closing");
    detail.classList.remove("reveal"); // content staggers out (reverse order, see .staged.closing)
    morph(card, 1, 0, () => { cleanupDetail(); detail.close(); });
  }

  function cleanupDetail() {
    morphTween?.kill();
    morphTween = null;
    detail.querySelectorAll(".morph").forEach((g) => g.remove());
    detail.classList.remove("morphing", "reveal", "closing", "no-anim", "staged");
    if (openCard) openCard.style.visibility = "";
    openCard = null;
  }
  detail.addEventListener("close", () => { if (!detail.open) cleanupDetail(); }); // async: skip if it's already reopened

  // ---------- savings calculator (detail modal) ----------
  // Pick 1/3/6/12 months; shows what to put aside per month and per week,
  // rounded UP to whole euros so sticking to the plan always covers the price.
  const SAVE_KEY = "wishlist-supply:saveMonths";
  const saver = $("dSaver"), saverPeriods = $("saverPeriods");
  let saveMonths = 3;
  try { saveMonths = Number(localStorage.getItem(SAVE_KEY)) || 3; } catch {}
  let saverItem = null;
  const shownAmount = { v: 0 };

  // instant = jump straight there (when an item opens) instead of sliding.
  function placeSegIndicator(instant) {
    const btn = saverPeriods.querySelector('[aria-checked="true"]');
    const ind = saverPeriods.querySelector(".seg-indicator");
    if (!btn || !ind) return;
    if (instant) ind.style.transition = "none";
    ind.style.translate = btn.offsetLeft + "px 0";
    ind.style.width = btn.offsetWidth + "px";
    if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
  }

  function updateSaver(animate) {
    const price = Number(saverItem?.price) || 0;
    const target = new Date();
    target.setMonth(target.getMonth() + saveMonths);
    const weeks = Math.max(1, (target - Date.now()) / (7 * 864e5));
    const monthly = Math.ceil(price / saveMonths);
    const weekly = Math.ceil(price / weeks);
    const when = target.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    saverPeriods.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", Number(b.dataset.months) === saveMonths));
    placeSegIndicator();
    $("saverSub").textContent = saveMonths === 1
      ? `Put it all aside this month · ready by ${when}`
      : `${money(weekly)} a week · ready by ${when}`;

    const out = $("saverMonthly");
    if (motion && animate) {
      gsap.to(shownAmount, {
        v: monthly,
        duration: 0.6,
        ease: "power3.out",
        overwrite: true,
        onUpdate: () => (out.textContent = money(Math.round(shownAmount.v))),
      });
    } else {
      shownAmount.v = monthly;
      out.textContent = money(monthly);
    }
  }

  function renderSaver(item) {
    saverItem = item;
    saver.hidden = !!item.bought || !(Number(item.price) > 0);
    if (!saver.hidden) {
      updateSaver(false);
      requestAnimationFrame(() => placeSegIndicator(true)); // positions are only measurable once the dialog is shown
    }
  }

  saverPeriods.addEventListener("click", (e) => {
    const b = e.target.closest("[data-months]");
    if (!b || Number(b.dataset.months) === saveMonths) return;
    saveMonths = Number(b.dataset.months);
    try { localStorage.setItem(SAVE_KEY, String(saveMonths)); } catch {}
    updateSaver(true);
  });
  saverPeriods.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const btns = [...saverPeriods.querySelectorAll("button")];
    const i = btns.findIndex((b) => Number(b.dataset.months) === saveMonths);
    const next = btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length];
    next.focus();
    next.click();
  });

  /** "stepneyworkersclub.com" → "Stepneyworkersclub", "shop.example.co.uk" → "Example". */
  function storeName(host) {
    const parts = host.replace(/\.(co|com|org|net|gov|ac)\.[a-z]{2}$/, ".x").split(".");
    const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function openDetail(id, card) {
    $("dConfirm").hidden = true;
    $("dGuard").hidden = true;
    detail.querySelector(".detail-body").classList.remove("confirming");
    const i = items.find((x) => x.id === id);
    if (!i) return;
    current = id;
    $("dMedia").innerHTML = media(i);
    $("dMedia").style.backgroundColor = card ? getComputedStyle(card.querySelector(".media")).backgroundColor : "";
    $("dTags").innerHTML =
      (i.category ? `<span class="chip">${iconFor(i.category)}${esc(i.category)}</span>` : "") +
      (i.bought ? `<span class="chip bought">${ICON_BOUGHT}Bought</span>` : "");
    $("dBrand").textContent = i.brand || "";
    $("dBrand").hidden = !i.brand;
    $("dName").textContent = i.name;
    $("dPrice").textContent = money(i.price);
    let host = "";
    try { host = i.link ? new URL(i.link).hostname.replace(/^www\./, "") : ""; } catch {}
    // Store: the shop's favicon + its name, linking to the product page.
    const store = host && `<a class="store-link" href="${esc(i.link)}" target="_blank" rel="noopener" title="${esc(host)}">
        <img src="https://icons.duckduckgo.com/ip3/${esc(host)}.ico" alt="" width="16" height="16" loading="lazy"
             onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'store-fallback'}))" />
        <span class="store-name">${esc(storeName(host))}</span>
        <svg class="store-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8.5 7H17v8.5" /></svg>
      </a>`;
    const facts = [
      ["Size", i.size && esc(i.size)],
      ["Desire", !i.bought && `${prioDot(i.priority)}${priorityLabel[i.priority || 2]}`],
      ["Store", store],
    ].filter(([, v]) => v);
    $("dFacts").innerHTML = facts.length
      ? `<dl class="facts-row">${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`
      : "";
    $("dFacts").hidden = !facts.length;
    renderLinks(i);
    $("dNotes").textContent = i.notes || "";
    $("dNotesWrap").hidden = !i.notes;
    renderSaver(i);
    const link = $("dLink");
    if (i.link) { link.href = i.link; link.removeAttribute("aria-disabled"); }
    else { link.removeAttribute("href"); link.setAttribute("aria-disabled", "true"); }
    const toggle = $("dToggle");
    const toggleLabel = i.bought ? "Move back to wishlist" : "Mark as bought";
    toggle.setAttribute("aria-label", toggleLabel);
    toggle.dataset.tip = toggleLabel;
    toggle.innerHTML = i.bought
      ? svg('<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>')
      : CHECK;
    if (motion && !reduceMotion && card && onScreen(rect(card))) {
      openCard = card;
      detail.classList.add("morphing", "no-anim", "staged");
      detail.showModal();
      card.style.visibility = "hidden";
      morph(card, 0, 1, () => detail.classList.remove("morphing"));
    } else {
      showDialog(detail);
    }
    // The dialog is laid out now, so the period pills can be measured.
    if (!saver.hidden) placeSegIndicator(true);
  }

  // Small photo tile, tinted like the item's card.
  function thumbHTML(x) {
    const tile = cardEls.get(x.id)?.querySelector(".media");
    const bg = tile ? getComputedStyle(tile).backgroundColor : "";
    return `<span class="link-thumb"${bg ? ` style="background-color:${bg}"` : ""}>${x.image ? `<img src="${esc(proxied(x.image))}" alt="" loading="lazy" onerror="this.remove()" />` : ""}</span>`;
  }

  // "Buy first" / "Needed for" rows in the detail modal; each one opens that item.
  function renderLinks(i) {
    const row = (x) => {
      return `<button type="button" class="link-row${x.bought ? " done" : ""}" data-open="${esc(x.id)}">
          ${thumbHTML(x)}
          <span class="link-text"><span class="link-name">${esc(x.name)}</span>${x.brand ? `<span class="link-meta">${esc(x.brand)}</span>` : ""}</span>
          <span class="link-status">${x.bought ? `${CHECK}Bought` : esc(money(x.price))}</span>
        </button>`;
    };
    const needs = needsOf(i), forItems = neededFor(i);
    let html = "";
    if (needs.length) {
      const open = needs.filter((n) => !n.bought);
      const total = [i, ...open].reduce((s, x) => s + (Number(x.price) || 0), 0);
      const together = !i.bought && open.length && total ? `<span class="links-total">${esc(money(total))} all together</span>` : "";
      html += `<div class="links-group"><div class="links-head"><p class="notes-label">${ICON_LINK}Buy first</p>${together}</div>${needs.map(row).join("")}</div>`;
    }
    if (forItems.length) {
      html += `<div class="links-group"><div class="links-head"><p class="notes-label">${ICON_LINK}Needed for</p></div>${forItems.map(row).join("")}</div>`;
    }
    $("dLinks").innerHTML = html;
    $("dLinks").hidden = !html;
  }
  $("dLinks").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (!b) return;
    cleanupDetail();
    detail.close();
    const card = cardEls.get(b.dataset.open);
    openDetail(b.dataset.open, card && !card.hidden ? card : null);
  });

  // ---------- "Buy first" field in the editor ----------
  // A visual picker (photos, prices, grouped by category) instead of a native <select>.
  let formNeeds = [];
  const needsPanel = $("needsPanel"), needsBtn = $("needsBtn"), needsSearch = $("needsSearch"), needsList = $("needsList");
  const XMARK = svg('<path d="M7 7l10 10M17 7 7 17"/>');
  const itemText = (x) => `<span class="link-text"><span class="link-name">${esc(x.name)}</span>${x.brand ? `<span class="link-meta">${esc(x.brand)}</span>` : ""}</span>`;
  // Anything except the item itself and things that need it (so links can't loop).
  function linkable() {
    const self = form.dataset.id;
    return items
      .filter((x) => x.id !== self && !(self && needsDeep(x, self)))
      .sort((a, b) => (a.category || "~").localeCompare(b.category || "~") || a.name.localeCompare(b.name));
  }
  function renderNeedsField() {
    $("needsChips").innerHTML = formNeeds
      .map(byId)
      .map((x) => `<div class="pick-row chosen">${thumbHTML(x)}${itemText(x)}<span class="link-status">${esc(money(x.price))}</span>
          <button type="button" class="pick-remove" data-remove="${esc(x.id)}" aria-label="Unlink ${esc(x.name)}">${XMARK}</button></div>`)
      .join("");
    needsBtn.querySelector("span").textContent = formNeeds.length ? "Link another item" : "Link an item";
    if (!needsPanel.hidden) renderNeedsList();
  }
  function renderNeedsList() {
    const q = needsSearch.value.trim().toLowerCase();
    const opts = linkable().filter((x) => !q || [x.name, x.brand, x.category].join(" ").toLowerCase().includes(q));
    const groups = new Map();
    for (const x of opts) {
      const g = x.category || "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(x);
    }
    needsList.innerHTML = opts.length
      ? [...groups].map(([g, xs]) => `<div class="picker-group" role="group" aria-label="${esc(g)}">
            <p class="picker-group-label">${iconFor(g)}${esc(g)}</p>
            ${xs.map((x) => `<button type="button" role="option" class="pick-row" data-pick="${esc(x.id)}" aria-selected="${formNeeds.includes(x.id)}">
                ${thumbHTML(x)}${itemText(x)}<span class="link-status">${esc(money(x.price))}</span><span class="pick-check">${CHECK}</span>
              </button>`).join("")}
          </div>`).join("")
      : `<p class="picker-empty">${q ? `Nothing matches “${esc(needsSearch.value.trim())}”` : "Nothing to link yet"}</p>`;
  }
  function toggleNeedsPanel(open = needsPanel.hidden) {
    needsPanel.hidden = !open;
    needsBtn.setAttribute("aria-expanded", open);
    if (!open) return;
    needsSearch.value = "";
    renderNeedsList();
    needsSearch.focus({ preventScroll: true });
    needsPanel.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }
  const pickOptions = () => [...needsList.querySelectorAll("[data-pick]")];
  needsBtn.onclick = () => toggleNeedsPanel();
  needsSearch.addEventListener("input", renderNeedsList);
  needsSearch.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); pickOptions()[0]?.focus(); }
    if (e.key === "Enter") { e.preventDefault(); pickOptions()[0]?.click(); } // don't submit the form
  });
  needsList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    const id = b.dataset.pick;
    formNeeds = formNeeds.includes(id) ? formNeeds.filter((x) => x !== id) : [...formNeeds, id];
    renderNeedsField();
    needsList.querySelector(`[data-pick="${CSS.escape(id)}"]`)?.focus();
  });
  needsList.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const opts = pickOptions(), n = opts.indexOf(document.activeElement);
    if (e.key === "ArrowUp" && n <= 0) return needsSearch.focus();
    opts[Math.min(opts.length - 1, n + (e.key === "ArrowDown" ? 1 : -1))]?.focus();
  });
  $("needsChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    formNeeds = formNeeds.filter((id) => id !== b.dataset.remove);
    renderNeedsField();
    needsBtn.focus();
  });

  // ---------- custom dropdowns in the editor (styled like the sort menu) ----------
  // Desire: the real <select> stays (hidden) so the form still reads its value; this is just the face.
  const openMenus = new Set(); // { close() } for whatever menu is open, so Escape / clicks outside can close it
  function closeMenus() {
    if (!openMenus.size) return false;
    [...openMenus].forEach((m) => m.close());
    return true;
  }
  document.addEventListener("pointerdown", (e) => {
    for (const m of openMenus) if (!m.root.contains(e.target)) m.close();
  });

  function customSelect(sel, decorate = () => "") {
    const root = document.createElement("div");
    root.className = "cselect";
    root.innerHTML = `<button type="button" class="cselect-btn" aria-haspopup="listbox" aria-expanded="false"><span class="cselect-value"></span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
      <ul class="sort-menu cselect-menu" role="listbox" hidden></ul>`;
    sel.before(root);
    sel.classList.add("native-hidden");
    sel.tabIndex = -1;
    const btn = root.querySelector("button"), menu = root.querySelector("ul");
    const opts = () => [...menu.children];
    const sync = () => {
      const o = sel.options[sel.selectedIndex];
      root.querySelector(".cselect-value").innerHTML = o ? decorate(o.value) + `<span>${esc(o.text)}</span>` : "";
    };
    const api = {
      root,
      close(focus) {
        const inside = menu.contains(document.activeElement);
        menu.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        openMenus.delete(api);
        if (focus || inside) btn.focus();
      },
    };
    function open() {
      closeMenus();
      menu.innerHTML = [...sel.options]
        .map((o) => `<li role="option" tabindex="-1" data-value="${esc(o.value)}" aria-selected="${o.selected}">${decorate(o.value)}<span>${esc(o.text)}</span>${CHECK}</li>`)
        .join("");
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      openMenus.add(api);
      (menu.querySelector('[aria-selected="true"]') || opts()[0])?.focus();
    }
    function choose(li) {
      sel.value = li.dataset.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      api.close(true);
    }
    btn.onclick = () => (menu.hidden ? open() : api.close());
    btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); } });
    menu.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) choose(li); });
    menu.addEventListener("keydown", (e) => {
      const list = opts(), n = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); list[Math.max(0, Math.min(list.length - 1, n + (e.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (list[n]) choose(list[n]); }
      else if (e.key === "Tab") api.close();
    });
    sel.addEventListener("change", sync);
    sync();
    return sync;
  }

  // Category: free text with a suggestion menu (replaces the browser's <datalist> popup).
  function categoryCombo(input) {
    input.removeAttribute("list");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    const root = document.createElement("div");
    root.className = "cselect combo";
    input.before(root);
    root.appendChild(input);
    const menu = document.createElement("ul");
    menu.className = "sort-menu cselect-menu";
    menu.id = "catMenu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    root.appendChild(menu);
    input.setAttribute("aria-controls", menu.id);
    let active = -1;
    const api = {
      root,
      close() {
        menu.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        openMenus.delete(api);
      },
    };
    const lis = () => [...menu.children].filter((li) => li.dataset.value != null);
    function highlight(n) {
      const list = lis();
      active = n;
      list.forEach((li, k) => li.classList.toggle("active", k === n));
      if (list[n]) { input.setAttribute("aria-activedescendant", list[n].id); list[n].scrollIntoView({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    }
    function show() {
      const q = input.value.trim().toLowerCase();
      const cats = categories();
      const matches = cats.filter((c) => !q || c.toLowerCase().includes(q));
      const exact = cats.some((c) => c.toLowerCase() === q);
      if (!matches.length && !q) return api.close();
      menu.innerHTML =
        matches.map((c, k) => `<li role="option" id="cat-opt-${k}" data-value="${esc(c)}" aria-selected="${c.toLowerCase() === q}">${iconFor(c)}<span>${esc(c)}</span>${CHECK}</li>`).join("") +
        (q && !exact ? `<li class="combo-new" role="presentation">${svg('<path d="M12 5v14M5 12h14"/>')}<span>New category “${esc(input.value.trim())}”</span></li>` : "");
      if (!menu.children.length) return api.close();
      closeMenus();
      menu.hidden = false;
      input.setAttribute("aria-expanded", "true");
      openMenus.add(api);
      highlight(-1);
    }
    function choose(li) {
      input.value = li.dataset.value;
      api.close();
      input.focus();
    }
    input.addEventListener("focus", show);
    input.addEventListener("input", show);
    input.addEventListener("keydown", (e) => {
      const list = lis();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (menu.hidden) return show();
        highlight(Math.max(0, Math.min(list.length - 1, active + (e.key === "ArrowDown" ? 1 : -1))));
      } else if (e.key === "Enter" && !menu.hidden && list[active]) {
        e.preventDefault();
        choose(list[active]);
      } else if (e.key === "Tab") api.close();
    });
    menu.addEventListener("pointerdown", (e) => e.preventDefault()); // keep focus in the input
    menu.addEventListener("click", (e) => {
      const li = e.target.closest("[data-value]");
      if (li) choose(li);
      else if (e.target.closest(".combo-new")) api.close();
    });
  }

  const syncDesire = customSelect(form.elements.priority, (v) => prioDot(Number(v)));
  categoryCombo(form.elements.category);

  function openEditor(item) {
    form.reset();
    form.dataset.id = item?.id || "";
    $("formTitle").textContent = item ? "Edit item" : "Add item";
    $("fetchRow").hidden = !!item;
    $("fetchUrl").value = "";
    setFetchStatus("");
    formNeeds = (item?.needs || []).filter(byId);
    closeMenus();
    toggleNeedsPanel(false);
    renderNeedsField();
    if (item) {
      for (const [k, v] of Object.entries(item)) {
        const el = form.elements[k];
        if (!el) continue;
        if (el.type === "checkbox") el.checked = !!v;
        else el.value = v ?? "";
      }
    } else if (active !== ALL && active !== BOUGHT) {
      form.elements.category.value = active;
    }
    syncDesire();
    showDialog(editor);
    (item ? form.elements.name : $("fetchUrl")).focus();
  }

  // ---------- fetch from URL ----------
  function setFetchStatus(html, isError = false) {
    const s = $("fetchStatus");
    s.innerHTML = html;
    s.classList.toggle("error", isError);
  }

  async function fetchFromUrl() {
    const url = $("fetchUrl").value.trim();
    if (!url) return $("fetchUrl").focus();
    const btn = $("fetchBtn");
    btn.disabled = true;
    btn.textContent = "Fetching…";
    setFetchStatus("Reading the product page…");
    try {
      const res = await fetch(API + "/fetch?url=" + encodeURIComponent(url));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const f = form.elements;
      for (const k of ["name", "brand", "category", "price", "image", "link"]) {
        if (data[k] !== null && data[k] !== undefined && data[k] !== "") f[k].value = data[k];
      }
      const missing = ["name", "brand", "price", "image"].filter((k) => !data[k]);
      setFetchStatus(
        `<span class="fetch-preview">${data.image ? `<img src="${esc(data.image)}" alt="" />` : ""}` +
          `<span>Filled in${missing.length ? `. Couldn't find: ${missing.join(", ")}` : ". Check it over, add a size, then save"}.</span></span>`
      );
      f.size.focus();
    } catch (err) {
      form.elements.link.value = url;
      setFetchStatus(esc(err.message || "Couldn't fetch that link") + ". Fill in the rest by hand.", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Fetch";
    }
  }

  $("fetchBtn").onclick = fetchFromUrl;
  $("fetchUrl").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); fetchFromUrl(); }
  });
  $("fetchUrl").addEventListener("paste", () => setTimeout(fetchFromUrl, 0));

  // ---------- events ----------
  filters.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b || b.dataset.tab === active) return;
    active = b.dataset.tab;
    render();
  });

  grid.addEventListener("click", (e) => {
    if (e.target.closest(".ext")) return; // arrow opens the store link
    const c = e.target.closest(".card");
    if (c) openDetail(c.dataset.id, c);
  });
  grid.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("card")) openDetail(e.target.dataset.id, e.target);
  });

  const addBtn = $("addBtn");
  addBtn.onclick = () => openEditor(null); // + rotation is CSS: GSAP re-inserts SVGs after the text when measuring them

  $("dEdit").onclick = () => {
    detail.close();
    openEditor(items.find((x) => x.id === current));
  };

  $("dToggle").onclick = () => {
    const i = items.find((x) => x.id === current);
    const waiting = stillNeeded(i);
    // Buying a game before its disc drive? Check first (but don't block it).
    if (!i.bought && waiting.length) return askGuard(i, waiting);
    setBought(i, !i.bought);
    detail.close();
    save();
  };
  function askGuard(i, waiting) {
    $("dGuardText").innerHTML = `<strong>${esc(i.name)}</strong> needs <strong>${esc(andList(waiting.map((n) => n.name)))}</strong> first. Mark it as bought anyway?`;
    $("dGuard").hidden = false;
    detail.querySelector(".detail-body").classList.add("confirming");
    $("dGuardCancel").focus();
  }
  $("dGuardCancel").onclick = () => cancelDelete();
  $("dGuardOk").onclick = () => {
    const i = items.find((x) => x.id === current);
    setBought(i, true);
    detail.close();
    save();
  };

// Delete: the action row turns into an inline "Remove …?" confirmation (no browser pop-up),
// and after deleting there is an Undo in the toast.
const detailBody = detail.querySelector(".detail-body");
const confirming = () => !$("dConfirm").hidden || !$("dGuard").hidden;
function askDelete() {
  const i = items.find((x) => x.id === current);
  if (!i) return;
  $("dConfirmName").textContent = `“${i.name}”`;
  $("dConfirm").hidden = false;
  detailBody.classList.add("confirming");
  $("dConfirmCancel").focus();
}
function cancelDelete() {
  const wasGuard = !$("dGuard").hidden;
  $("dConfirm").hidden = true;
  $("dGuard").hidden = true;
  detailBody.classList.remove("confirming");
  $(wasGuard ? "dToggle" : "dDelete").focus();
}
$("dDelete").onclick = askDelete;
$("dConfirmCancel").onclick = cancelDelete;
// ---------- delete: the card turns to dust and blows away ----------
// Paint the card onto a canvas, cut it into specks of its own colours, then let them
// drift up and to the right in a sweep from left to right.
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h);
}

function wrapText(c, text, maxW) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? line + " " + word : word;
    if (line && c.measureText(next).width > maxW) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function snapshotCard(card, C, dpr) {
  const snap = document.createElement("canvas");
  snap.width = Math.ceil(C.w * dpr);
  snap.height = Math.ceil(C.h * dpr);
  const c = snap.getContext("2d");
  c.scale(dpr, dpr);
  const rel = (el) => { const r = rect(el); return { x: r.x - C.x, y: r.y - C.y, w: r.w, h: r.h }; };
  const faded = card.classList.contains("bought");

  roundRect(c, 0, 0, C.w, C.h, 16);
  c.fillStyle = getComputedStyle(card).backgroundColor;
  c.fill();

  c.save();
  if (faded) { c.globalAlpha = 0.5; c.filter = "grayscale(1)"; }
  const mediaEl = card.querySelector(".media");
  const M = rel(mediaEl);
  c.save();
  roundRect(c, M.x, M.y, M.w, M.h, 10);
  c.fillStyle = getComputedStyle(mediaEl).backgroundColor;
  c.fill();
  c.clip();
  const img = mediaEl.querySelector("img");
  if (img?.complete && img.naturalWidth) {
    const s = Math.min(M.w / img.naturalWidth, M.h / img.naturalHeight); // object-fit: contain
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    try { c.drawImage(img, M.x + (M.w - w) / 2, M.y + (M.h - h) / 2, w, h); } catch {}
  }
  const ph = mediaEl.querySelector(".placeholder");
  if (ph) {
    const cs = getComputedStyle(ph);
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    c.fillStyle = cs.color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(ph.textContent.toUpperCase(), M.x + M.w / 2, M.y + M.h / 2);
    c.textAlign = "left";
  }
  c.restore();

  const dot = mediaEl.querySelector(".prio");
  if (dot) {
    const D = rel(dot);
    c.beginPath();
    c.arc(D.x + D.w / 2, D.y + D.h / 2, D.w / 2 + 2, 0, Math.PI * 2);
    c.fillStyle = "rgba(255,255,255,.9)";
    c.fill();
    c.beginPath();
    c.arc(D.x + D.w / 2, D.y + D.h / 2, D.w / 2, 0, Math.PI * 2);
    c.fillStyle = getComputedStyle(dot).backgroundColor;
    c.fill();
  }

  c.textBaseline = "middle";
  for (const el of card.querySelectorAll(".info p")) {
    if (!el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    const T = rel(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    c.fillStyle = cs.color;
    wrapText(c, el.textContent.trim(), T.w).forEach((line, n) => c.fillText(line, T.x, T.y + lh * (n + 0.5)));
  }
  c.restore();
  return snap;
}

function dustCard(card) {
  const C = rect(card);
  if (!motion || reduceMotion || !onScreen(C)) return false;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let snap;
  try { snap = snapshotCard(card, C, dpr); } catch { return false; }

  // Cut the card into 2px specks (sampled at 1x, which is plenty for dust).
  const cell = 2;
  const cols = Math.ceil(C.w / cell), rows = Math.ceil(C.h / cell);
  const small = document.createElement("canvas");
  small.width = cols; small.height = rows;
  const sc = small.getContext("2d", { willReadFrequently: true });
  sc.drawImage(snap, 0, 0, cols, rows);
  let px;
  try { px = sc.getImageData(0, 0, cols, rows).data; } catch { return false; }

  const SWEEP = 0.75, JITTER = 0.35;
  const parts = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      if (px[i + 3] < 16) continue;
      // Specks peel off in clumps, so the edge of the sweep looks ragged rather than a clean line.
      const clump = Math.sin(x * 0.21 + y * 0.13) * Math.cos(y * 0.17 - x * 0.05);
      parts.push({
        x: x * cell, y: y * cell,
        r: px[i], g: px[i + 1], b: px[i + 2], a: px[i + 3],
        delay: (x / cols) * SWEEP + (clump * 0.5 + 0.5) * JITTER * 0.7 + Math.random() * JITTER * 0.3,
        vx: 50 + Math.random() * 110,
        vy: -(25 + Math.random() * 95),
        life: 0.8 + Math.random() * 0.7,
        wob: Math.random() * Math.PI * 2,
      });
    }
  }

  // The overlay leaves room for the dust to drift above and to the right of the card.
  const padL = 24, padT = 260, padR = 320, padB = 24;
  const W = Math.ceil(C.w + padL + padR), H = Math.ceil(C.h + padT + padB);
  const layer = document.createElement("canvas");
  layer.className = "dust";
  layer.width = W * dpr; layer.height = H * dpr;
  Object.assign(layer.style, { left: C.x - padL + "px", top: C.y - padT + "px", width: W + "px", height: H + "px" });
  const lc = layer.getContext("2d");
  const buf = document.createElement("canvas"); // specks, drawn at 1x then scaled up crisply
  buf.width = W; buf.height = H;
  const bc = buf.getContext("2d");
  const frame = bc.createImageData(W, H);
  const fd = frame.data;
  document.body.appendChild(layer);
  card.style.visibility = "hidden";

  const draw = (t) => {
    fd.fill(0);
    // Anything right of this line hasn't started to go yet, so it's drawn sharp from the snapshot.
    const intact = Math.max(0, (t / SWEEP) * C.w);
    for (const p of parts) {
      const age = t - p.delay;
      if (age < 0 && p.x >= intact) continue;
      let x = p.x, y = p.y, a = p.a;
      if (age > 0) {
        if (age > p.life) continue;
        const k = age / p.life;
        x += p.vx * age + 70 * age * age + Math.sin(p.wob + age * 6) * 6 * k;
        y += p.vy * age - 40 * age * age;
        a *= (1 - k) * (1 - k);
      }
      x = Math.round(x + padL); y = Math.round(y + padT);
      if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) continue;
      for (let dy = 0; dy < cell; dy++) {
        let o = ((y + dy) * W + x) * 4;
        for (let dx = 0; dx < cell; dx++, o += 4) {
          fd[o] = p.r; fd[o + 1] = p.g; fd[o + 2] = p.b; fd[o + 3] = a;
        }
      }
    }
    bc.putImageData(frame, 0, 0);
    lc.clearRect(0, 0, layer.width, layer.height);
    if (intact < C.w) {
      const sx = Math.floor(intact);
      lc.drawImage(snap, sx * dpr, 0, (C.w - sx) * dpr, C.h * dpr, (padL + sx) * dpr, padT * dpr, (C.w - sx) * dpr, C.h * dpr);
    }
    lc.imageSmoothingEnabled = false;
    lc.drawImage(buf, 0, 0, layer.width, layer.height);
  };

  const end = SWEEP + JITTER + 1.5;
  const state = { t: 0 };
  draw(0);
  gsap.to(state, { t: end, duration: end, ease: "none", onUpdate: () => draw(state.t), onComplete: () => layer.remove() });
  return true;
}

$("dConfirmDelete").onclick = () => {
  const index = items.findIndex((x) => x.id === current);
  if (index < 0) return;
  const [removed] = items.splice(index, 1);
  cleanupDetail(); // puts the card back (it was hidden while the modal was open) so it can be painted
  detail.close();
  const card = cardEls.get(removed.id);
  if (card) dustCard(card);
  save();
  toast(`Removed ${removed.name}`, false, {
    label: "Undo",
    run: () => {
      items.splice(Math.min(index, items.length), 0, removed);
      save();
    },
  });
};

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const data = {
      name: f.name.value.trim(),
      brand: f.brand.value.trim(),
      category: f.category.value.trim(),
      price: f.price.value === "" ? null : Number(f.price.value),
      size: f.size.value.trim(),
      image: f.image.value.trim(),
      link: f.link.value.trim(),
      notes: f.notes.value.trim(),
      priority: Number(f.priority.value),
      bought: f.bought.checked,
    };
    const id = form.dataset.id;
    const { bought, ...fields } = data;
    let target = id && items.find((x) => x.id === id);
    if (target) Object.assign(target, fields);
    else items.unshift((target = { id: slug(data.name), added: new Date().toISOString(), ...fields, bought: false }));
    if (formNeeds.length) target.needs = [...formNeeds];
    else delete target.needs;
    setBought(target, bought);
    closeDialog(editor);
    save();
  });

  // The drawer slides out before closing; <dialog>.close() alone would remove it instantly.
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function closeDialog(d) {
    if (!d.open || d.classList.contains("closing")) return;
    if (d === detail) return closeDetailMorph();
    if (!d.classList.contains("drawer") || reduceMotion) return d.close();
    d.classList.add("closing");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      d.removeEventListener("animationend", onEnd);
      d.classList.remove("closing");
      d.close();
    };
    const onEnd = (e) => { if (e.target === d) finish(); };
    d.addEventListener("animationend", onEnd);
    setTimeout(finish, 650); // fallback if animationend never fires (e.g. background tab)
  }

  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => closeDialog(b.closest("dialog"))));
  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => { if (e.target === d) closeDialog(d); });
    d.addEventListener("cancel", (e) => { // Escape key
      e.preventDefault();
      if (d === detail && confirming()) return cancelDelete();
      if (d === editor && closeMenus()) return;
      if (d === editor && !needsPanel.hidden) { toggleNeedsPanel(false); return needsBtn.focus(); }
      closeDialog(d);
    });
  });

  // ---------- sign in / out ----------
  const signIn = $("signIn"), signInForm = $("signInForm"), signInError = $("signInError");
  $("signInBtn").onclick = () => {
    signInForm.reset();
    signInError.textContent = "";
    signIn.showModal();
    $("signInPassword").focus();
  };
  signInForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("signInSubmit");
    btn.disabled = true;
    signInError.textContent = "";
    try {
      const res = await fetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: $("signInPassword").value }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401 ? "That password isn't right"
          : res.status === 503 ? "Editing isn't set up on this site yet — the wishlist password is missing from its settings"
          : "Couldn't sign in"
        );
      }
      signIn.close();
      setEditor(true);
      toast("Editing unlocked");
    } catch (err) {
      signInError.textContent = err.message;
      $("signInPassword").select();
    } finally {
      btn.disabled = false;
    }
  });
  $("signOutBtn").onclick = async () => {
    try { await fetch(API + "/logout", { method: "POST" }); } catch {}
    setEditor(false);
    toast("Signed out");
  };

  load();
})();
