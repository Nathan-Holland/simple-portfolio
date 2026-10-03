// GET  /api/wishlist/items  — public: the list, for anyone viewing /wishlist
// PUT  /api/wishlist/items  — editor only: replaces the whole list
import { isEditor, readItems, writeItems } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

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
