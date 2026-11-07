// POST /api/calories — daily calories from Apple Health, sent by an iPhone Shortcut.
//
// Auth: header  Authorization: Bearer <CALORIES_KEY>
// (CALORIES_KEY is a Vercel environment variable, Secret type, Production and
// Preview). The private site login also works, for testing from a browser.
//
// Body (JSON), any of:
//   { "kcal": 2140 }                                → today (Barcelona time)
//   { "date": "2026-11-07", "kcal": "2,140 kcal" }  → numbers are read out of text
//   { "entries": [{ "date": "...", "kcal": ... }] } → several days at once
// Add "unit": "kJ" if Health is set to kilojoules. Sending a day again replaces it.
import { isPrivate } from "./_site-auth.js";
import { readData, writeData, DATE_RE } from "./_weight-store.js";

function keyOk(req) {
  const key = (process.env.CALORIES_KEY || "").trim();
  const header = String((req.headers && req.headers.authorization) || "");
  const given = header.replace(/^Bearer\s+/i, "").trim();
  if (!key || !given || given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function todayInSpain() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// "2,140.5 kcal" → 2140.5 ; "8 950 kJ" → 2139 (with kJ) ; 2140 → 2140
function toKcal(value, unit) {
  const text = String(value == null ? "" : value);
  const n = parseFloat(text.replace(/(\d)[,\s](?=\d{3}\b)/g, "$1").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const kj = /kj/i.test(text) || /kj/i.test(String(unit || ""));
  return kj ? n / 4.184 : n;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  if (!keyOk(req) && !(await isPrivate(req))) {
    res.status(401).json({ error: process.env.CALORIES_KEY ? "Wrong or missing key" : "CALORIES_KEY isn't set for this deployment" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const raw = Array.isArray(body.entries) ? body.entries : [body];
  const entries = [];
  for (const e of raw) {
    const date = e && e.date ? String(e.date).slice(0, 10) : todayInSpain();
    const kcal = toKcal(e && e.kcal, (e && e.unit) || body.unit);
    if (!DATE_RE.test(date) || kcal == null || kcal < 0 || kcal > 20000) {
      res.status(400).json({ error: "Expected { date: 'YYYY-MM-DD', kcal: number }", got: e });
      return;
    }
    entries.push({ date, kcal: Math.round(kcal) });
  }

  try {
    const data = (await readData()) || { profile: null, checkins: [], calories: {} };
    const calories = { ...(data.calories || {}) };
    for (const e of entries) calories[e.date] = e.kcal;
    await writeData({ ...data, calories });
    res.status(200).json({ ok: true, saved: entries });
  } catch (err) {
    res.status((err && err.status) || 500).json({ error: "Save failed: " + (err && err.message ? err.message : "unknown error") });
  }
}
