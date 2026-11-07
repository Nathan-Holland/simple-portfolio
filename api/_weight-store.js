// WeightWise storage, shared by /api/weight (the app) and /api/calories (the
// Apple Health shortcut). Files starting with "_" aren't deployed as routes.
//
// One JSON document in Vercel Blob (same store as the wishlist):
//   { profile, checkins: [{ date, kg }], calories: { "YYYY-MM-DD": kcal }, updated }
// Blob URLs are public, so each save gets a random suffix: the address can't be
// guessed, and only these functions (which have the store token) can list it.
// Older copies are deleted after every save.
import { put, list, del } from "@vercel/blob";

const PREFIX = "private/weightwise/data";
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEEP_CALORIE_DAYS = 400;

async function savedBlobs() {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

/** The saved document, or null if nothing has been saved yet. */
export async function readData() {
  const blobs = await savedBlobs();
  if (!blobs.length) return null;
  const r = await fetch(blobs[0].url, { cache: "no-store" });
  if (!r.ok) throw new Error("Blob read failed (" + r.status + ")");
  return r.json();
}

/** Only well-formed { date: kcal } pairs, newest KEEP_CALORIE_DAYS kept. */
export function cleanCalories(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const days = Object.keys(raw)
    .filter((d) => DATE_RE.test(d) && Number.isFinite(+raw[d]) && +raw[d] >= 0 && +raw[d] <= 20000)
    .sort()
    .slice(-KEEP_CALORIE_DAYS);
  const out = {};
  for (const d of days) out[d] = Math.round(+raw[d]);
  return out;
}

/** Saves the whole document and returns its `updated` timestamp. */
export async function writeData(data) {
  const doc = {
    profile: data.profile || null,
    checkins: data.checkins || [],
    calories: cleanCalories(data.calories),
    updated: new Date().toISOString(),
  };
  const json = JSON.stringify(doc);
  if (json.length > 400_000) throw Object.assign(new Error("Too much data"), { status: 413 });
  const saved = await put(PREFIX + ".json", json, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
    cacheControlMaxAge: 60,
  });
  const old = (await savedBlobs()).filter((b) => b.url !== saved.url).map((b) => b.url);
  if (old.length) await del(old);
  return doc.updated;
}
