// GET  /api/weight — WeightWise profile, weekly check-ins and daily calories (private login required)
// PUT  /api/weight — replace the profile and check-ins (private login required)
// POST /api/weight — daily calories from the Apple Health Shortcut (Bearer CALORIES_KEY); see _calories.js
//
// Calories are written only by POST (the Apple Health shortcut), so a
// PUT from the app keeps whatever calories are already saved — an open tab with
// older data can never wipe out a day the shortcut sent in the meantime.
import { isPrivate } from "./_site-auth.js";
import { readData, writeData, DATE_RE } from "./_weight-store.js";
import { handleCalories } from "./_calories.js";

function cleanCheckins(raw) {
  if (!Array.isArray(raw)) return null;
  const byDate = new Map();
  for (const c of raw) {
    if (!c || !DATE_RE.test(c.date)) return null;
    const kg = Number(c.kg);
    if (!Number.isFinite(kg) || kg < 20 || kg > 400) return null;
    byDate.set(c.date, { date: c.date, kg: Math.round(kg * 100) / 100 });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const failed = (res, verb, err) =>
  res.status((err && err.status) || 500).json({ error: verb + " failed: " + (err && err.message ? err.message : "unknown error") });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // The Shortcut authenticates with its own key, so this comes before the login check
  if (req.method === "POST") return handleCalories(req, res);

  if (!(await isPrivate(req))) {
    res.status(401).json({ error: "Sign in with your private password first" });
    return;
  }

  if (req.method === "GET") {
    try {
      res.status(200).json({ data: await readData() });
    } catch (err) {
      failed(res, "Load", err);
    }
    return;
  }

  if (req.method === "PUT") {
    const body = req.body || {};
    const checkins = cleanCheckins(body.checkins);
    const profile = body.profile && typeof body.profile === "object" && !Array.isArray(body.profile) ? body.profile : null;
    if (!checkins) {
      res.status(400).json({ error: "Expected { profile, checkins: [{ date: 'YYYY-MM-DD', kg }] }" });
      return;
    }
    try {
      const existing = await readData();
      // "Delete all data" sends no profile and no check-ins: clear calories too
      const calories = !profile && !checkins.length ? {} : (existing && existing.calories) || {};
      const updated = await writeData({ profile, checkins, calories });
      res.status(200).json({ ok: true, updated, calories });
    } catch (err) {
      failed(res, "Save", err);
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
