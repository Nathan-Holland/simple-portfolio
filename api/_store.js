// Private JSON documents in Vercel Blob (same store as the wishlist), used by
// /api/store. Files starting with "_" aren't deployed as routes.
//
// Blob URLs are public, so each save gets a random suffix: the address can't be
// guessed, and only these functions (which have the store token) can list it.
// Older copies are deleted after every save.
import { put, list, del } from "@vercel/blob";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Each document: where it lives in Blob, and how a PUT body is checked and cleaned.
// clean() returns the fields to store, or a string describing what's wrong.
export const DOCS = {
  // WeightWise: { profile, checkins: [{ date, kg }] }
  weight: {
    prefix: "private/weightwise/data", // unchanged, so existing data keeps loading
    clean(body) {
      if (!Array.isArray(body.checkins)) return "Expected { profile, checkins: [{ date: 'YYYY-MM-DD', kg }] }";
      const byDate = new Map();
      for (const c of body.checkins) {
        const kg = Number(c && c.kg);
        if (!c || !DATE_RE.test(c.date) || !Number.isFinite(kg) || kg < 20 || kg > 400) return "Bad check-in: " + JSON.stringify(c);
        byDate.set(c.date, { date: c.date, kg: Math.round(kg * 100) / 100 });
      }
      const profile = body.profile && typeof body.profile === "object" && !Array.isArray(body.profile) ? body.profile : null;
      return { profile, checkins: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
    },
  },
  // Wedding guest list: { guests: [{ id, first, last, side, priority, relation, email, address,
  //   plusOnes: [{ id, first, last, relation, email, address, sameAddress }], children, childrenNote }] }
  wedding: {
    prefix: "private/wedding/data",
    clean(body) {
      if (!Array.isArray(body.guests) || body.guests.length > 2000) return "Expected { guests: [...] }";
      const guests = [];
      for (const g of body.guests) {
        if (!g || typeof g !== "object") return "Bad guest";
        const first = str(g.first, 80);
        if (!first) return "Every guest needs a first name";
        guests.push({
          id: Number.isFinite(+g.id) ? +g.id : Date.now() + guests.length,
          first,
          last: str(g.last, 80),
          side: g.side === "bride" ? "bride" : "groom",
          priority: ["1", "2", "3"].includes(String(g.priority)) ? String(g.priority) : "1",
          relation: str(g.relation, 120),
          email: str(g.email, 200),
          address: str(g.address, 500),
          // +1s get the same details as a guest; side and priority follow the guest who brings them
          plusOnes: (Array.isArray(g.plusOnes) ? g.plusOnes : []).slice(0, 10).filter((p) => p && str(p.first, 80)).map((p, i) => ({
            id: Number.isFinite(+p.id) ? +p.id : Date.now() + i,
            first: str(p.first, 80),
            last: str(p.last, 80),
            relation: str(p.relation, 120),
            email: str(p.email, 200),
            address: p.sameAddress ? "" : str(p.address, 500),
            sameAddress: !!p.sameAddress,
          })),
          children: Math.max(0, Math.min(20, Math.round(+g.children) || 0)),
          childrenNote: str(g.childrenNote, 300),
        });
      }
      return { guests };
    },
  },
};

async function savedBlobs(prefix) {
  const { blobs } = await list({ prefix });
  return blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

/** The saved document, or null if nothing has been saved yet. */
export async function readDoc(name) {
  const blobs = await savedBlobs(DOCS[name].prefix);
  if (!blobs.length) return null;
  const r = await fetch(blobs[0].url, { cache: "no-store" });
  if (!r.ok) throw new Error("Blob read failed (" + r.status + ")");
  return r.json();
}

/** Saves already-cleaned fields and returns the `updated` timestamp. */
export async function writeDoc(name, fields) {
  const doc = { ...fields, updated: new Date().toISOString() };
  const json = JSON.stringify(doc);
  if (json.length > 1_000_000) throw Object.assign(new Error("Too much data"), { status: 413 });
  const { prefix } = DOCS[name];
  const saved = await put(prefix + ".json", json, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
    cacheControlMaxAge: 60,
  });
  const old = (await savedBlobs(prefix)).filter((b) => b.url !== saved.url).map((b) => b.url);
  if (old.length) await del(old);
  return doc.updated;
}
