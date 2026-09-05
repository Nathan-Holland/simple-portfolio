// Vercel Function (Node.js runtime): the only place the real password is
// compared. It's never shipped to the browser — login.html just POSTs
// whatever was typed and reads back ok:true/false. On success it sets an
// HttpOnly cookie (unreadable from page JS/dev tools) that middleware.js
// checks on every request to index.html/profile.html.
//
// Uses the classic (req, res) handler signature, not Request/Response —
// that Fetch-style signature is Edge-runtime-only. Returning a Response
// object here (as an earlier version did) is silently ignored by the
// Node.js runtime, so the request just hangs until it times out.
const PASSWORD = "NatePortfolio_2026";
const COOKIE_NAME = "site_auth";
const COOKIE_VALUE = "3f9a7d2c-nate-portfolio-2026";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const password = req.body && typeof req.body.password === "string" ? req.body.password : "";

  if (password !== PASSWORD) {
    res.status(401).json({ ok: false });
    return;
  }

  // No Max-Age/Expires: a session cookie, cleared when the browser fully
  // closes, per the "ask again each new session, not every click" choice.
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
  res.status(200).json({ ok: true });
}
