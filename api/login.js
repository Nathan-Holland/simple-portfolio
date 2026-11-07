// Vercel Function (Node.js runtime): the only place the password is compared.
// It's never shipped to the browser — login.html just POSTs whatever was typed
// and reads back ok:true/false. On success it sets an HttpOnly cookie
// (unreadable from page JS/dev tools) that middleware.js checks on every
// request to the protected pages.
//
// The password comes from the SITE_PASSWORD environment variable (see
// api/_site-auth.js); it is not stored in this repo.
//
// Uses the classic (req, res) handler signature, not Request/Response —
// that Fetch-style signature is Edge-runtime-only. Returning a Response
// object here (as an earlier version did) is silently ignored by the
// Node.js runtime, so the request just hangs until it times out.
import { checkPassword, passwordConfigured, sessionCookie, isSignedIn } from "./_site-auth.js";

export default async function handler(req, res) {
  // GET /api/login: a status check for troubleshooting. Says whether this
  // deployment can see SITE_PASSWORD and whether this browser is signed in —
  // never the password itself.
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      passwordSet: passwordConfigured(),
      signedIn: await isSignedIn(req),
      hasCookie: /(?:^|;\s*)site_auth=/.test(req.headers.cookie || ""),
      environment: process.env.VERCEL_ENV || "unknown",
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  if (!passwordConfigured()) {
    res.status(503).json({ ok: false, error: "SITE_PASSWORD isn't set for this deployment" });
    return;
  }

  const password = req.body && typeof req.body.password === "string" ? req.body.password : "";

  if (!checkPassword(password)) {
    res.status(401).json({ ok: false });
    return;
  }

  // No Max-Age/Expires: a session cookie, cleared when the browser fully
  // closes, per the "ask again each new session, not every click" choice.
  res.setHeader("Set-Cookie", await sessionCookie());
  res.status(200).json({ ok: true });
}
