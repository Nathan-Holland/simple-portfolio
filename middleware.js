// Vercel Edge Middleware: runs before the protected pages are ever sent
// to the browser. Without a valid session cookie (set only by /api/login
// after the right password is POSTed), the request is redirected to
// login.html instead — so there is no real content to view-source, unlike
// a client-side-only password check.
//
// Two areas (see api/_site-auth.js): the portfolio pages take the portfolio
// password you give recruiters; /home, the tools and admin take only the
// private password.
import { allowed, realmForPath } from "./api/_site-auth.js";

export const config = {
  runtime: "nodejs",
  matcher: [
    "/", "/index.html", "/profile.html", "/admin.html", "/timeline.html",
    // Private: start page, personal tools, admin
    "/home", "/home/:path*",
    "/weight", "/weight/:path*",
    "/budget", "/budget/:path*",
    "/wedding", "/wedding/:path*",
    "/spanish", "/spanish/:path*",
    "/bookmarks", "/bookmarks/:path*",
  ],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const realm = realmForPath(url.pathname);
  if (await allowed(request, realm)) {
    return;
  }
  const next = url.pathname + url.search;
  url.pathname = "/login.html";
  url.search = "?next=" + encodeURIComponent(next) + (realm === "private" ? "&area=private" : "");
  return Response.redirect(url, 302);
}
