// GET /api/store?doc=weight|wedding — load a private document (private login required)
// PUT /api/store?doc=weight|wedding — replace it
//
// One function for every tool's saved data, so the deployment stays within the
// Vercel Hobby plan's 12-function limit. Documents and their checks: api/_store.js.
import { isPrivate } from "./_site-auth.js";
import { DOCS, readDoc, writeDoc } from "./_store.js";

const failed = (res, verb, err) =>
  res.status((err && err.status) || 500).json({ error: verb + " failed: " + (err && err.message ? err.message : "unknown error") });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!(await isPrivate(req))) {
    res.status(401).json({ error: "Sign in with your private password first" });
    return;
  }

  const name = String((req.query && req.query.doc) || new URL(req.url, "http://x").searchParams.get("doc") || "");
  if (!Object.prototype.hasOwnProperty.call(DOCS, name)) {
    res.status(404).json({ error: "Unknown document. Use ?doc=" + Object.keys(DOCS).join(" or ?doc=") });
    return;
  }

  if (req.method === "GET") {
    try {
      res.status(200).json({ data: await readDoc(name) });
    } catch (err) {
      failed(res, "Load", err);
    }
    return;
  }

  if (req.method === "PUT") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    const fields = DOCS[name].clean(body || {});
    if (typeof fields === "string") {
      res.status(400).json({ error: fields });
      return;
    }
    try {
      res.status(200).json({ ok: true, updated: await writeDoc(name, fields) });
    } catch (err) {
      failed(res, "Save", err);
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
