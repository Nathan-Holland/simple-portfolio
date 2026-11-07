// Shared check for the portfolio's site login (the cookie api/login.js sets and
// middleware.js checks). Files starting with "_" aren't deployed as routes.
const COOKIE_NAME = "site_auth";
const COOKIE_VALUE = "3f9a7d2c-nate-portfolio-2026";

export function isSignedIn(req) {
  const fromParsed = req.cookies && req.cookies[COOKIE_NAME];
  if (fromParsed) return fromParsed === COOKIE_VALUE;
  const header = (req.headers && req.headers.cookie) || "";
  const match = header.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"));
  return !!match && decodeURIComponent(match[1]) === COOKIE_VALUE;
}
