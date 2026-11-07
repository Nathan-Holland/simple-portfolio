// Site login, shared by middleware.js and the /api functions. Files starting
// with "_" aren't deployed as routes.
//
// The password is read from the SITE_PASSWORD environment variable — set it in
// Vercel (Project → Settings → Environment Variables) for Production AND
// Preview. Nothing secret lives in this public repo:
//   - the login cookie holds an HMAC of a fixed message keyed by the password,
//     so it can be checked without storing sessions, can't be forged without
//     the password, and changing the password signs everyone out;
//   - if SITE_PASSWORD isn't set, nobody can sign in (fails closed).
//
// Uses Web Crypto so the same code runs in middleware and in Node functions.

export const COOKIE_NAME = "site_auth";
const MESSAGE = "nate-holland-site-session-v1";

function password() {
  // Trimmed so a stray space or newline pasted into the Vercel setting doesn't lock you out
  return (process.env.SITE_PASSWORD || "").trim();
}

export function passwordConfigured() {
  return password().length > 0;
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

/** The cookie value for a signed-in browser, or null if no password is configured. */
export async function sessionToken() {
  const p = password();
  return p ? hmacHex(p, MESSAGE) : null;
}

export function checkPassword(attempt) {
  const p = password();
  return !!p && typeof attempt === "string" && safeEqual(attempt.trim(), p);
}

/** Session cookie (no Max-Age: cleared when the browser fully closes). */
export async function sessionCookie() {
  return `${COOKIE_NAME}=${await sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** Reads the cookie from a cookie header string. */
export function cookieFrom(header) {
  const match = String(header || "").match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

/** True when the request carries a valid login cookie. Accepts a Node req or a Fetch Request. */
export async function isSignedIn(req) {
  const token = await sessionToken();
  if (!token) return false;
  let value = req && req.cookies && req.cookies[COOKIE_NAME];
  if (!value) {
    const h = req && req.headers;
    value = cookieFrom(h && typeof h.get === "function" ? h.get("cookie") : h && h.cookie);
  }
  return !!value && safeEqual(value, token);
}
