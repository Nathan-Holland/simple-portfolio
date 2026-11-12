/* Playful layer for the tool pages. One see-through canvas over the page draws:
   - particle bars: every progress bar / meter / bar-chart fill becomes a swarm of dots that
     ripples on its own, pours in when the bar grows, and scatters away from the cursor
   - comets that run along line charts
   - confetti bursts when a bar reaches 100% or something gets ticked off
   Plus a hover tooltip with each bar's percentage, and a cursor spotlight on cards (fun.css).
   Nothing here changes the page's own elements beyond adding a class, so it is safe on the
   React pages too. Turned off for people who ask for reduced motion. */
(function () {
  "use strict";
  if (window.NHFx) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fills that become particles (the element whose width is the value)
  var BAR_SEL = [
    ".ww .bar span", ".train-meter span",                       // home
    ".bs-bar span", ".sv-progress span",                        // wishlist
    ".goal-track .bar span", ".macro-bar span", ".scale .track span", // weightwise
    ".meter span", ".item-bar span", ".split-bar .part",        // budget
    "[data-fx-bar]"
  ].join(",");
  var LINE_SEL = '.chart svg path[fill="none"][stroke-width="2"], .chart svg .line';
  var CARD_SEL = ".card, .tile, .stat, .sv-card, .bs-hero, .bs-stat, .bs-cats, .story, .u-project-card";
  var CONFETTI = ["#8E51FF", "#2B7FFF", "#00C950", "#FFB900", "#FF6900", "#FB2C36"];

  var S = 3.4, R = 1.3, REPEL = 54, MAX = 9000;
  var canvas, ctx, dpr = 1, W = 0, H = 0;
  var bars = new Map(), lines = new Map(), sparks = [];
  var mouse = { x: -9999, y: -9999, on: false };
  var tip, frame = 0, running = false, t0 = performance.now();

  function burst(x, y, opts) {
    if (reduce || !ctx) return;
    opts = opts || {};
    var n = opts.count || 46, colors = opts.colors || CONFETTI;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = 2 + Math.random() * (opts.power || 7);
      sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 1, decay: 0.012 + Math.random() * 0.016,
        r: 1.6 + Math.random() * 2.4, c: colors[i % colors.length], sq: Math.random() < 0.4, rot: Math.random() * 6 });
    }
    start();
  }
  window.NHFx = { burst: burst };
  if (reduce) return;

  function setup() {
    canvas = document.createElement("canvas");
    canvas.className = "fx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    tip = document.createElement("div");
    tip.className = "fx-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", function () { mouse.on = false; mouse.x = mouse.y = -9999; tip.hidden = true; });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
    document.addEventListener("click", onClick, true);
    var pending = 0;
    new MutationObserver(function () { clearTimeout(pending); pending = setTimeout(scan, 180); })
      .observe(document.body, { childList: true, subtree: true });
    setInterval(scan, 2500);
    scan();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    start();
  }

  function scan() {
    document.querySelectorAll(BAR_SEL).forEach(function (el) {
      if (bars.has(el) || el.closest("dialog")) return;
      bars.set(el, { parts: [], dead: [], cols: 0, rows: 0, born: performance.now(), ratio: null, shown: true, color: "#0A0A0A", seed: Math.random() * 10 });
      el.classList.add("fx-bar");
    });
    document.querySelectorAll(LINE_SEL).forEach(function (el) {
      if (!lines.has(el) && el.getTotalLength) lines.set(el, { off: Math.random(), trail: [] });
    });
    bars.forEach(function (b, el) { if (!el.isConnected) bars.delete(el); });
    lines.forEach(function (l, el) { if (!el.isConnected) lines.delete(el); });
    start();
  }

  function onMove(e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = e.pointerType !== "touch";
    var card = e.target.closest && e.target.closest(CARD_SEL);
    if (card) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    }
    start();
  }

  // Ticking something off: confetti from where you clicked
  function onClick(e) {
    var t = e.target.closest && (
      e.target.closest('#train [aria-pressed="false"]') ||          // home: workout done
      e.target.closest("[data-fx-burst]"));
    if (!t) {
      var b = e.target.closest && e.target.closest("#dToggle, #dGuardOk"); // wishlist: mark as bought
      if (b && !/back|wishlist/i.test(b.getAttribute("aria-label") || b.getAttribute("data-tip") || b.textContent || "")) t = b;
    }
    if (t) burst(e.clientX, e.clientY);
  }

  function start() { if (!running && !document.hidden) { running = true; requestAnimationFrame(tick); } }

  function colorOf(el) {
    var c = getComputedStyle(el).backgroundColor;
    return !c || c === "transparent" || /, 0\)$/.test(c) ? "#0A0A0A" : c;
  }

  function tick(now) {
    running = false;
    if (document.hidden) return;
    frame++;
    var t = (now - t0) / 1000, busy = sparks.length > 0, total = 0, hover = null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    bars.forEach(function (b, el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -80 || r.top > H + 80 || r.right < -80 || r.left > W + 80) { b.parts.length = 0; b.cols = 0; return; }
      var track = el.parentElement.getBoundingClientRect();
      // Is something covering the bar (sticky header, dialog backdrop)? Then show the plain fill instead.
      if (frame % 24 === 1 || b.shown === null) {
        var cx = Math.min(Math.max(r.left + Math.min(r.width, 12) / 2, 1), W - 1), cy = r.top + r.height / 2;
        var top = cy >= 0 && cy <= H ? document.elementFromPoint(cx, cy) : el;
        var shown = !top || top === el || el.parentElement.contains(top) || top.contains(el);
        if (shown !== b.shown) { b.shown = shown; el.classList.toggle("fx-bar", shown); }
        b.color = colorOf(el);
      }
      if (!b.shown) { b.parts.length = 0; b.cols = 0; return; }

      var h = Math.max(r.height, 4), w = r.width;
      var rows = Math.max(2, Math.round(h / S)), cols = w < 1 ? 0 : Math.max(1, Math.floor(w / S));
      if (total + cols * rows > MAX) cols = Math.max(0, Math.floor((MAX - total) / rows));
      total += cols * rows;
      var gy = h / rows, gx = cols ? w / cols : S;

      if (cols !== b.cols || rows !== b.rows) {
        if (rows !== b.rows) { b.parts.length = 0; b.cols = 0; }
        if (cols > b.cols) {                       // growing: new dots pour in from the bar's start
          var fresh = b.cols === 0 && now - b.born < 400;
          for (var c = b.cols; c < cols; c++) for (var k = 0; k < rows; k++) {
            b.parts.push({ c: c, k: k, x: fresh ? Math.random() * 6 : Math.max(0, (b.cols - 1) * gx), y: (k + 0.5) * gy,
              vx: fresh ? 1 + Math.random() * 5 : 2 + Math.random() * 3, vy: (Math.random() - 0.5) * 2, jx: (Math.random() - 0.5) * 1.1, jy: (Math.random() - 0.5) * 1.1, ph: Math.random() * 6.28 });
          }
        } else {                                   // shrinking: the extra dots fall away
          var keep = [];
          for (var i = 0; i < b.parts.length; i++) {
            var p = b.parts[i];
            if (p.c < cols) keep.push(p);
            else if (b.dead.length < 400) b.dead.push({ x: r.left + p.x, y: r.top + p.y, vx: 0.5 + Math.random() * 2, vy: -1 - Math.random() * 2, life: 1 });
          }
          b.parts = keep;
        }
        b.cols = cols; b.rows = rows;
      }

      // 100% reached while you watch: celebrate at the end of the bar
      var ratio = track.width > 0 ? w / track.width : 0;
      if (b.ratio !== null && b.ratio < 0.985 && ratio >= 0.995 && now - b.born > 2500 && el.parentElement.children.length === 1) {
        burst(r.right, r.top + h / 2, { count: 34, power: 5, colors: [b.color].concat(CONFETTI) });
      }
      b.ratio = ratio;

      var mx = mouse.x - r.left, my = mouse.y - r.top;
      var near = mouse.on && mx > -REPEL && mx < w + REPEL && my > -REPEL && my < h + REPEL;
      if (mouse.on && mouse.x >= track.left - 4 && mouse.x <= track.right + 4 && my > -8 && my < h + 8 && mx >= -4 && mx <= w + 4) hover = { ratio: ratio, r: r, el: el };
      var amp = Math.min(1.3, h * 0.13), moving = false;
      ctx.fillStyle = b.color;
      for (var pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass ? 1 : 0.62;
        ctx.beginPath();
        for (var j = 0; j < b.parts.length; j++) {
          var q = b.parts[j];
          var wave = Math.sin(t * 1.7 - q.c * 0.16 + b.seed);
          if ((wave > 0.15 ? 1 : 0) !== pass) continue;
          if (pass === 0 || true) {
            if (!q.done) {
              var hx = (q.c + 0.5) * gx + q.jx, hy = (q.k + 0.5) * gy + q.jy + Math.sin(t * 2.1 + q.c * 0.42 + q.ph) * amp * 0.5;
              var ax = (hx - q.x) * 0.075, ay = (hy - q.y) * 0.075;
              if (near) {
                var dx = q.x - mx, dy = q.y - my, d2 = dx * dx + dy * dy;
                if (d2 < REPEL * REPEL) {
                  var d = Math.sqrt(d2) || 1, f = (1 - d / REPEL); f = f * f * 5.5;
                  ax += (dx / d) * f; ay += (dy / d) * f - f * 0.25;
                }
              }
              q.vx = (q.vx + ax) * 0.84; q.vy = (q.vy + ay) * 0.84;
              q.x += q.vx; q.y += q.vy;
              if (Math.abs(q.vx) + Math.abs(q.vy) > 0.06) moving = true;
            }
          }
          var px = r.left + q.x, py = r.top + q.y;
          ctx.moveTo(px + R, py); ctx.arc(px, py, R, 0, 6.2832);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (b.dead.length) {
        for (var n = b.dead.length - 1; n >= 0; n--) {
          var z = b.dead[n];
          z.vy += 0.28; z.x += z.vx; z.y += z.vy; z.life -= 0.03;
          if (z.life <= 0) { b.dead.splice(n, 1); continue; }
          ctx.globalAlpha = z.life * 0.8;
          ctx.beginPath(); ctx.arc(z.x, z.y, R, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
        busy = true;
      }
      if (b.parts.length) busy = true; // the ripple never stops while bars are on screen
      void moving;
    });

    // Comets along line charts
    lines.forEach(function (l, el) {
      var box = el.getBoundingClientRect();
      if (box.width < 20 || box.bottom < 0 || box.top > H) return;
      var top = frame % 24 === 2 ? document.elementFromPoint(Math.min(Math.max(box.left + box.width / 2, 1), W - 1), Math.min(Math.max(box.top + box.height / 2, 1), H - 1)) : undefined;
      if (top !== undefined) l.hidden = !!top && !(top === el || (el.ownerSVGElement && (el.ownerSVGElement.contains(top) || top.contains(el.ownerSVGElement))));
      if (l.hidden) return;
      var len; try { len = el.getTotalLength(); } catch (e) { return; }
      var m = el.getScreenCTM(); if (!len || !m) return;
      var cycle = ((t / 5.5) + l.off) % 1.35;            // run, then rest
      if (cycle > 1) { l.trail.length = 0; busy = true; return; }
      var color = getComputedStyle(el).stroke || "#0A0A0A";
      for (var s = 0; s < 14; s++) {
        var at = Math.max(0, cycle - s * 0.006) * len, pt = el.getPointAtLength(at);
        var x = m.a * pt.x + m.c * pt.y + m.e, y = m.b * pt.x + m.d * pt.y + m.f;
        ctx.globalAlpha = (1 - s / 14) * 0.9;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, 3.4 - s * 0.2), 0, 6.2832); ctx.fill();
        if (s === 0) { ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      busy = true;
    });

    // Confetti
    for (var u = sparks.length - 1; u >= 0; u--) {
      var sp = sparks[u];
      sp.vy += 0.22; sp.vx *= 0.985; sp.x += sp.vx; sp.y += sp.vy; sp.life -= sp.decay; sp.rot += sp.vx * 0.08;
      if (sp.life <= 0 || sp.y > H + 20) { sparks.splice(u, 1); continue; }
      ctx.globalAlpha = Math.min(1, sp.life * 1.6);
      ctx.fillStyle = sp.c;
      if (sp.sq) { ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot); ctx.fillRect(-sp.r, -sp.r * 0.6, sp.r * 2, sp.r * 1.2); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    // Tooltip: how full the bar under the cursor is
    if (hover) {
      var label = hover.el.getAttribute("data-fx-label") || hover.el.getAttribute("title") || "";
      var txt = (label ? label + " · " : "") + Math.round(hover.ratio * 100) + "%";
      if (tip.textContent !== txt) tip.textContent = txt;
      tip.hidden = false;
      tip.style.left = Math.min(Math.max(mouse.x, 40), W - 40) + "px";
      tip.style.top = (hover.r.top - 10) + "px";
    } else if (!tip.hidden) tip.hidden = true;

    if (busy) { running = true; requestAnimationFrame(tick); }
  }

  if (document.body) setup(); else document.addEventListener("DOMContentLoaded", setup);
})();
