(function () {
  // Placeholder career info — swap in the real thing. Newest first.
  const ENTRIES = [
    {
      year: "2025 — Now",
      role: "Senior Product Designer",
      company: "Company Name",
      blurb: "Placeholder: leading design for a core product area, from early discovery through to shipped features, working closely with engineering and research.",
      tags: ["Product", "Systems", "Leadership"],
    },
    {
      year: "2023 — 2025",
      role: "Product Designer",
      company: "Company Name",
      blurb: "Placeholder: designed and shipped end-to-end flows for a growing consumer app, and helped set up the team's first shared component library.",
      tags: ["UI", "Prototyping", "Design system"],
    },
    {
      year: "2022 — 2023",
      role: "Freelance Designer & Developer",
      company: "Self-employed",
      blurb: "Placeholder: independent client work across brand, web design and front-end builds for small businesses and startups.",
      tags: ["Brand", "Web", "Front-end"],
    },
    {
      year: "2021 — 2022",
      role: "Junior Designer",
      company: "Agency Name",
      blurb: "Placeholder: first full-time role — digital campaigns and websites for a mix of retail and hospitality clients.",
      tags: ["Digital", "Campaigns"],
    },
    {
      year: "2020 — 2021",
      role: "Design Intern",
      company: "Studio Name",
      blurb: "Placeholder: a placement year supporting a small studio on identity, packaging and social content.",
      tags: ["Identity", "Print"],
    },
    {
      year: "2018 — 2022",
      role: "BA (Hons) Design",
      company: "University Name",
      blurb: "Placeholder: a degree spanning graphic design, interaction and a final-year project on interface design.",
      tags: ["Graphic", "Interaction"],
    },
    {
      year: "2017",
      role: "First Client Project",
      company: "Freelance",
      blurb: "Placeholder: a first paid logo and site for a local business — the start of treating design as a career.",
      tags: ["Logo", "Web"],
    },
    {
      year: "2015",
      role: "Started Designing",
      company: "Self-taught",
      blurb: "Placeholder: teaching myself the basics in my bedroom — tutorials, templates and a lot of experiments.",
      tags: ["Curiosity"],
    },
  ];
  const N = ENTRIES.length;

  const scroller = document.getElementById("tlScroll");
  const list = document.getElementById("tlList");
  const detailWrap = document.getElementById("tlDetail");
  const focusDot = document.getElementById("tlFocus");
  const hint = document.getElementById("tlHint");
  const count = document.getElementById("tlCount");
  const darkToggle = document.getElementById("darkToggle");

  // How far (in entries) the magnification reaches either side of the
  // focus, how sharply it peaks, and the gap between entries at rest.
  const RADIUS = 2.2;
  const PEAK = 1.5;
  const GAP = 10;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pad2 = (n) => String(n).padStart(2, "0");

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const items = [];
  const details = [];

  ENTRIES.forEach((entry, i) => {
    const item = el("li", "tl-item");
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", entry.role + ", " + entry.company + ", " + entry.year);
    item.append(
      el("span", "tl-icon", entry.company.charAt(0)),
      (() => {
        const text = el("span", "tl-text");
        text.append(el("span", "tl-year", entry.year), el("span", "tl-role", entry.role), el("span", "tl-company", entry.company));
        return text;
      })()
    );
    item.addEventListener("click", () => scrollToEntry(i));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        scrollToEntry(i);
      }
    });
    list.appendChild(item);
    items.push(item);

    const detail = el("div", "tl-detail");
    const tags = el("ul", "tl-tags");
    entry.tags.forEach((tag) => tags.appendChild(el("li", "", tag)));
    detail.append(
      el("p", "tl-detail-year", entry.year),
      el("h2", "", entry.role),
      el("p", "tl-detail-company", entry.company),
      el("p", "tl-detail-blurb", entry.blurb),
      tags
    );
    detailWrap.appendChild(detail);
    details.push(detail);
  });

  let per = 240; // px of scrolling per entry
  let focusY = 0; // where on the stage the focal line sits
  let maxScale = 2;
  let baseH = 56;
  let current = 0; // the (smoothed) fractional entry index being rendered
  let target = 0; // where scroll says it should be
  let running = false;
  let activeIndex = -1;

  function measure() {
    const vh = window.innerHeight;
    const narrow = window.innerWidth <= 760;
    per = Math.round(vh * 0.3);
    scroller.style.height = per * (N - 1) + vh + "px";
    focusY = vh * (narrow ? 0.3 : 0.5);
    focusDot.style.top = focusY + "px";
    baseH = items[0].offsetHeight;
    const baseW = items[0].offsetWidth;
    const columnW = narrow ? window.innerWidth - 56 : window.innerWidth * 0.58 - 56;
    maxScale = clamp(columnW / baseW, 1.15, 2.3);
  }

  function readTarget() {
    return clamp(window.scrollY / per, 0, N - 1);
  }

  // The Dock falloff: 1 at the focus, easing smoothly to 0 at RADIUS away.
  function magnify(distance) {
    const d = Math.abs(distance);
    if (d >= RADIUS) return 0;
    return Math.pow(0.5 + 0.5 * Math.cos((Math.PI * d) / RADIUS), PEAK);
  }

  function render(p) {
    // Each entry's size follows its distance from the focus (p), and — like
    // a Dock — the bigger ones physically push their neighbours aside: stack
    // the scaled heights, then slide the whole column so the point at p
    // lands on the focal line.
    const scales = new Array(N);
    const centers = new Array(N);
    const levels = new Array(N);
    let y = 0;
    for (let i = 0; i < N; i++) {
      const f = magnify(i - p);
      const s = 1 + (maxScale - 1) * f;
      const h = baseH * s;
      levels[i] = f;
      scales[i] = s;
      centers[i] = y + h / 2;
      y += h + GAP;
    }
    const lo = Math.floor(p);
    const hi = Math.min(N - 1, lo + 1);
    const focusCenter = centers[lo] + (centers[hi] - centers[lo]) * (p - lo);
    const offset = focusY - focusCenter;

    for (let i = 0; i < N; i++) {
      const item = items[i];
      item.style.transform = "translate3d(0," + (offset + centers[i] - baseH / 2) + "px,0) scale(" + scales[i] + ")";
      item.style.opacity = 0.3 + 0.7 * levels[i];
      item.style.setProperty("--f", levels[i].toFixed(3));
      item.style.zIndex = Math.round(levels[i] * 10);
    }

    const active = Math.round(p);
    if (active !== activeIndex) {
      activeIndex = active;
      details.forEach((d, i) => d.classList.toggle("is-active", i === active));
      items.forEach((it, i) => (i === active ? it.setAttribute("aria-current", "true") : it.removeAttribute("aria-current")));
      count.textContent = pad2(active + 1) + " / " + pad2(N);
    }
  }

  function tick() {
    const diff = target - current;
    if (Math.abs(diff) < 0.0005) {
      current = target;
      running = false;
      render(current);
      return;
    }
    current += diff * 0.16;
    render(current);
    requestAnimationFrame(tick);
  }

  function onScroll() {
    target = readTarget();
    hint.classList.toggle("is-hidden", window.scrollY > 24);
    if (reduceMotion) {
      current = target;
      render(current);
      return;
    }
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }

  function scrollToEntry(i) {
    window.scrollTo({ top: i * per, behavior: reduceMotion ? "auto" : "smooth" });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    measure();
    target = current = readTarget();
    render(current);
  });

  if (darkToggle) {
    darkToggle.addEventListener("click", () => {
      const isDark = document.body.classList.toggle("dark");
      localStorage.setItem("dark", isDark ? "1" : "0");
    });
  }

  measure();
  target = current = readTarget();
  hint.classList.toggle("is-hidden", window.scrollY > 24);
  render(current);
})();
