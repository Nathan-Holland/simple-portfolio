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
  function toast(msg, isError = false) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (isError ? " error" : "");
    t.hidden = false;
    if (motion) gsap.fromTo(t, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), isError ? 5000 : 2200);
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

  // One element per item, rebuilt only when that item's data changes.
  const cardEls = new Map();
  const visible = () => [...cardEls.values()].filter((el) => !el.hidden);
  let flip = null;
  let leaveTween = null;
  function syncCards() {
    const ids = new Set(items.map((i) => i.id));
    for (const [id, el] of cardEls) if (!ids.has(id)) { el.remove(); cardEls.delete(id); }
    for (const i of items) {
      const sig = JSON.stringify(i);
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
  detail.addEventListener("close", cleanupDetail);

  function openDetail(id, card) {
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
    $("dFacts").innerHTML = [
      ["Size", i.size && esc(i.size)],
      ["Desire", !i.bought && `${prioDot(i.priority)}${priorityLabel[i.priority || 2]}`],
      ["Store", host && esc(host)],
      ["Added", i.added && new Date(i.added).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`)
      .join("");
    $("dFacts").hidden = !$("dFacts").children.length;
    $("dNotes").textContent = i.notes || "";
    $("dNotesWrap").hidden = !i.notes;
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
  }

  function openEditor(item) {
    form.reset();
    form.dataset.id = item?.id || "";
    $("formTitle").textContent = item ? "Edit item" : "Add item";
    $("fetchRow").hidden = !!item;
    $("fetchUrl").value = "";
    setFetchStatus("");
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
    i.bought = !i.bought;
    detail.close();
    save();
  };

  $("dDelete").onclick = () => {
    const i = items.find((x) => x.id === current);
    if (!confirm(`Remove "${i.name}" from your wishlist?`)) return;
    items = items.filter((x) => x.id !== current);
    detail.close();
    save();
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
    if (id) Object.assign(items.find((x) => x.id === id), data);
    else items.unshift({ id: slug(data.name), added: new Date().toISOString(), ...data });
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
    d.addEventListener("cancel", (e) => { e.preventDefault(); closeDialog(d); }); // Escape key
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
      if (!res.ok) throw new Error(res.status === 401 ? "That password isn't right" : "Couldn't sign in");
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
