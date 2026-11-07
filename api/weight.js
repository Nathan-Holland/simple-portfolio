// GET /api/weight — WeightWise profile + weekly check-ins (site login required)
// PUT /api/weight — replace them
//
// Stored in Vercel Blob (same store as the wishlist). Blob URLs are public, so
// each save gets a random suffix: the address can't be guessed, and only this
// function (which has the store token) can list it. Older copies are deleted
// after every save.
import { put, list, del } from "@vercel/blob";
import { isPrivate } from "./_site-auth.js";

const PREFIX = "private/weightwise/data";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function savedBlobs() {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!(await isPrivate(req))) {
    res.status(401).json({ error: "Sign in with your private password first" });
    return;
  }

  if (req.method === "GET") {
    try {
      const blobs = await savedBlobs();
      if (!blobs.length) {
        res.status(200).json({ data: null });
        return;
      }
      const r = await fetch(blobs[0].url, { cache: "no-store" });
      if (!r.ok) throw new Error("Blob read failed (" + r.status + ")");
      res.status(200).json({ data: await r.json() });
    } catch (err) {
      res.status(500).json({ error: "Load failed: " + (err && err.message ? err.message : "unknown error") });
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
    const json = JSON.stringify({ profile, checkins, updated: new Date().toISOString() });
    if (json.length > 200_000) {
      res.status(413).json({ error: "Too much data" });
      return;
    }
    try {
      const saved = await put(PREFIX + ".json", json, {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: true,
        cacheControlMaxAge: 60,
      });
      const old = (await savedBlobs()).filter((b) => b.url !== saved.url).map((b) => b.url);
      if (old.length) await del(old);
      res.status(200).json({ ok: true, updated: JSON.parse(json).updated });
    } catch (err) {
      res.status(500).json({ error: "Save failed: " + (err && err.message ? err.message : "unknown error") });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
