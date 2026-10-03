// POST /api/wishlist/login  {password} — unlocks editing in this browser.
// The password lives only in the WISHLIST_PASSWORD env var; it's never sent to the page.
import { checkPassword, sessionCookie } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }
  const password = req.body && req.body.password;
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600)); // slows down guessing
    res.status(401).json({ ok: false });
    return;
  }
  res.setHeader("Set-Cookie", sessionCookie());
  res.status(200).json({ ok: true });
}
