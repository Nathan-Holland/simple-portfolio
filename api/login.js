// Vercel Function (Node.js runtime): the only place passwords are compared.
// They're never shipped to the browser — login.html just POSTs whatever was
// typed (plus which area it's for) and reads back ok:true/false. On success it
// sets an HttpOnly cookie (unreadable from page JS/dev tools) that
// middleware.js checks on every request to the protected pages.
//
// Two areas, each with its own password (see api/_site-auth.js):
//   realm "portfolio" → SITE_PASSWORD (also accepts the private password)
//   realm "private"   → PRIVATE_PASSWORD only
//
// Uses the classic (req, res) handler signature, not Request/Response —
// that Fetch-style signature is Edge-runtime-only.
import { checkPassword, passwordConfigured, sessionCookie, isPrivate, canSeePortfolio } from "./_site-auth.js";

export default async function handler(req, res) {
  // GET /api/login: a status check for troubleshooting. Says whether this
  // deployment can see each password and whether this browser is signed in —
  // never the passwords themselves.
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      portfolio: { passwordSet: passwordConfigured("portfolio"), signedIn: await canSeePortfolio(req) },
      private: { passwordSet: passwordConfigured("private"), signedIn: await isPrivate(req) },
      environment: process.env.VERCEL_ENV || "unknown",
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const body = req.body || {};
  const realm = body.realm === "private" ? "private" : "portfolio";
  const password = typeof body.password === "string" ? body.password : "";

  if (!passwordConfigured(realm)) {
    res.status(503).json({ ok: false, error: `${realm === "private" ? "PRIVATE_PASSWORD" : "SITE_PASSWORD"} isn't set for this deployment` });
    return;
  }

  let granted;
  if (passwordConfigured("private") && checkPassword("private", password)) {
    // Nate's own password works on either login page and opens both areas
    granted = "private";
  } else if (realm === "portfolio" && checkPassword("portfolio", password)) {
    granted = "portfolio";
  } else {
    res.status(401).json({ ok: false });
    return;
  }

  const cookies = [await sessionCookie(granted)];
  if (granted === "private" && passwordConfigured("portfolio")) cookies.push(await sessionCookie("portfolio"));
  res.setHeader("Set-Cookie", cookies);
  res.status(200).json({ ok: true, realm: granted });
}
