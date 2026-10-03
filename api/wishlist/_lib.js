// Shared helpers for the /wishlist API. Files starting with "_" are not
// deployed as routes, so this is only importable by the functions beside it.
//
// Editing is gated by its own password (separate from the portfolio login),
// read from the WISHLIST_PASSWORD environment variable — set it in the Vercel
// dashboard (Project → Settings → Environment Variables). If it's missing,
// nobody can edit; the list is still viewable.
//
// Uses the classic (req, res) handler signature like the rest of /api.
import { createHmac, timingSafeEqual } from "node:crypto";
import { put, list } from "@vercel/blob";
import { SEED_ITEMS } from "./_seed.js";

export const COOKIE_NAME = "wishlist_auth";
const BLOB_PATH = "data/wishlist.json";

// The session cookie holds an HMAC of a fixed message keyed by the password,
// so it can be checked without storing sessions, and changing the password
// signs every existing session out.
function sessionToken() {
  const password = process.env.WISHLIST_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update("wishlist-editor-v1").digest("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(attempt) {
  const password = process.env.WISHLIST_PASSWORD;
  return !!password && typeof attempt === "string" && safeEqual(attempt, password);
}

export function isEditor(req) {
  const token = sessionToken();
  const cookie = req.cookies && req.cookies[COOKIE_NAME];
  return !!token && !!cookie && safeEqual(cookie, token);
}

export function sessionCookie() {
  // 30 days; HttpOnly so page scripts can't read it.
  return `${COOKIE_NAME}=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function readItems() {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    if (blobs.length) {
      // Cache-bust: Blob's CDN can briefly serve the previous version after an overwrite.
      const res = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) return { items: data.items, updated: data.updated || blobs[0].uploadedAt };
      }
    }
  } catch {
    // fall through to the seed
  }
  return { items: SEED_ITEMS, updated: null };
}

export async function writeItems(items) {
  const updated = new Date().toISOString();
  await put(BLOB_PATH, JSON.stringify({ items, updated }), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  return updated;
}
