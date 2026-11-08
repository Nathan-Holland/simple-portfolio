// GET  /api/wishlist/items          — public: the list, for anyone viewing /wishlist
// PUT  /api/wishlist/items          — editor only: replaces the whole list
// GET  /api/wishlist/items?savings  — editor only: the monthly savings log for the Savings tab
// PUT  /api/wishlist/items?savings  — editor only: replaces it ({ entries: [{ month, amount }] })
// (Savings share this function to stay within the Vercel Hobby plan's 12-function limit.)
import { isEditor, readItems, writeItems } from "./_lib.js";
import { DOCS, readDoc, writeDoc } from "../_store.js";

async function savings(req, res) {
  if (!isEditor(req)) {
    res.status(401).json({ error: "Sign in to see savings" });
    return;
  }
  try {
    if (req.method === "GET") {
      res.status(200).json({ data: await readDoc("wishlistSavings") });
      return;
    }
    if (req.method === "PUT") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = null; }
      }
      const fields = DOCS.wishlistSavings.clean(body || {});
      if (typeof fields === "string") {
        res.status(400).json({ error: fields });
        return;
      }
      res.status(200).json({ ok: true, updated: await writeDoc("wishlistSavings", fields) });
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status((err && err.status) || 500).json({ error: "Savings failed: " + (err && err.message ? err.message : "unknown error") });
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const params = new URL(req.url || "/", "http://x").searchParams;
  if (params.has("savings") || (req.query && "savings" in req.query)) return savings(req, res);

  if (req.method === "GET") {
    res.status(200).json(await readItems());
    return;
  }

  if (req.method === "PUT") {
    if (!isEditor(req)) {
      res.status(401).json({ error: "Sign in to edit" });
      return;
    }
    const items = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: "Expected an array" });
      return;
    }
    try {
      const updated = await writeItems(items);
      res.status(200).json({ ok: true, count: items.length, updated });
    } catch (err) {
      res.status(500).json({ error: "Save failed: " + (err && err.message ? err.message : "unknown error") });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
