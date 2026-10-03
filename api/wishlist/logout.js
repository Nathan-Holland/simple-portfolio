// POST /api/wishlist/logout — locks editing again in this browser.
import { clearedCookie } from "./_lib.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }
  res.setHeader("Set-Cookie", clearedCookie());
  res.status(200).json({ ok: true });
}
