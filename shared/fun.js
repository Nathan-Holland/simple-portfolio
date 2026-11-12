/* Motion for the tool pages (styles in fun.css):
   - an orchestrated entrance: blocks settle in one after another, titles rise from a mask
   - figures count up to their value the first time you see them
   - chart lines draw themselves
   - a small tooltip showing how full a bar is
   - the position of the cursor over a card, for its soft light
   Entrances only run while the page is first loading, so pages that redraw themselves as
   you type never re-animate. Everything is skipped for prefers-reduced-motion. */
(function () {
  "use strict";
  if (window.NHFx) return;
  window.NHFx = { burst: function () {} };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var CARD_SEL = ".card, .tile, .stat, .sv-card, .bs-hero, .bs-stat, .bs-cats, .story, .u-project-card";
  var BAR_SEL = ".ww .bar span, .train-meter span, .bs-bar span, .sv-progress span, .goal-track .bar span, .macro-bar span, .meter span, .item-bar span, .split-bar .part";
  var TITLE_SEL = ".nh-hero h1, .greet h1, .u-hero h1";
  // Blocks that take part in the entrance, in page order. Layout wrappers are skipped so their children stagger.
  var WRAP = ":not(.stats):not(.tiles):not(.row-2):not(.sections):not(.grid-2):not(.grid-main):not(.stack):not(.sides):not(.grid):not(.foods):not(.meals):not(.news):not(.rest)";
  var REVEAL_SEL = [
    ".nh-hero > *", ".greet > *", ".u-hero > *", ".search-wrap", ".shortcuts", ".side > *", ".news-wrap > .news-head",
    ".news > .story", ".news .rest > .story", ".news-msg", ".tabs", ".toolbar",
    ".tiles > *", ".stats > *", ".row-2 > *", ".sections > *", ".grid > .card", ".sides > *", ".stack > *", ".foods > *", ".meals > *",
    ".grid-2 > *", ".grid-main > *", ".dash > *" + WRAP, ".view > *" + WRAP, ".app > *" + WRAP, "#app > *" + WRAP, ".u-main > *" + WRAP, ".u-project-grid > *"
  ].join(",");
  var COUNT_SEL = ".tile-value, .stat .v, .ww .kg, .weather .temp, .bs-stat-value, .ms-value, .ov-value, .snap .v, .macro .v, .now .big, .kcal";
  var LINE_SEL = '.chart svg path[fill="none"][stroke-width="2"], .chart svg .line';

  var loadedAt = performance.now(), LOAD_WINDOW = 2600;
  var tip, io, order = 0, orderReset = 0, seen = new WeakSet();
  var usesGsap = !!window.gsap; // the wishlist runs its own entrance

  function loading() { return performance.now() - loadedAt < LOAD_WINDOW; }

  // ---- entrance ----
  function mark(root) {
    if (reduce || usesGsap || !loading()) return;
    var els = (root.matches && root.matches(REVEAL_SEL) ? [root] : []).concat(Array.prototype.slice.call(root.querySelectorAll ? root.querySelectorAll(REVEAL_SEL) : []));
    els.forEach(function (el) {
      if (seen.has(el) || el.hidden || (el.parentElement && el.parentElement.closest(".rv"))) return;
      seen.add(el);
      el.classList.add("rv");
      if (el.matches(TITLE_SEL)) el.classList.add("rv-title");
      // Already on screen: bring it in straight away. Further down: when it scrolls into view.
      if (el.getBoundingClientRect().top < window.innerHeight) show(el); else io.observe(el);
    });
  }
  function show(el) {
    var now = performance.now();
    if (now - orderReset > 500) order = 0;               // a new batch starts its own stagger
    orderReset = now;
    var i = Math.min(order++, 14);
    el.style.setProperty("--i", i);
    void el.offsetWidth;                                 // commit the hidden state before the transition
    // A timer, not an animation frame, so content can never stay hidden in a background tab
    setTimeout(function () {
      el.classList.add("rv-in");
      setTimeout(function () { countIn(el); }, 120 + i * 70);
      setTimeout(function () { el.classList.remove("rv", "rv-in", "rv-title"); el.style.removeProperty("--i"); }, 1700 + i * 70);
    }, 20);
  }
  function onSee(entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      show(en.target);
    });
  }

  // ---- figures count up ----
  var NUM = /-?\d[\d,]*(\.\d+)?/;
  function countIn(root) {
    if (reduce) return;
    var els = (root.matches && root.matches(COUNT_SEL) ? [root] : []).concat(Array.prototype.slice.call(root.querySelectorAll(COUNT_SEL)));
    els.forEach(function (el) {
      var node = el.firstChild;
      if (!node || node.nodeType !== 3 || el.dataset.fxCounted) return;
      var text = node.nodeValue, m = text.match(NUM);
      if (!m) return;
      var target = parseFloat(m[0].replace(/,/g, ""));
      if (!isFinite(target) || target === 0) return;
      el.dataset.fxCounted = "1";
      var decimals = (m[1] || "").length ? m[1].length - 1 : 0, commas = m[0].indexOf(",") > -1;
      var pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length);
      var start = performance.now(), dur = 1100, last = text;
      function fmt(v) {
        var s = v.toFixed(decimals);
        if (commas) { var p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); s = p.join("."); }
        return pre + s + post;
      }
      (function step(now) {
        if (!node.isConnected || node.nodeValue !== last) return;      // the page changed it: leave it alone
        var k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 4);
        last = k === 1 ? text : fmt(target * e);
        node.nodeValue = last;
        if (k < 1) requestAnimationFrame(step);
      })(start);
    });
  }

  // ---- chart lines draw in ----
  function drawLines(root) {
    if (reduce || !loading()) return;
    Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll(LINE_SEL) : [], function (p) {
      if (seen.has(p) || !p.getTotalLength) return;
      seen.add(p);
      var len; try { len = p.getTotalLength(); } catch (e) { return; }
      if (!len) return;
      p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        p.classList.add("fx-draw"); p.style.strokeDashoffset = 0;
        setTimeout(function () { p.classList.remove("fx-draw"); p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; }, 2100);
      }); });
    });
  }

  // ---- cursor: light on cards, tooltip on bars ----
  function onMove(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var card = t.closest(CARD_SEL);
    if (card) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    }
    var bar = e.pointerType === "touch" ? null : (t.matches(BAR_SEL) ? t : (t.firstElementChild && t.children.length === 1 && t.firstElementChild.matches(BAR_SEL) ? t.firstElementChild : null));
    if (bar) {
      var b = bar.getBoundingClientRect(), track = bar.parentElement.getBoundingClientRect();
      var label = bar.getAttribute("data-fx-label") || "";
      tip.textContent = (label ? label + " · " : "") + Math.round((b.width / Math.max(track.width, 1)) * 100) + "%";
      tip.style.left = Math.min(Math.max(e.clientX, 36), window.innerWidth - 36) + "px";
      tip.style.top = (track.top - 8) + "px";
      tip.hidden = false;
    } else if (!tip.hidden) tip.hidden = true;
  }

  function setup() {
    tip = document.createElement("div");
    tip.className = "fx-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", function () { tip.hidden = true; });
    if (reduce) return;
    io = new IntersectionObserver(onSee, { rootMargin: "0px 0px -4% 0px" });
    mark(document.body);
    drawLines(document.body);
    // Pages that fill themselves in after loading (React, fetched data) join the entrance while it lasts
    var mo = new MutationObserver(function (list) {
      if (!loading()) { mo.disconnect(); return; }
      list.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) { mark(n); drawLines(n); } });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) setup(); else document.addEventListener("DOMContentLoaded", setup);
})();
