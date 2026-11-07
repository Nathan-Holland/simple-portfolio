// WeightWise — set up once (about you + goal), then log your weight weekly.
//
// Data: { profile, checkins: [{ date: 'YYYY-MM-DD', kg }], updated }
// Synced through /api/weight (Vercel Blob, behind the site login) and cached in
// this browser. If the API can't be reached (e.g. running locally) the browser
// copy is used on its own.
//
// The plan (calories, macros) is always recalculated from the latest weigh-in,
// at the weekly rate chosen when the goal was set.
(function () {
  "use strict";

  // ---------- constants ----------
  var LS_KEY = "weightwise-v1";
  var SHOP_KEY = "weightwise-shop";
  var DAY = 86400000;
  var LB = 2.20462;

  var ACTIVITY = [
    [1.2, "Sedentary", "Desk job, little exercise"],
    [1.375, "Lightly active", "Exercise 1–3 days a week"],
    [1.55, "Moderately active", "Exercise 3–5 days a week"],
    [1.725, "Very active", "Hard exercise 6–7 days a week"],
    [1.9, "Extremely active", "Physical job + daily training"],
  ];

  var FOODS = [
    ["🥩", "Protein", "Lean, complete proteins", [
      ["Chicken breast (skinless)", "31g / 100g"], ["Greek yoghurt (0%)", "10g / 100g"], ["Eggs", "13g / 100g"],
      ["Salmon fillet", "25g / 100g"], ["Tuna (in water)", "26g / 100g"], ["Cottage cheese (low-fat)", "11g / 100g"],
      ["Tofu (firm)", "17g / 100g"], ["Lean turkey mince", "29g / 100g"]]],
    ["🌾", "Carbs", "Slow-release energy and fibre", [
      ["Brown rice", "77g / 100g dry"], ["Rolled oats", "66g / 100g dry"], ["Sweet potato", "20g / 100g"],
      ["Quinoa", "39g / 100g cooked"], ["Wholegrain bread", "43g / 100g"], ["Lentils (cooked)", "20g / 100g"],
      ["Black beans", "24g / 100g"], ["Banana", "27g each"]]],
    ["🥑", "Fats", "Essential fats and micronutrients", [
      ["Avocado", "15g / 100g"], ["Extra virgin olive oil", "100g / 100ml"], ["Almonds", "49g / 100g"],
      ["Walnuts", "65g / 100g"], ["Chia seeds", "31g / 100g"], ["Mackerel, sardines", "omega-3"],
      ["Pumpkin seeds", "19g / 30g"]]],
    ["🥦", "Veg & fruit", "High volume, low calorie", [
      ["Broccoli", "34 kcal / 100g"], ["Spinach, mixed greens", "23 kcal / 100g"], ["Bell peppers", "31 kcal / 100g"],
      ["Cucumber", "15 kcal / 100g"], ["Tomatoes", "18 kcal / 100g"], ["Berries", "~45 kcal / 100g"],
      ["Courgette", "17 kcal / 100g"]]],
  ];

  var MEALS = [
    ["Breakfast", "Oats with Greek yoghurt & berries", "50g rolled oats, 150g Greek yoghurt, a handful of blueberries, 1 tbsp chia seeds", 32, 52, 9],
    ["Lunch", "Chicken & quinoa bowl", "150g chicken breast, 80g quinoa (dry), roasted veg, 1 tsp olive oil, lemon dressing", 50, 55, 10],
    ["Dinner", "Salmon with sweet potato", "180g salmon fillet, 200g sweet potato, steamed broccoli and spinach", 45, 45, 18],
    ["Snack", "Cottage cheese & almonds", "150g low-fat cottage cheese, 20g almonds, sliced apple", 18, 18, 10],
    ["Post-workout", "Egg white omelette", "5 egg whites, mixed peppers, onion, spinach, 1 slice wholegrain toast", 28, 22, 3],
    ["High-protein", "Turkey & lentil stir-fry", "150g lean turkey mince, 100g lentils, bok choy, garlic, ginger, soy sauce", 52, 28, 8],
  ];

  var SHOP = [
    ["Protein", ["Chicken breast (1kg)", "Salmon fillets (4)", "Greek yoghurt (1kg)", "Eggs (12)", "Tuna (4 cans)", "Cottage cheese (500g)", "Turkey mince (500g)"]],
    ["Carbs & produce", ["Rolled oats (1kg)", "Brown rice (1kg)", "Sweet potatoes (4–5)", "Quinoa (500g)", "Wholegrain bread", "Bananas", "Berries"]],
    ["Veg, fats & staples", ["Broccoli (2 heads)", "Spinach (200g)", "Bell peppers (4–5)", "Avocados (3–4)", "Almonds (200g)", "Olive oil", "Chia seeds (200g)"]],
  ];

  var MACRO_COLORS = { protein: "#141414", carbs: "#ff5a36", fat: "#f5a700" };

  // ---------- state ----------
  var store = { profile: null, checkins: [], updated: null };
  var sync = "loading";
  var reachable = false;
  var tab = "progress";
  var step = 1;          // onboarding step
  var draft = null;      // form values (display units) for onboarding or the You tab
  var youDirty = false;
  var editingDate = null;
  var showAll = false;

  var app = document.getElementById("app");
  var $ = function (id) { return document.getElementById(id); };

  // ---------- dates ----------
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function today() { return iso(new Date()); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function addDays(s, n) { return iso(new Date(parse(s).getTime() + n * DAY)); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }
  function fmtDate(s, year) {
    var o = { weekday: "short", day: "numeric", month: "short" };
    if (year) o.year = "numeric";
    return parse(s).toLocaleDateString("en-GB", o);
  }
  function shortDate(s) { return parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  function longDate(s) { return parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }

  // ---------- units ----------
  function U() { return (draft && draft.units) || (store.profile && store.profile.units) || "metric"; }
  function SU() { return (store.profile && store.profile.units) || "metric"; } // saved units, for dashboard views
  function unit(u) { return (u || SU()) === "metric" ? "kg" : "lbs"; }
  function disp(kg, u) { return (u || SU()) === "metric" ? kg : kg * LB; }
  function toKg(v, u) { return (u || SU()) === "metric" ? v : v / LB; }
  function w(kg, u, dp) { return disp(kg, u).toFixed(dp == null ? 1 : dp); }
  function signed(kg, u) {
    var v = disp(kg, u);
    if (Math.abs(v) < 0.05) return "±0.0";
    return (v > 0 ? "+" : "−") + Math.abs(v).toFixed(1);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function round1(n) { return Math.round(n * 10) / 10; }

  // ---------- health maths ----------
  function navyBF(h, g, waist, neck, hip) {
    if (g === "male") {
      if (!(waist > neck)) return null;
      return Math.max(2, Math.min(60, 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(h) + 36.76));
    }
    if (!(waist + hip > neck) || !hip) return null;
    return Math.max(8, Math.min(60, 163.205 * Math.log10(waist + hip - neck) - 97.684 * Math.log10(h) - 78.387));
  }
  function bodyFat(p) {
    var b = p.bf_inputs || {};
    if (p.bf_method === "direct" && b.pct >= 3 && b.pct <= 60) return b.pct;
    if (p.bf_method === "measure" && b.waist_cm && b.neck_cm) return navyBF(p.height_cm, p.gender, b.waist_cm, b.neck_cm, b.hip_cm);
    return null;
  }
  function bmiCat(b) {
    if (b < 18.5) return ["Underweight", "info"];
    if (b < 25) return ["Healthy", "good"];
    if (b < 30) return ["Overweight", "warn"];
    return ["Obese", "bad"];
  }
  function bfCat(p, g) {
    var t = g === "male" ? [6, 14, 18, 25] : [14, 21, 25, 32];
    if (p < t[0]) return ["Essential fat", "info"];
    if (p < t[1]) return ["Athletic", "good"];
    if (p < t[2]) return ["Fitness", "good"];
    if (p < t[3]) return ["Average", "warn"];
    return ["High", "bad"];
  }
  function rateNote(rate, diff) {
    if (Math.abs(diff) < 0.5) return ["good", "Your goal is about your current weight, so this is a maintenance plan."];
    var r = Math.abs(rate), dir = diff > 0 ? "loss" : "gain";
    if (r <= 1) return ["good", r.toFixed(2) + " kg a week of " + dir + ". " + (r <= 0.5 ? "Conservative and very safe." : "Within the safe 0.25–1 kg a week range.")];
    if (r <= 1.5) return ["warn", r.toFixed(2) + " kg a week is a bit aggressive. A longer timeframe protects muscle and is easier to stick to."];
    return ["bad", r.toFixed(2) + " kg a week is faster than recommended and risks muscle loss. Try a longer timeframe."];
  }

  // Everything derived from a profile at a given weight
  function compute(p, kg) {
    var h = p.height_cm, hm = h / 100, male = p.gender === "male";
    var bmi = kg / (hm * hm);
    var bf = bodyFat(p);
    var lbm = bf != null ? kg * (1 - bf / 100) : null;
    var bmr = lbm != null ? 370 + 21.6 * lbm : 10 * kg + 6.25 * h - 5 * p.age + (male ? 5 : -161);
    var tdee = Math.round(bmr * (+p.activity || 1.2));
    var target = p.target_weight_kg;
    var start = p.start_weight_kg != null ? p.start_weight_kg : kg;
    var planRate = p.weeks ? Math.abs(start - target) / p.weeks : 0.5;
    var remaining = kg - target;
    var mode = Math.abs(remaining) < 0.5 ? "maintain" : remaining > 0 ? "lose" : "gain";
    var rate = mode === "maintain" ? 0 : Math.min(planRate || 0.5, 1.5);
    var daily = Math.round(rate * 7700 / 7);
    var raw = mode === "lose" ? tdee - daily : mode === "gain" ? tdee + daily : tdee;
    var floor = male ? 1500 : 1200;
    var cal = Math.max(raw, floor);
    var proteinG = Math.round(lbm != null ? lbm * 2.4 : Math.max(target, kg * 0.8) * 2);
    var fatG = Math.round(kg * 0.9);
    if (fatG * 9 < cal * 0.2) fatG = Math.round(cal * 0.2 / 9);
    var carbG = Math.max(0, Math.round((cal - proteinG * 4 - fatG * 9) / 4));
    var tot = proteinG * 4 + carbG * 4 + fatG * 9;
    return {
      bmi: bmi, bmiCat: bmiCat(bmi),
      idealMin: 18.5 * hm * hm, idealMax: 24.9 * hm * hm, idealMid: 21.7 * hm * hm,
      bf: bf, lbm: lbm, fatMass: bf != null ? kg - lbm : null,
      tdee: tdee, mode: mode, rate: rate, daily: Math.abs(cal - tdee), cal: cal, floored: raw < floor, floor: floor,
      proteinG: proteinG, carbG: carbG, fatG: fatG,
      pPct: Math.round(proteinG * 4 / tot * 100), cPct: Math.round(carbG * 4 / tot * 100), fPct: 100 - Math.round(proteinG * 4 / tot * 100) - Math.round(carbG * 4 / tot * 100),
      end: p.plan_start && p.weeks ? addDays(p.plan_start, p.weeks * 7) : null,
    };
  }

  // ---------- storage + sync ----------
  function normalize(d) {
    var out = { profile: null, checkins: [], updated: null };
    if (!d || typeof d !== "object") return out;
    out.profile = d.profile && typeof d.profile === "object" && d.profile.height_cm ? d.profile : null;
    out.updated = d.updated || null;
    var by = {};
    (Array.isArray(d.checkins) ? d.checkins : []).forEach(function (c) {
      if (c && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && isFinite(c.kg)) by[c.date] = { date: c.date, kg: +c.kg };
    });
    out.checkins = Object.keys(by).sort().map(function (k) { return by[k]; });
    return out;
  }
  function readLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { return null; } }
  function writeLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { /* storage blocked */ } }

  async function load() {
    var local = readLocal(), remote = null;
    try {
      var r = await fetch("/api/weight", { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { reachable = true; remote = (await r.json()).data; }
      else if (r.status === 401) sync = "signedout";
    } catch (e) { /* offline or no API */ }
    if (reachable) {
      sync = "synced";
      var localNewer = local && local.updated && (!remote || !remote.updated || local.updated > remote.updated);
      if (localNewer) { store = normalize(local); push(); }
      else if (remote) store = normalize(remote);
      else if (local) store = normalize(local);
    } else {
      if (sync !== "signedout") sync = "device";
      if (local) store = normalize(local);
    }
    writeLocal();
  }
  async function push() {
    if (!reachable) return renderSync();
    try {
      var r = await fetch("/api/weight", {
        method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: store.profile, checkins: store.checkins }),
      });
      if (!r.ok) throw new Error(r.status);
      var j = await r.json();
      store.updated = j.updated || store.updated;
      writeLocal();
      sync = "synced";
    } catch (e) { sync = "error"; }
    renderSync();
  }
  function save() { store.updated = new Date().toISOString(); writeLocal(); push(); }
  function upsert(date, kg) {
    store.checkins = store.checkins.filter(function (c) { return c.date !== date; });
    store.checkins.push({ date: date, kg: Math.round(kg * 100) / 100 });
    store.checkins.sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function latest() { return store.checkins[store.checkins.length - 1] || null; }
  function latestKg() { var l = latest(); return l ? l.kg : (store.profile && store.profile.start_weight_kg); }

  function renderSync() {
    var el = $("sync");
    if (!store.profile) { el.hidden = true; return; }
    var m = {
      synced: ["ok", "Synced"], device: ["warn", "This browser only"], error: ["err", "Not synced"],
      signedout: ["err", "Signed out"], loading: ["", "Loading"],
    }[sync] || ["", ""];
    el.hidden = false;
    el.className = "sync " + m[0];
    el.textContent = m[1];
    el.title = {
      device: "Saved in this browser. Syncing between devices works on nate-holland.com.",
      error: "Couldn’t reach the server. Saved in this browser; it will retry on your next change.",
      signedout: "Sign in to nate-holland.com to sync.",
    }[sync] || "";
  }

  var toastTimer;
  function toast(msg, err) {
    var t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (err ? " err" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ---------- drafts (form values in display units) ----------
  function blankDraft() {
    return { units: "metric", weight: "", age: "", cm: "", ft: "", inch: "", gender: null, activity: null,
      bf: "none", bfPct: "", waist: "", neck: "", hip: "", target: "", weeks: "" };
  }
  function draftFrom(p) {
    var u = p.units || "metric", d = blankDraft(), b = p.bf_inputs || {};
    var len = function (cm) { return cm ? (u === "metric" ? round1(cm) : round1(cm / 2.54)) : ""; };
    d.units = u;
    d.weight = latestKg() ? w(latestKg(), u) : "";
    d.age = p.age || "";
    if (u === "metric") d.cm = p.height_cm ? Math.round(p.height_cm) : "";
    else { var ti = Math.round(p.height_cm / 2.54); d.ft = Math.floor(ti / 12); d.inch = ti % 12; }
    d.gender = p.gender || null;
    d.activity = p.activity != null ? +p.activity : null;
    d.bf = p.bf_method || "none";
    d.bfPct = b.pct != null ? b.pct : "";
    d.waist = len(b.waist_cm); d.neck = len(b.neck_cm); d.hip = len(b.hip_cm);
    d.target = p.target_weight_kg ? w(p.target_weight_kg, u) : "";
    d.weeks = p.weeks || "";
    return d;
  }
  function heightCm(d) {
    if (d.units === "metric") return num(d.cm);
    var ft = num(d.ft), inch = num(d.inch) || 0;
    return ft != null ? (ft * 12 + inch) * 2.54 : null;
  }
  function setUnits(d, u) {
    if (d.units === u) return;
    var kgOf = function (v) { var n = num(v); return n == null ? null : toKg(n, d.units); };
    var cmOf = function (v) { var n = num(v); return n == null ? null : (d.units === "metric" ? n : n * 2.54); };
    var wt = kgOf(d.weight), tg = kgOf(d.target), h = heightCm(d);
    var wa = cmOf(d.waist), ne = cmOf(d.neck), hi = cmOf(d.hip);
    d.units = u;
    d.weight = wt != null ? w(wt, u) : "";
    d.target = tg != null ? w(tg, u) : "";
    if (h) {
      if (u === "metric") { d.cm = Math.round(h); d.ft = d.inch = ""; }
      else { var ti = Math.round(h / 2.54); d.ft = Math.floor(ti / 12); d.inch = ti % 12; d.cm = ""; }
    }
    var len = function (cm) { return cm == null ? "" : (u === "metric" ? round1(cm) : round1(cm / 2.54)); };
    d.waist = len(wa); d.neck = len(ne); d.hip = len(hi);
  }
  // Profile fields from a draft (the stats part; goal handled separately)
  function statsFrom(d) {
    var cm = function (v) { var n = num(v); return n == null ? null : (d.units === "metric" ? n : n * 2.54); };
    return {
      units: d.units, gender: d.gender, height_cm: heightCm(d), age: Math.round(num(d.age)), activity: d.activity,
      bf_method: d.bf, bf_inputs: { pct: num(d.bfPct), waist_cm: cm(d.waist), neck_cm: cm(d.neck), hip_cm: cm(d.hip) },
    };
  }

  function validateAbout(d, withWeight) {
    var e = {};
    var wt = num(d.weight), kg = wt != null ? toKg(wt, d.units) : null;
    if (withWeight && !(kg >= 25 && kg <= 400)) e.weight = 1;
    var age = num(d.age); if (!(age >= 15 && age <= 100)) e.age = 1;
    var h = heightCm(d); if (!(h >= 100 && h <= 250)) e.height = 1;
    if (!d.gender) e.gender = 1;
    if (!d.activity) e.activity = 1;
    if (d.bf === "direct") { var p = num(d.bfPct); if (!(p >= 3 && p <= 60)) e.bf = 1; }
    if (d.bf === "measure") {
      var bf = navyBF(h, d.gender, statsFrom(d).bf_inputs.waist_cm, statsFrom(d).bf_inputs.neck_cm, statsFrom(d).bf_inputs.hip_cm);
      if (bf == null) e.bf = 1;
    }
    return e;
  }
  function validateGoal(d) {
    var e = {}, t = num(d.target), kg = t != null ? toKg(t, d.units) : null, wk = num(d.weeks);
    if (!(kg >= 30 && kg <= 400)) e.target = 1;
    if (!(wk >= 1 && wk <= 104)) e.weeks = 1;
    return e;
  }
  function showErrors(e) {
    app.querySelectorAll(".field[data-f]").forEach(function (f) { f.classList.toggle("error", !!e[f.dataset.f]); });
    var first = app.querySelector(".field.error");
    if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); var i = first.querySelector("input"); if (i) i.focus({ preventScroll: true }); }
    return !Object.keys(e).length;
  }

  // ---------- form pieces ----------
  var ICON = {
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  };

  function numInput(k, val, u, step, label) {
    return '<div class="input"><input id="f-' + k + '" data-k="' + k + '" type="number" inputmode="decimal" step="' + (step || "any") + '"' +
      (u ? ' class="has-unit"' : "") + ' value="' + esc(val) + '"' + (label ? ' aria-label="' + esc(label) + '"' : "") + ">" +
      (u ? '<span class="unit">' + u + "</span>" : "") + "</div>";
  }
  function field(f, label, inner, err, opts) {
    opts = opts || {};
    return '<div class="field' + (opts.full ? " full" : "") + '" data-f="' + f + '">' +
      (opts.forId ? '<label for="' + opts.forId + '">' + label + "</label>" : '<span class="label">' + label + "</span>") +
      inner + (opts.hint ? '<span class="hint">' + opts.hint + "</span>" : "") + '<span class="err">' + err + "</span></div>";
  }
  function seg(act, options, current, block) {
    return '<div class="seg' + (block ? " block" : "") + '" role="radiogroup">' + options.map(function (o) {
      return '<button type="button" role="radio" data-act="' + act + '" data-v="' + o[0] + '" aria-checked="' + (String(current) === String(o[0])) + '">' + o[1] + "</button>";
    }).join("") + "</div>";
  }

  function aboutFields(d, withWeight) {
    var u = d.units, wu = u === "metric" ? "kg" : "lbs", lu = u === "metric" ? "cm" : "in";
    var h = u === "metric"
      ? numInput("cm", d.cm, "cm", "1", "Height in cm")
      : '<div class="pair">' + numInput("ft", d.ft, "ft", "1", "Feet") + numInput("inch", d.inch, "in", "1", "Inches") + "</div>";
    var bfBody =
      seg("bf", [["none", "Skip"], ["direct", "I know it"], ["measure", "Measure it"]], d.bf, true) +
      (d.bf === "direct" ? field("bf", "Body fat", numInput("bfPct", d.bfPct, "%", "0.1"), "Enter a body fat % between 3 and 60.", { forId: "f-bfPct", hint: "From a DEXA scan, calipers or a smart scale." }) : "") +
      (d.bf === "measure" ? '<div class="fields">' +
        field("bf", "Waist (at navel)", numInput("waist", d.waist, lu, "0.5"), "Waist must be bigger than neck.", { forId: "f-waist" }) +
        field("bf", "Neck", numInput("neck", d.neck, lu, "0.5"), "", { forId: "f-neck" }) +
        (d.gender === "female" ? field("bf", "Hips (widest point)", numInput("hip", d.hip, lu, "0.5"), "", { forId: "f-hip" }) : "") +
        '</div><span class="hint">Estimated with the US Navy tape-measure formula.</span>' : "");
    return '<div class="fields">' +
      (withWeight ? field("weight", "Current weight", numInput("weight", d.weight, wu, "0.1"), "Enter your weight.", { forId: "f-weight" }) : "") +
      field("age", "Age", numInput("age", d.age, "yrs", "1"), "Enter an age between 15 and 100.", { forId: "f-age" }) +
      field("height", "Height", h, "Enter your height.", u === "metric" ? { forId: "f-cm" } : {}) +
      field("gender", "Sex", seg("gender", [["male", "Male"], ["female", "Female"]], d.gender, true), "Choose one — it changes the calorie formula.") +
      field("activity", "Activity level", '<div class="options" role="radiogroup">' + ACTIVITY.map(function (a) {
        return '<button type="button" class="option" role="radio" data-act="activity" data-v="' + a[0] + '" aria-checked="' + (d.activity === a[0]) + '"><span class="radio"></span><b>' + a[1] + '</b><span class="d">' + a[2] + "</span></button>";
      }).join("") + "</div>", "Choose your activity level.", { full: true }) +
      '<details class="more field full"' + (d.bf !== "none" ? " open" : "") + '><summary>' + ICON.chev + 'Body fat <span class="tag">optional</span></summary>' +
        '<div class="body"><span class="hint">Makes calorie and protein targets more accurate if you carry a lot of muscle.</span>' + bfBody + "</div></details>" +
      "</div>";
  }

  function goalFields(d, mid) {
    var u = d.units, wu = u === "metric" ? "kg" : "lbs";
    return '<div class="fields">' +
      field("target", "Goal weight", numInput("target", d.target, wu, "0.1"), "Enter a goal weight.", {
        forId: "f-target",
        hint: mid ? '<span class="chips"><button type="button" class="chip-btn" data-act="midpoint">Use healthy midpoint · ' + w(mid, u) + " " + wu + "</button></span>" : "",
      }) +
      field("weeks", "Timeframe", numInput("weeks", d.weeks, "weeks", "1"), "Enter 1–104 weeks.", {
        forId: "f-weeks",
        hint: '<span class="chips">' + [8, 12, 16, 24].map(function (n) {
          return '<button type="button" class="chip-btn" data-act="weeks" data-v="' + n + '" aria-pressed="' + (String(d.weeks) === String(n)) + '">' + n + "</button>";
        }).join("") + "</span>",
      }) +
      '<div class="field full" id="goalNote"></div>' +
      "</div>";
  }

  // Live goal summary (rate note + calorie preview), from a draft
  function goalPreview(d, kgNow, p0) {
    var tg = num(d.target), wk = num(d.weeks);
    if (tg == null || !wk || !kgNow) return { note: "", preview: "" };
    var tKg = toKg(tg, d.units);
    // An unchanged saved goal keeps its original start date; a new or changed goal starts today
    var same = p0.plan_start && Math.abs(tKg - p0.target_weight_kg) <= 0.05 && wk === p0.weeks;
    var p = Object.assign({}, p0, { target_weight_kg: tKg, weeks: wk },
      same ? {} : { start_weight_kg: kgNow, plan_start: today() });
    var c = compute(p, kgNow);
    var rn = rateNote((p.start_weight_kg - tKg) / wk, p.start_weight_kg - tKg);
    var dir = c.mode === "maintain" ? "Maintain" : (c.mode === "lose" ? "−" : "+") + w(c.rate, d.units, 2) + " " + (d.units === "metric" ? "kg" : "lbs") + " a week";
    return {
      note: '<div class="note ' + rn[0] + '">' + esc(rn[1]) + "</div>",
      preview: '<div class="preview"><span class="l">Daily calorie target</span><span class="v">' + c.cal.toLocaleString() + "<small>kcal</small></span>" +
        '<span class="t">' + dir + " · goal by " + longDate(c.end) + (c.floored ? " · minimum " + c.floor.toLocaleString() + " kcal applied" : "") + "</span></div>",
    };
  }

  // ---------- onboarding ----------
  function renderOnboarding() {
    var d = draft;
    var head = '<div class="steps" aria-label="Step ' + step + ' of 2">' +
      '<span class="s ' + (step === 1 ? "on" : "done") + '"><span class="n">' + (step === 1 ? "1" : "✓") + "</span>About you</span>" +
      '<span class="line"></span><span class="s ' + (step === 2 ? "on" : "") + '"><span class="n">2</span>Your goal</span></div>';
    var body;
    if (step === 1) {
      body = '<div class="card"><div class="head"><div><p class="eyebrow">Step 1 of 2</p><h2>About you</h2>' +
        '<p class="sub">Used to work out how many calories you burn. You can change these later.</p></div>' +
        seg("units", [["metric", "kg · cm"], ["imperial", "lbs · ft"]], d.units) + "</div>" +
        aboutFields(d, true) +
        '<div class="actions"><div class="right"><button class="btn dark" type="button" data-act="next">Continue ' + ICON.arrow + "</button></div></div></div>";
    } else {
      var p = statsFrom(d), kg = toKg(num(d.weight), d.units), c = compute(Object.assign({ target_weight_kg: kg, weeks: 12 }, p), kg);
      body = '<div class="card"><p class="eyebrow">Step 2 of 2</p><h2>Your goal</h2>' +
        '<p class="sub">Where you are now, and where you want to get to.</p><div style="height:20px"></div>' +
        '<div class="snapshot">' +
          '<div class="snap"><span class="l">BMI</span><span class="v">' + c.bmi.toFixed(1) + '</span><span class="t">' + c.bmiCat[0] + "</span></div>" +
          '<div class="snap"><span class="l">Healthy range</span><span class="v">' + w(c.idealMin, d.units, 0) + "–" + w(c.idealMax, d.units, 0) + "<small>" + unit(d.units) + '</small></span><span class="t">BMI 18.5–24.9</span></div>' +
          '<div class="snap"><span class="l">Maintenance</span><span class="v">' + c.tdee.toLocaleString() + '<small>kcal</small></span><span class="t">to stay at ' + w(kg, d.units) + " " + unit(d.units) + "</span></div>" +
        "</div>" +
        goalFields(d, c.idealMid) +
        '<div id="goalPreview"></div>' +
        '<div class="actions"><button class="btn ghost" type="button" data-act="back">' + ICON.back + 'Back</button><div class="right"><button class="btn dark" type="button" data-act="finish">Start tracking ' + ICON.arrow + "</button></div></div></div>";
    }
    app.innerHTML = '<div class="view onboard">' + head + body + "</div>";
    if (step === 2) updateGoalPreview();
  }
  function updateGoalPreview() {
    var d = draft, kg = store.profile ? latestKg() : toKg(num(d.weight), d.units);
    var base = store.profile ? Object.assign({}, store.profile, statsFrom(d)) : statsFrom(d);
    var g = goalPreview(d, kg, base);
    var n = $("goalNote"); if (n) n.innerHTML = g.note;
    var pv = $("goalPreview"); if (pv) pv.innerHTML = g.preview;
  }

  function finishOnboarding() {
    if (!showErrors(validateGoal(draft))) return;
    var d = draft, kg = toKg(num(d.weight), d.units);
    store.profile = Object.assign(statsFrom(d), {
      target_weight_kg: toKg(num(d.target), d.units), weeks: Math.round(num(d.weeks)),
      plan_start: today(), start_weight_kg: kg,
    });
    store.checkins = [];
    upsert(today(), kg);
    save();
    draft = null;
    toast("You’re set up. Log your weight once a week.");
    showDashboard("progress");
  }

  // ---------- dashboard ----------
  function showDashboard(t) {
    $("tabs").hidden = false;
    setTab(t || tabFromHash() || "progress", true);
  }
  function tabFromHash() { var h = location.hash.replace("#", ""); return ["progress", "plan", "food", "you"].indexOf(h) >= 0 ? h : null; }
  function setTab(t, force) {
    if (t === tab && !force) return;
    if (tab === "you" && t !== "you" && youDirty && !confirm("Discard your unsaved changes?")) return;
    if (t !== "you") { youDirty = false; draft = null; }
    tab = t;
    if (location.hash !== "#" + t) history.replaceState(null, "", "#" + t);
    document.querySelectorAll("#tabs button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === t)); });
    moveIndicator();
    render();
  }
  function moveIndicator() {
    var b = document.querySelector('#tabs button[aria-selected="true"]'), ind = document.querySelector(".tab-indicator");
    if (!b || !ind) return;
    ind.style.width = b.offsetWidth + "px";
    ind.style.translate = b.offsetLeft + "px 0";
  }

  function render() {
    renderSync();
    var p = store.profile;
    if (!p) { $("tabs").hidden = true; $("eyebrow").textContent = "Personal health plan"; draft = draft || blankDraft(); return renderOnboarding(); }
    var first = store.checkins[0];
    var wk = first ? Math.round(daysBetween(first.date, today()) / 7) + 1 : 1;
    $("eyebrow").textContent = "Week " + wk + " · goal " + w(p.target_weight_kg) + " " + unit();
    if (tab === "plan") return renderPlan();
    if (tab === "food") return renderFood();
    if (tab === "you") return renderYou();
    renderProgress();
  }

  // ---------- progress ----------
  function renderProgress() {
    var p = store.profile, ck = store.checkins, L = latest(), F = ck[0], t = today();
    var kg = latestKg(), c = compute(p, kg);
    var losing = p.start_weight_kg >= p.target_weight_kg;

    // due badge
    var due;
    if (!L) due = ["now", "First check-in"];
    else if (L.date === t) due = ["done", "Logged today"];
    else {
      var next = addDays(L.date, 7);
      due = next <= t ? ["now", next === t ? "Due today" : "Check-in due"] : ["", "Next " + fmtDate(next)];
    }

    var change = L && F ? L.kg - F.kg : 0;
    var changeCls = Math.abs(change) < 0.05 ? "" : ((change < 0) === losing ? "good" : "bad");
    var from = F ? F.kg : p.start_weight_kg;
    var span = Math.abs(from - p.target_weight_kg), left = Math.abs(kg - p.target_weight_kg);
    var reached = losing ? kg <= p.target_weight_kg + 0.05 : kg >= p.target_weight_kg - 0.05;
    var pct = reached ? 100 : span > 0 ? Math.max(0, Math.min(100, Math.round((span - left) / span * 100))) : 100;

    // pace over the last ~4 weeks
    var pace = null;
    if (ck.length > 1) {
      var ref = ck[0];
      for (var i = ck.length - 2; i >= 0; i--) { ref = ck[i]; if (daysBetween(ck[i].date, L.date) >= 28) break; }
      pace = (L.kg - ref.kg) / Math.max(daysBetween(ref.date, L.date) / 7, 1 / 7);
    }
    var planPace = losing ? -c.rate : c.rate;
    var onTrack = pace != null && (losing ? pace <= planPace * 0.8 : pace >= planPace * 0.8);
    var projected = null;
    if (pace != null && !reached && ((losing && pace < -0.02) || (!losing && pace > 0.02))) {
      projected = addDays(L.date, Math.round(left / Math.abs(pace) * 7));
    }

    var html = '<div class="view">' +
      '<div class="grid-main">' +
        '<div class="card now">' +
          '<div><p class="eyebrow">Current weight</p><div class="big">' + w(kg) + "<small>" + unit() + "</small></div></div>" +
          '<div class="meta">' +
            (F && ck.length > 1 ? '<span class="pill ' + changeCls + '">' + signed(change) + " " + unit() + " since " + shortDate(F.date) + "</span>" : '<span class="pill">Starting point</span>') +
            '<span class="pill">BMI ' + c.bmi.toFixed(1) + "</span>" +
            (L ? '<span class="pill">Weighed ' + shortDate(L.date) + "</span>" : "") +
          "</div>" +
          '<div class="goal-track"><div class="ends"><span>Start <b>' + w(from) + "</b></span><span>" + (reached ? "Goal reached 🎉" : w(left) + " " + unit() + " to go · " + pct + "%") + "</span><span>Goal <b>" + w(p.target_weight_kg) + "</b></span></div>" +
            '<div class="bar"><span data-w="' + pct + '%"></span></div></div>' +
        "</div>" +
        '<div class="card log"><div class="head"><div><p class="eyebrow">Weekly check-in</p><h2>Log your weight</h2></div><span class="due ' + due[0] + '">' + due[1] + "</span></div>" +
          '<form id="logForm" novalidate><div class="pair">' +
            '<div class="field"><label for="logDate">Date</label><div class="input"><input type="date" id="logDate" value="' + t + '" max="' + t + '"></div></div>' +
            '<div class="field"><label for="logKg">Weight</label><div class="input"><input type="number" id="logKg" class="has-unit" inputmode="decimal" step="0.1" placeholder="' + (L ? w(L.kg) : "") + '"><span class="unit">' + unit() + "</span></div></div>" +
          '</div><button class="btn dark" type="submit">Save check-in</button></form><p class="msg" id="logMsg" role="status"></p>' +
        "</div>" +
      "</div>" +
      '<div class="stats">' +
        stat("Weekly pace", pace == null ? "—" : signed(pace), pace == null ? "" : unit() + "/wk",
          pace == null ? "Log next week to see it" : "plan " + signed(planPace) + " " + unit() + "/wk", pace == null ? "" : onTrack ? "good" : "") +
        stat("Projected goal date", reached ? "Done" : projected ? shortDate(projected) : "—", "",
          reached ? "You’ve hit your goal" : projected ? "at your current pace" + (c.end ? " · plan " + shortDate(c.end) : "") : (c.end ? "plan " + longDate(c.end) : "")) +
        stat("Daily target", c.cal.toLocaleString(), "kcal", c.proteinG + "g protein", "", "plan") +
        stat("Check-ins", String(ck.length), "", F ? "since " + shortDate(F.date) : "") +
      "</div>" +
      '<div class="card"><div class="head"><div><p class="eyebrow">Progress</p><h2>Weight over time</h2></div>' +
        '<div class="legend"><span><i></i>Weight</span><span><i class="plan"></i>Plan</span><span><i class="goal"></i>Goal</span></div></div>' +
        '<div class="chart" id="chart"></div></div>' +
      '<div class="card"><p class="eyebrow">History</p><h2>Check-ins</h2><ul class="list" id="history"></ul><button class="link" type="button" id="moreBtn" hidden></button></div>' +
      "</div>";
    app.innerHTML = html;
    renderChart();
    renderHistory();
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      app.querySelectorAll("[data-w]").forEach(function (el) { el.style.width = el.dataset.w; });
    }); });
  }

  function stat(l, v, u, t, cls, link) {
    return '<div class="stat"' + (link ? ' role="link" tabindex="0" data-act="tab" data-v="' + link + '" style="cursor:pointer"' : "") + '><span class="l">' + l + '</span><span class="v">' + v +
      (u ? "<small>" + u + "</small>" : "") + '</span><span class="t ' + (cls || "") + '">' + esc(t) + "</span></div>";
  }

  function renderChart() {
    var box = $("chart"), p = store.profile, ck = store.checkins;
    if (!box) return;
    if (!ck.length) { box.innerHTML = '<p class="chart-empty">Your chart starts with your first check-in.</p>'; return; }
    // Draw at the box's real width so labels stay readable on a phone
    var W = Math.max(300, Math.round(box.clientWidth) || 720), H = W < 500 ? 220 : 260, L = 40, R = 14, T = 14, B = 30;
    var t0 = ck[0].date, t1 = ck[ck.length - 1].date;
    if (daysBetween(t0, t1) < 28) t1 = addDays(t0, 28);
    var span = daysBetween(t0, t1);
    var plan = null;
    if (p.plan_start && p.weeks && p.start_weight_kg != null) {
      var ps = p.plan_start, pe = addDays(ps, p.weeks * 7);
      var at = function (d) { var f = daysBetween(ps, d) / (p.weeks * 7); return p.start_weight_kg + (p.target_weight_kg - p.start_weight_kg) * Math.max(0, Math.min(1, f)); };
      var a = ps < t0 ? t0 : ps, b = pe > t1 ? t1 : pe;
      if (a <= b) plan = [[a, at(a)], [b, at(b)]];
    }
    var vals = ck.map(function (c) { return disp(c.kg); });
    vals.push(disp(p.target_weight_kg));
    if (plan) vals.push(disp(plan[0][1]), disp(plan[1][1]));
    var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    var pad = Math.max((mx - mn) * 0.12, 1);
    var step_ = Math.max(1, Math.ceil((mx - mn + 2 * pad) / 4));
    var lo = Math.floor((mn - pad) / step_) * step_, hi = lo + step_ * 4;
    while (hi < mx + pad * 0.5) hi += step_;
    var x = function (d) { return L + daysBetween(t0, d) / span * (W - L - R); };
    var y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Weight over time">' +
      '<defs><linearGradient id="wwFade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#141414" stop-opacity=".08"/><stop offset="1" stop-color="#141414" stop-opacity="0"/></linearGradient></defs><g class="grid axis">';
    for (var v = lo; v <= hi + 1e-9; v += step_) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 10) + '" y="' + (y(v) + 3.5) + '" text-anchor="end">' + v + "</text>";
    }
    var mid = addDays(t0, Math.round(span / 2));
    [[t0, "start"], [mid, "middle"], [t1, "end"]].forEach(function (d) { s += '<text x="' + x(d[0]) + '" y="' + (H - 8) + '" text-anchor="' + d[1] + '">' + shortDate(d[0]) + "</text>"; });
    s += "</g>";
    var gy = y(disp(p.target_weight_kg));
    s += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/><text class="goal-label" x="' + (W - R) + '" y="' + (gy - 6) + '" text-anchor="end">goal ' + w(p.target_weight_kg) + "</text>";
    if (plan) s += '<line class="plan" x1="' + x(plan[0][0]) + '" y1="' + y(disp(plan[0][1])) + '" x2="' + x(plan[1][0]) + '" y2="' + y(disp(plan[1][1])) + '"/>';
    var pts = ck.map(function (c) { return [x(c.date), y(disp(c.kg))]; });
    if (pts.length > 1) {
      var line = pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(" ");
      s += '<path class="area" d="' + line + " L" + pts[pts.length - 1][0].toFixed(1) + " " + (H - B) + " L" + pts[0][0].toFixed(1) + " " + (H - B) + ' Z"/><path class="line" d="' + line + '"/>';
    }
    pts.forEach(function (q, i) {
      s += '<circle class="dot' + (i === pts.length - 1 ? " last" : "") + '" cx="' + q[0] + '" cy="' + q[1] + '" r="4"/><circle class="hit" data-i="' + i + '" cx="' + q[0] + '" cy="' + q[1] + '" r="14"/>';
    });
    box.innerHTML = s + '</svg><div class="tip" hidden></div>';
    var tip = box.querySelector(".tip");
    box.querySelectorAll(".hit").forEach(function (h) {
      h.addEventListener("mouseenter", function () {
        var c = ck[+h.dataset.i];
        tip.textContent = shortDate(c.date) + " · " + w(c.kg) + " " + unit();
        tip.style.left = (+h.getAttribute("cx") / W * 100) + "%";
        tip.style.top = (+h.getAttribute("cy") / H * 100) + "%";
        tip.hidden = false;
      });
      h.addEventListener("mouseleave", function () { tip.hidden = true; });
    });
  }

  function renderHistory() {
    var list = $("history"), more = $("moreBtn");
    if (!list) return;
    var ck = store.checkins, rev = ck.slice().reverse(), first = ck[0];
    list.innerHTML = (showAll ? rev : rev.slice(0, 8)).map(function (c) {
      var i = ck.indexOf(c), prev = ck[i - 1];
      if (editingDate === c.date) {
        return '<li class="row editing" data-date="' + c.date + '"><input type="date" class="e-date" value="' + c.date + '" max="' + today() + '" aria-label="Date">' +
          '<input type="number" class="e-kg" value="' + w(c.kg) + '" step="0.1" aria-label="Weight in ' + unit() + '">' +
          '<div class="acts"><button class="icon" type="button" data-act="h-save" aria-label="Save">' + ICON.ok + '</button><button class="icon" type="button" data-act="h-cancel" aria-label="Cancel">' + ICON.x + "</button></div></li>";
      }
      var diff = prev ? c.kg - prev.kg : null;
      var cls = diff == null || Math.abs(diff) < 0.05 ? "" : diff < 0 ? "down" : "up";
      return '<li class="row" data-date="' + c.date + '"><span class="d">' + fmtDate(c.date, parse(c.date).getFullYear() !== new Date().getFullYear()) +
        "<small>Week " + (Math.round(daysBetween(first.date, c.date) / 7) + 1) + '</small></span><span class="w">' + w(c.kg) + " " + unit() + "</span>" +
        '<span class="c ' + cls + '">' + (diff == null ? "start" : signed(diff)) + "</span>" +
        '<div class="acts"><button class="icon" type="button" data-act="h-edit" aria-label="Edit ' + c.date + '">' + ICON.edit + "</button>" +
        '<button class="icon del" type="button" data-act="h-del" aria-label="Delete ' + c.date + '">' + ICON.del + "</button></div></li>";
    }).join("") || '<li class="row"><span class="d muted">No check-ins yet</span></li>';
    more.hidden = rev.length <= 8;
    more.textContent = showAll ? "Show fewer" : "Show all " + rev.length + " check-ins";
    var ed = list.querySelector(".e-kg"); if (ed) ed.focus();
  }

  function logMsg(msg, err) { var m = $("logMsg"); if (m) { m.textContent = msg; m.className = "msg" + (err ? " err" : ""); } }

  function onLog(e) {
    e.preventDefault();
    var date = $("logDate").value, kg = toKg(num($("logKg").value));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) return logMsg("Pick a date that isn’t in the future.", true);
    if (!(kg >= 25 && kg <= 400)) return logMsg("Enter your weight in " + unit() + ".", true);
    var existed = store.checkins.some(function (c) { return c.date === date; });
    var prev = store.checkins.filter(function (c) { return c.date < date; }).pop();
    upsert(date, kg);
    save();
    renderProgress();
    toast((existed ? "Updated: " : "Logged ") + w(kg) + " " + unit() + (prev ? " (" + signed(kg - prev.kg) + " since " + shortDate(prev.date) + ")" : ""));
  }

  function historyAction(act, row) {
    var date = row.dataset.date;
    if (act === "h-edit") { editingDate = date; return renderHistory(); }
    if (act === "h-cancel") { editingDate = null; return renderHistory(); }
    if (act === "h-del") {
      if (store.checkins.length === 1) return toast("You need at least one check-in. Edit it instead.", true);
      if (!confirm("Delete the check-in for " + fmtDate(date, true) + "?")) return;
      store.checkins = store.checkins.filter(function (c) { return c.date !== date; });
      save(); renderProgress(); return toast("Check-in deleted");
    }
    if (act === "h-save") {
      var nd = row.querySelector(".e-date").value, kg = toKg(num(row.querySelector(".e-kg").value));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nd) || nd > today()) return toast("Pick a date that isn’t in the future.", true);
      if (!(kg >= 25 && kg <= 400)) return toast("Enter a valid weight.", true);
      if (nd !== date && store.checkins.some(function (c) { return c.date === nd; }) && !confirm("There’s already a check-in on " + fmtDate(nd) + ". Replace it?")) return;
      store.checkins = store.checkins.filter(function (c) { return c.date !== date; });
      upsert(nd, kg);
      editingDate = null;
      save(); renderProgress(); toast("Check-in updated");
    }
  }

  // ---------- plan ----------
  function renderPlan() {
    var p = store.profile, kg = latestKg(), L = latest(), c = compute(p, kg);
    var bmiPos = Math.max(0, Math.min(100, (c.bmi - 15) / (40 - 15) * 100));
    var seg_ = function (from, to, color) { return '<span style="width:' + ((to - from) / 25 * 100) + "%;background:" + color + '"></span>'; };
    var goalLeft = kg - p.target_weight_kg;
    var goalTitle = c.mode === "maintain" ? "Maintain " + w(p.target_weight_kg) + " " + unit() :
      (c.mode === "lose" ? "Lose " : "Gain ") + w(Math.abs(goalLeft)) + " " + unit() + " more";
    var weeksLeft = c.end ? Math.max(0, Math.ceil(daysBetween(today(), c.end) / 7)) : null;
    var rn = rateNote(p.weeks ? (p.start_weight_kg - p.target_weight_kg) / p.weeks : 0, p.start_weight_kg - p.target_weight_kg);
    var bfc = c.bf != null ? bfCat(c.bf, p.gender) : null;

    app.innerHTML = '<div class="view"><div class="grid-main">' +
      '<div class="card">' +
        '<p class="eyebrow">Daily target</p><div class="kcal">' + c.cal.toLocaleString() + "<small>kcal / day</small></div>" +
        '<p class="sub">Based on your latest weigh-in (' + w(kg) + " " + unit() + (L ? ", " + shortDate(L.date) : "") + "). It updates every time you log.</p>" +
        '<div class="minis">' +
          '<div class="snap"><span class="l">Maintenance</span><span class="v">' + c.tdee.toLocaleString() + '<small>kcal</small></span><span class="t">what you burn</span></div>' +
          '<div class="snap"><span class="l">' + (c.mode === "gain" ? "Surplus" : "Deficit") + '</span><span class="v">' + c.daily.toLocaleString() + '<small>kcal</small></span><span class="t">' + (c.floored ? "minimum " + c.floor.toLocaleString() + " applied" : "per day") + "</span></div>" +
          '<div class="snap"><span class="l">Rate</span><span class="v">' + (c.mode === "maintain" ? "0" : (c.mode === "lose" ? "−" : "+") + w(c.rate, null, 2)) + "<small>" + unit() + '/wk</small></span><span class="t">from your goal</span></div>' +
        "</div>" +
        '<p class="eyebrow">Macros</p>' +
        '<div class="macro-bar"><span style="width:' + c.pPct + "%;background:" + MACRO_COLORS.protein + '"></span><span style="width:' + c.cPct + "%;background:" + MACRO_COLORS.carbs + '"></span><span style="width:' + c.fPct + "%;background:" + MACRO_COLORS.fat + '"></span></div>' +
        '<div class="macros">' +
          macro("Protein", c.proteinG, c.pPct, MACRO_COLORS.protein) + macro("Carbs", c.carbG, c.cPct, MACRO_COLORS.carbs) + macro("Fat", c.fatG, c.fPct, MACRO_COLORS.fat) +
        "</div>" +
        '<p class="why">Protein is ' + (c.lbm != null ? "2.4g per kg of lean mass" : "2g per kg of body weight") + " to protect muscle" +
        (c.mode === "lose" ? " while in a deficit" : "") + ". Fat is at least 20% of calories for hormones and essential fatty acids. Carbs fill the rest for energy and training." +
        (c.lbm != null ? " Calories use the Katch-McArdle formula because your body fat is known." : " Calories use the Mifflin-St Jeor formula.") + "</p>" +
      "</div>" +
      '<div class="stack">' +
        '<div class="card"><p class="eyebrow">Health snapshot</p><div class="head" style="margin-bottom:0"><h2>BMI ' + c.bmi.toFixed(1) + '</h2><span class="badge ' + c.bmiCat[1] + '">' + c.bmiCat[0] + "</span></div>" +
          '<div class="scale"><div class="track">' + seg_(15, 18.5, "#cfe0fb") + seg_(18.5, 25, "#cfe8d6") + seg_(25, 30, "#fde7b0") + seg_(30, 40, "#f6c7c2") + "</div>" +
          '<span class="marker" style="left:' + bmiPos + '%"></span><div class="labels"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span></div></div>' +
          '<dl class="kv"><div><dt>Healthy weight</dt><dd>' + w(c.idealMin) + "–" + w(c.idealMax) + " " + unit() + "</dd></div>" +
          (c.bf != null ? '<div><dt>Body fat</dt><dd>' + c.bf.toFixed(1) + '% <span class="badge ' + bfc[1] + '">' + bfc[0] + "</span></dd></div>" +
            "<div><dt>Lean mass</dt><dd>" + w(c.lbm) + " " + unit() + "</dd></div><div><dt>Fat mass</dt><dd>" + w(c.fatMass) + " " + unit() + "</dd></div>"
            : '<div><dt>Body fat</dt><dd><button class="link" style="padding:0" type="button" data-act="tab" data-v="you">Add it for better targets</button></dd></div>') +
          "</dl></div>" +
        '<div class="card"><p class="eyebrow">Goal</p><h2>' + goalTitle + "</h2>" +
          '<dl class="kv"><div><dt>Goal weight</dt><dd>' + w(p.target_weight_kg) + " " + unit() + "</dd></div>" +
          "<div><dt>Started</dt><dd>" + w(p.start_weight_kg) + " " + unit() + " · " + shortDate(p.plan_start) + "</dd></div>" +
          (c.end ? "<div><dt>Target date</dt><dd>" + longDate(c.end) + (weeksLeft != null ? " · " + weeksLeft + " wk left" : "") + "</dd></div>" : "") +
          "</dl>" +
          '<div class="note ' + rn[0] + '" style="margin-top:12px">' + esc(rn[1]) + "</div>" +
          '<div class="actions" style="margin-top:16px"><button class="btn" type="button" data-act="tab" data-v="you">Change goal</button></div>' +
        "</div>" +
      "</div></div></div>";
  }
  function macro(l, g, pct, color) {
    return '<div class="macro"><span class="l"><i style="background:' + color + '"></i>' + l + '</span><span class="v">' + g + '<small>g</small></span><span class="l">' + pct + "% of calories</span></div>";
  }

  // ---------- food ----------
  function shopState() { try { return JSON.parse(localStorage.getItem(SHOP_KEY) || "{}"); } catch (e) { return {}; } }
  function renderFood() {
    var got = shopState();
    app.innerHTML = '<div class="view">' +
      '<div class="foods">' + FOODS.map(function (f) {
        return '<div class="card food"><h3><span class="emoji">' + f[0] + "</span>" + f[1] + '</h3><p class="sub">' + f[2] + "</p><ul>" +
          f[3].map(function (i) { return "<li>" + esc(i[0]) + "<span>" + esc(i[1]) + "</span></li>"; }).join("") + "</ul></div>";
      }).join("") + "</div>" +
      '<div class="card"><p class="eyebrow">Meal ideas</p><h2>Balanced meals that fit your macros</h2><div style="height:16px"></div><div class="meals">' +
        MEALS.map(function (m) {
          return '<div class="meal snap" style="padding:16px"><span class="l">' + m[0] + '</span><h3>' + esc(m[1]) + "</h3><p>" + esc(m[2]) + '</p><div class="chips">' +
            '<span class="pill">' + m[3] + 'g protein</span><span class="pill">' + m[4] + 'g carbs</span><span class="pill">' + m[5] + "g fat</span></div></div>";
        }).join("") + "</div></div>" +
      '<div class="card"><div class="head" style="margin-bottom:0"><div><p class="eyebrow">Shopping list</p><h2>This week’s basics</h2></div>' +
        '<button class="btn ghost" type="button" data-act="shop-clear">Untick all</button></div><div class="shop">' +
        SHOP.map(function (s) {
          return "<div><h3>" + s[0] + "</h3><ul>" + s[1].map(function (i) {
            return '<li><label><input type="checkbox" data-shop="' + esc(i) + '"' + (got[i] ? " checked" : "") + "><span>" + esc(i) + "</span></label></li>";
          }).join("") + "</ul></div>";
        }).join("") + "</div></div>" +
      "</div>";
  }

  // ---------- you ----------
  function renderYou() {
    var p = store.profile;
    if (!draft) { draft = draftFrom(p); youDirty = false; }
    var d = draft, kg = latestKg();
    var c = compute(Object.assign({}, p, statsFrom(d)), kg);
    app.innerHTML = '<div class="view">' +
      '<div class="grid-2">' +
        '<div class="card"><div class="head"><div><p class="eyebrow">About you</p><h2>Your stats</h2><p class="sub">Your weight comes from your check-ins.</p></div>' +
          seg("units", [["metric", "kg · cm"], ["imperial", "lbs · ft"]], d.units) + "</div>" + aboutFields(d, false) + "</div>" +
        '<div class="stack">' +
          '<div class="card"><p class="eyebrow">Goal</p><h2>Where you’re heading</h2><p class="sub">Changing your goal starts a new plan from today, at ' + w(kg, d.units) + " " + unit(d.units) + ".</p><div style=\"height:20px\"></div>" +
            goalFields(d, c.idealMid) + '<div id="goalPreview"></div></div>' +
          '<div class="card danger-zone"><div><p class="eyebrow">Your data</p><h3>' + {
            synced: "Synced to your account", device: "Saved in this browser only", error: "Not synced right now", signedout: "Signed out — not syncing",
          }[sync] + '</h3><p class="sub">' + store.checkins.length + " check-ins since " + (store.checkins[0] ? longDate(store.checkins[0].date) : "—") + ".</p></div>" +
            '<button class="btn danger" type="button" data-act="wipe">Delete all data</button></div>' +
        "</div>" +
      "</div>" +
      '<div class="savebar" id="savebar"' + (youDirty ? "" : " hidden") + '><span>Unsaved changes</span><span style="display:flex;gap:6px"><button class="btn ghost" type="button" data-act="discard">Discard</button><button class="btn" type="button" data-act="save-you">Save changes</button></span></div>' +
      "</div>";
    updateGoalPreview();
  }
  function markDirty() { if (tab === "you" && store.profile) { youDirty = true; var sb = $("savebar"); if (sb) sb.hidden = false; } }

  function saveYou() {
    var d = draft, e = Object.assign(validateAbout(d, false), validateGoal(d));
    if (!showErrors(e)) return;
    var p = store.profile, kg = latestKg();
    var tKg = toKg(num(d.target), d.units), wk = Math.round(num(d.weeks));
    var goalChanged = Math.abs(tKg - p.target_weight_kg) > 0.05 || wk !== p.weeks;
    store.profile = Object.assign({}, p, statsFrom(d), { target_weight_kg: tKg, weeks: wk });
    if (goalChanged) { store.profile.plan_start = today(); store.profile.start_weight_kg = kg; }
    save();
    youDirty = false;
    draft = null;
    toast(goalChanged ? "Saved — new plan starts today" : "Saved");
    render();
  }

  // ---------- events ----------
  app.addEventListener("input", function (e) {
    var k = e.target.dataset && e.target.dataset.k;
    if (k && draft) {
      draft[k] = e.target.value;
      var f = e.target.closest(".field"); if (f) f.classList.remove("error");
      if (k === "weeks") app.querySelectorAll('[data-act="weeks"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === e.target.value)); });
      if (k === "target" || k === "weeks" || tab === "you") updateGoalPreview();
      markDirty();
    }
    if (e.target.dataset && e.target.dataset.shop != null) {
      var s = shopState(); s[e.target.dataset.shop] = e.target.checked;
      try { localStorage.setItem(SHOP_KEY, JSON.stringify(s)); } catch (err) { /* ignore */ }
    }
  });
  app.addEventListener("change", function (e) {
    if (e.target.dataset && e.target.dataset.shop != null) {
      var s = shopState(); s[e.target.dataset.shop] = e.target.checked;
      try { localStorage.setItem(SHOP_KEY, JSON.stringify(s)); } catch (err) { /* ignore */ }
    }
  });
  app.addEventListener("submit", function (e) { if (e.target.id === "logForm") onLog(e); });
  app.addEventListener("keydown", function (e) {
    var row = e.target.closest && e.target.closest(".row.editing");
    if (row && e.key === "Enter") { e.preventDefault(); historyAction("h-save", row); }
    if (row && e.key === "Escape") { editingDate = null; renderHistory(); }
    var st = e.target.closest && e.target.closest('.stat[data-act="tab"]');
    if (st && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setTab(st.dataset.v); }
  });
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) { if (e.target.id === "moreBtn") { showAll = !showAll; renderHistory(); } return; }
    var act = b.dataset.act, v = b.dataset.v;
    if (act.indexOf("h-") === 0) return historyAction(act, b.closest(".row"));
    if (act === "tab") return setTab(v);
    if (act === "shop-clear") { try { localStorage.removeItem(SHOP_KEY); } catch (err) { /* ignore */ } return renderFood(); }
    if (act === "wipe") {
      if (!confirm("Delete your stats, goal and every check-in? This can’t be undone.")) return;
      store = { profile: null, checkins: [], updated: null };
      save(); draft = null; youDirty = false; step = 1; tab = "progress"; history.replaceState(null, "", location.pathname);
      toast("All data deleted"); return render();
    }
    if (act === "discard") { draft = null; youDirty = false; return renderYou(); }
    if (act === "save-you") return saveYou();
    if (!draft) return;
    if (act === "units") { setUnits(draft, v); markDirty(); return store.profile ? renderYou() : renderOnboarding(); }
    if (act === "gender") { draft.gender = v; markDirty(); return store.profile ? renderYou() : renderOnboarding(); }
    if (act === "activity") {
      draft.activity = +v; markDirty();
      app.querySelectorAll('[data-act="activity"]').forEach(function (o) { o.setAttribute("aria-checked", String(o === b)); });
      b.closest(".field").classList.remove("error");
      return updateGoalPreview();
    }
    if (act === "bf") { draft.bf = v; markDirty(); return store.profile ? renderYou() : renderOnboarding(); }
    if (act === "midpoint") {
      var mid = compute(Object.assign({ target_weight_kg: 70, weeks: 12 }, store.profile || {}, statsFrom(draft)), 70).idealMid;
      draft.target = w(mid, draft.units); $("f-target").value = draft.target; markDirty(); return updateGoalPreview();
    }
    if (act === "weeks") {
      draft.weeks = v; $("f-weeks").value = v; markDirty();
      app.querySelectorAll('[data-act="weeks"]').forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      return updateGoalPreview();
    }
    if (act === "next") { if (showErrors(validateAbout(draft, true))) { step = 2; renderOnboarding(); window.scrollTo({ top: 0, behavior: "smooth" }); } return; }
    if (act === "back") { step = 1; return renderOnboarding(); }
    if (act === "finish") return finishOnboarding();
  });

  $("tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-tab]"); if (b) setTab(b.dataset.tab); });
  window.addEventListener("hashchange", function () { var t = tabFromHash(); if (t && store.profile) setTab(t); });
  var resizeTimer;
  window.addEventListener("resize", function () {
    moveIndicator();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (store.profile && tab === "progress") renderChart(); }, 150);
  });
  window.addEventListener("beforeunload", function (e) { if (youDirty) { e.preventDefault(); e.returnValue = ""; } });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveIndicator);

  // ---------- start ----------
  (async function init() {
    await load();
    if (store.profile) showDashboard(); else render();
  })();
})();
