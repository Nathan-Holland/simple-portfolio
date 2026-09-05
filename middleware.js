// Vercel Edge Middleware: runs before index.html/profile.html are ever sent
// to the browser. Without a valid session cookie (set only by /api/login
// after the right password is POSTed), the request is redirected to
// login.html instead — so there is no real content to view-source, unlike
// a client-side-only password check.
export const config = {
  matcher: ["/", "/index.html", "/profile.html", "/admin.html"],
};

const COOKIE_NAME = "site_auth";
const COOKIE_VALUE = "3f9a7d2c-nate-portfolio-2026";

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function middleware(request) {
  if (getCookie(request, COOKIE_NAME) === COOKIE_VALUE) {
    return;
  }
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  url.pathname = "/login.html";
  url.search = "?next=" + encodeURIComponent(next);
  return Response.redirect(url, 302);
}
