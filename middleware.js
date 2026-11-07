// Vercel Edge Middleware: runs before the protected pages are ever sent
// to the browser. Without a valid session cookie (set only by /api/login
// after the right password is POSTed), the request is redirected to
// login.html instead — so there is no real content to view-source, unlike
// a client-side-only password check. See api/_site-auth.js.
import { isSignedIn } from "./api/_site-auth.js";

export const config = {
  runtime: "nodejs",
  matcher: [
    "/", "/index.html", "/profile.html", "/admin.html", "/timeline.html",
    // Personal tools + browser start page
    "/home", "/home/:path*",
    "/weight", "/weight/:path*",
    "/budget", "/budget/:path*",
    "/wedding", "/wedding/:path*",
    "/spanish", "/spanish/:path*",
  ],
};

export default async function middleware(request) {
  if (await isSignedIn(request)) {
    return;
  }
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  url.pathname = "/login.html";
  url.search = "?next=" + encodeURIComponent(next);
  return Response.redirect(url, 302);
}
