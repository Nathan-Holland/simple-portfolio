// Logins for nate-holland.com, shared by middleware.js and the /api functions.
// Files starting with "_" aren't deployed as routes.
//
// Two separate areas, each with its own password and cookie:
//
//   portfolio  SITE_PASSWORD     The portfolio (/, profile, timeline). Give this one
//                                to recruiters. Session cookie: asks again after the
//                                browser fully closes.
//   private    PRIVATE_PASSWORD  Only Nate: /home, the tools, admin, and their APIs.
//                                Remembered for 30 days. Also opens the portfolio.
//
// Set both in Vercel (Project → Settings → Environment Variables) for Production
// AND Preview. Nothing secret lives in this public repo: each cookie holds an HMAC
// of a fixed message keyed by that area's password, so it can't be forged without
// the password, and changing a password signs that area out everywhere. If a
// password isn't set, nobody can sign in to that area (fails closed).
//
// Uses Web Crypto so the same code runs in middleware and in Node functions.

export const REALMS = {
  portfolio: { env: "SITE_PASSWORD", cookie: "site_auth", message: "nate-holland-site-session-v1", maxAge: null },
  private: { env: "PRIVATE_PASSWORD", cookie: "private_auth", message: "nate-holland-private-session-v1", maxAge: 60 * 60 * 24 * 30 },
};

// Paths that need the private password (everything else in the middleware matcher is portfolio)
export const PRIVATE_PREFIXES = ["/home", "/weight", "/budget", "/spanish", "/wedding", "/bookmarks", "/admin.html"];

export function realmForPath(pathname) {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) ? "private" : "portfolio";
}

function password(realm) {
  // Trimmed so a stray space or newline pasted into the Vercel setting doesn't lock you out
  return (process.env[REALMS[realm].env] || "").trim();
}

export function passwordConfigured(realm) {
  return password(realm).length > 0;
}

async function hmacHex(key, message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two strings
function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function token(realm) {
  const p = password(realm);
  return p ? hmacHex(p, REALMS[realm].message) : null;
}

export function checkPassword(realm, attempt) {
  const p = password(realm);
  return !!p && typeof attempt === "string" && safeEqual(attempt.trim(), p);
}

export async function sessionCookie(realm) {
  const r = REALMS[realm];
  return `${r.cookie}=${await token(realm)}; Path=/; HttpOnly; Secure; SameSite=Lax` + (r.maxAge ? `; Max-Age=${r.maxAge}` : "");
}

function readCookie(req, name) {
  const parsed = req && req.cookies && req.cookies[name];
  if (parsed) return parsed;
  const h = req && req.headers;
  const header = h && typeof h.get === "function" ? h.get("cookie") : h && h.cookie;
  const match = String(header || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

async function hasValidCookie(req, realm) {
  const t = await token(realm);
  const v = readCookie(req, REALMS[realm].cookie);
  return !!t && !!v && safeEqual(v, t);
}

/** Nate's private area (/home, tools, admin and their APIs). Accepts a Node req or a Fetch Request. */
export function isPrivate(req) {
  return hasValidCookie(req, "private");
}

/** The portfolio: open to the portfolio password, and to Nate's private login. */
export async function canSeePortfolio(req) {
  return (await hasValidCookie(req, "portfolio")) || (await hasValidCookie(req, "private"));
}

/** Whether a request may see the given realm. */
export function allowed(req, realm) {
  return realm === "private" ? isPrivate(req) : canSeePortfolio(req);
}
