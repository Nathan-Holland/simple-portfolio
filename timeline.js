(function () {
  // Placeholder career info and images — swap in the real thing. Oldest
  // first, so the dock reads left to right through time. `image` is what
  // shows in the dock; the rest shows above it when that entry is in focus.
  const ENTRIES = [
    {
      year: "2015",
      role: "Started Designing",
      company: "Self-taught",
      image: "timeline/placeholder-1.svg",
      blurb: "Placeholder: teaching myself the basics in my bedroom — tutorials, templates and a lot of experiments.",
      tags: ["Curiosity"],
    },
    {
      year: "2017",
      role: "First Client Project",
      company: "Freelance",
      image: "timeline/placeholder-2.svg",
      blurb: "Placeholder: a first paid logo and site for a local business — the start of treating design as a career.",
      tags: ["Logo", "Web"],
    },
    {
      year: "2018 — 2022",
      role: "BA (Hons) Design",
      company: "University Name",
      image: "timeline/placeholder-3.svg",
      blurb: "Placeholder: a degree spanning graphic design, interaction and a final-year project on interface design.",
      tags: ["Graphic", "Interaction"],
    },
    {
      year: "2020 — 2021",
      role: "Design Intern",
      company: "Studio Name",
      image: "timeline/placeholder-4.svg",
      blurb: "Placeholder: a placement year supporting a small studio on identity, packaging and social content.",
      tags: ["Identity", "Print"],
    },
    {
      year: "2021 — 2022",
      role: "Junior Designer",
      company: "Agency Name",
      image: "timeline/placeholder-5.svg",
      blurb: "Placeholder: first full-time role — digital campaigns and websites for a mix of retail and hospitality clients.",
      tags: ["Digital", "Campaigns"],
    },
    {
      year: "2022 — 2023",
      role: "Freelance Designer & Developer",
      company: "Self-employed",
      image: "Projects/Wedge/wedge_main.jpg",
      blurb: "Placeholder: independent client work across brand, web design and front-end builds for small businesses and startups.",
      tags: ["Brand", "Web", "Front-end"],
    },
    {
      year: "2023 — 2025",
      role: "Product Designer",
      company: "Company Name",
      image: "Projects/Tottenham Hotspur/spurs.jpg",
      blurb: "Placeholder: designed and shipped end-to-end flows for a growing consumer app, and helped set up the team's first shared component library.",
      tags: ["UI", "Prototyping", "Design system"],
    },
    {
      year: "2025 — Now",
      role: "Senior Product Designer",
      company: "Company Name",
      image: "Projects/OpenFortune/openfortune_main.png",
      blurb: "Placeholder: leading design for a core product area, from early discovery through to shipped features, working closely with engineering and research.",
      tags: ["Product", "Systems", "Leadership"],
    },
  ];
  const N = ENTRIES.length;

  const scroller = document.getElementById("tlScroll");
  const stage = document.getElementById("tlStage");
  const list = document.getElementById("tlList");
  const detailWrap = document.getElementById("tlDetail");
  const hint = document.getElementById("tlHint");
  const count = document.getElementById("tlCount");
  const darkToggle = document.getElementById("darkToggle");

  // How far (in entries) the magnification reaches either side of the
  // focus, and how sharply it peaks.
  const RADIUS = 2.2;
  const PEAK = 1.5;
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
    const label = entry.role + ", " + entry.company + ", " + entry.year;
    const item = el("li", "tl-item");
    item.tabIndex = 0;
    item.title = entry.role + " — " + entry.company;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", label);
    const img = el("img");
    img.src = entry.image;
    img.alt = "";
    img.draggable = false;
    item.appendChild(img);
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
  let focusX = 0; // where across the stage the focal line sits
  let gap = 12;
  let maxScale = 2.2;
  let baseSize = 72;
  let current = 0; // the (smoothed) fractional entry index being rendered
  let target = 0; // where scroll says it should be
  let running = false;
  let activeIndex = -1;

  function measure() {
    const vh = window.innerHeight;
    const narrow = window.innerWidth <= 760;
    per = Math.round(vh * 0.3);
    scroller.style.height = per * (N - 1) + vh + "px";
    focusX = stage.clientWidth / 2;
    gap = narrow ? 8 : 12;
    baseSize = items[0].offsetWidth;
    // Grow as tall as the screen comfortably allows, capped so the
    // magnified image never runs into the text above it.
    maxScale = clamp((vh * 0.26) / baseSize, 1.4, 2.4);
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
    // Each image's size follows its distance from the focus (p), and — like
    // a Dock — the bigger ones physically push their neighbours aside: lay
    // the scaled widths side by side, then slide the whole row so the point
    // at p lands on the centre line.
    const scales = new Array(N);
    const centers = new Array(N);
    const levels = new Array(N);
    let x = 0;
    for (let i = 0; i < N; i++) {
      const f = magnify(i - p);
      const s = 1 + (maxScale - 1) * f;
      const w = baseSize * s;
      levels[i] = f;
      scales[i] = s;
      centers[i] = x + w / 2;
      x += w + gap;
    }
    const lo = Math.floor(p);
    const hi = Math.min(N - 1, lo + 1);
    const focusCenter = centers[lo] + (centers[hi] - centers[lo]) * (p - lo);
    const offset = focusX - focusCenter;

    for (let i = 0; i < N; i++) {
      const item = items[i];
      item.style.transform = "translate3d(" + (offset + centers[i] - baseSize / 2) + "px,0,0) scale(" + scales[i] + ")";
      item.style.opacity = 0.55 + 0.45 * levels[i];
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
    window.scrollTo({ top: clamp(i, 0, N - 1) * per, behavior: reduceMotion ? "auto" : "smooth" });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    measure();
    target = current = readTarget();
    render(current);
  });

  // The row runs sideways, so a sideways swipe should drive it too. The page
  // itself only scrolls vertically — turn horizontal wheel/trackpad movement
  // into vertical scrolling (and stop it triggering browser back/forward).
  window.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        window.scrollBy(0, e.deltaX);
      }
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollToEntry(Math.round(target) + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollToEntry(Math.round(target) - 1);
    }
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
