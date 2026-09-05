// Vercel Edge Function: the only place the real password is compared. It's
// never shipped to the browser — login.html just POSTs whatever was typed
// and reads back ok:true/false. On success it sets an HttpOnly cookie
// (unreadable from page JS/dev tools) that middleware.js checks on every
// request to index.html/profile.html.
export const config = { runtime: "edge" };

const PASSWORD = "NatePortfolio_2026";
const COOKIE_NAME = "site_auth";
const COOKIE_VALUE = "3f9a7d2c-nate-portfolio-2026";

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let password = "";
  try {
    const body = await request.json();
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (password !== PASSWORD) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // No Max-Age/Expires: a session cookie, cleared when the browser fully
  // closes, per the "ask again each new session, not every click" choice.
  const response = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
  return response;
}
