// GET /api/wishlist/img?url=… — serves a product image from this origin so the
// page can read its pixels (to tint each tile to the photo's edge colour).
// Only images already on the wishlist are proxied for visitors, so this can't be
// used as a general-purpose proxy; signed-in editors can proxy any image.
// Responses are cached on Vercel's CDN for a week.
import { isEditor, readItems } from "./_lib.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_BYTES = 15_000_000;

export default async function handler(req, res) {
  const url = String(req.query.url || "");
  let uri;
  try { uri = new URL(url); } catch { uri = null; }
  if (!uri || !/^https?:$/.test(uri.protocol)) {
    res.status(400).json({ error: "Bad image URL" });
    return;
  }

  if (!isEditor(req)) {
    const { items } = await readItems();
    if (!items.some((i) => i && i.image === url)) {
      res.status(403).json({ error: "Not a wishlist image" });
      return;
    }
  }

  try {
    const upstream = await fetch(uri, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
    });
    const type = upstream.headers.get("content-type") || "";
    const length = Number(upstream.headers.get("content-length") || 0);
    if (!upstream.ok || !type.startsWith("image/") || length > MAX_BYTES) throw new Error("bad upstream");
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > MAX_BYTES) throw new Error("too large");
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=604800, immutable");
    res.status(200).send(body);
  } catch {
    res.status(502).json({ error: "Couldn't load image" });
  }
}
