// Vercel Edge Function: the single source of truth for project data, read
// by the homepage/modal (GET, public — it's just portfolio content) and
// written by admin.html (POST, requires the same session cookie as the
// rest of the site). Stored as a JSON file in Vercel Blob (not Vercel KV —
// that product is deprecated, and its client pulled in Node-only modules
// that broke the Edge Middleware build). Falls back to a seed matching the
// original hand-written homepage so the site still renders correctly
// before the admin page has ever saved anything.
import { put, list } from "@vercel/blob";

export const config = { runtime: "edge" };

const COOKIE_NAME = "site_auth";
const COOKIE_VALUE = "3f9a7d2c-nate-portfolio-2026";
const BLOB_PATH = "data/projects.json";

const DEFAULT_PROJECTS = [
  {
    id: "wedge",
    title: "Wedge",
    client: "Wedge",
    partner: "Partner Name",
    introRest: " is a closer look at the design and development work behind the golf app. Across products, features, and brand experiences, this is where a short summary of the project and approach goes.",
    image: "Projects/Wedge/wedge_main.jpg",
    size: "normal",
  },
  {
    id: "tottenham-hotspur",
    title: "Tottenham Hotspur F.C.",
    client: "Tottenham Hotspur F.C.",
    partner: "Partner Name",
    introRest: " is a closer look at the design work for the club. Across products, features, and brand experiences, this is where a short summary of the project and approach goes.",
    image: "Projects/Tottenham Hotspur/spurs.jpg",
    size: "large",
  },
  {
    id: "openfortune",
    title: "OpenFortune",
    client: "OpenFortune",
    partner: "Partner Name",
    introRest: " is a closer look at the design and development work for the project. Across products, features, and brand experiences, this is where a short summary of the project and approach goes.",
    image: "Projects/OpenFortune/openfortune_main.png",
    size: "normal",
  },
  {
    id: "mailboard",
    title: "Mailboard",
    client: "Mailboard",
    partner: "Partner Name",
    introRest: " is a closer look at the project — more of the breakdown is coming soon.",
    image: null,
    size: "large",
  },
];

function isAuthed(request) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === COOKIE_VALUE;
}

async function readProjects() {
  const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
  if (blobs.length === 0) return null;
  const res = await fetch(blobs[0].url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(request) {
  if (request.method === "GET") {
    let projects = null;
    try {
      projects = await readProjects();
    } catch {
      projects = null;
    }
    if (!Array.isArray(projects)) projects = DEFAULT_PROJECTS;
    return new Response(JSON.stringify({ projects }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (request.method === "POST") {
    if (!isAuthed(request)) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid json" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!Array.isArray(body.projects)) {
      return new Response(JSON.stringify({ ok: false, error: "projects must be an array" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    await put(BLOB_PATH, JSON.stringify(body.projects), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
}
