// POST /api/wishlist/login  {password} — unlocks editing in this browser.
// The password lives only in the WISHLIST_PASSWORD env var; it's never sent to the page.
import { checkPassword, passwordConfigured, sessionCookie } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }
  if (!passwordConfigured()) {
    // Tell the page plainly instead of pretending the password was wrong.
    res.status(503).json({ ok: false, error: "not-configured" });
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
