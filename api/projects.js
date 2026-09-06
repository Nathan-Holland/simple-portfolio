// Vercel Function (Node.js runtime): the single source of truth for
// project data, read by the homepage/modal (GET, public — it's just
// portfolio content) and written by admin.html (POST, requires the same
// session cookie as the rest of the site). Stored as a JSON file in Vercel
// Blob (not Vercel KV — that product is deprecated). Falls back to a seed
// matching the original hand-written homepage so the site still renders
// correctly before the admin page has ever saved anything.
//
// Uses the classic (req, res) handler signature, not Request/Response —
// that Fetch-style signature is Edge-runtime-only and is silently ignored
// by the Node.js runtime, leaving requests hanging until they time out.
import { put, list } from "@vercel/blob";

const COOKIE_NAME = "site_auth";
const COOKIE_VALUE = "3f9a7d2c-nate-portfolio-2026";
const BLOB_PATH = "data/projects.json";

// Each project now carries a media[] array instead of a single image field
// — media[0] is the homepage tile / case-study hero, the rest populate the
// case-study gallery. Every item is {type: 'image'|'video', url}, so a
// project's hero (or any gallery slot) can be a video just as easily as an
// image.
const DEFAULT_PROJECTS = [
  {
    id: "wedge",
    title: "Wedge",
    client: "Wedge",
    partner: "Partner Name",
    introRest: " is a closer look at the design and development work behind the golf app. Across products, features, and brand experiences, this is where a short summary of the project and approach goes.",
    media: [{ type: "image", url: "Projects/Wedge/wedge_main.jpg" }],
    size: "normal",
  },
  {
    id: "tottenham-hotspur",
    title: "Tottenham Hotspur F.C.",
    client: "Tottenham Hotspur F.C.",
    partner: "Partner Name",
    introRest: " is a closer look at the design work for the club. Across products, features, and brand experiences, this is where a short summary of the project and approach goes.",
    media: [{ type: "image", url: "Projects/Tottenham Hotspur/spurs.jpg" }],
    size: "large",
  },
  {
    id: "openfortune",
    title: "OpenFortune",
    client: "OpenFortune",
    partner: "Partner Name",
    introRest: " is a closer look at the design and development work for the project. Across products, features, and brand experiences, this is where a short summary of the project and approach goes.",
    media: [{ type: "image", url: "Projects/OpenFortune/openfortune_main.png" }],
    size: "normal",
  },
  {
    id: "mailboard",
    title: "Mailboard",
    client: "Mailboard",
    partner: "Partner Name",
    introRest: " is a closer look at the project — more of the breakdown is coming soon.",
    media: [],
    size: "large",
  },
];

function isAuthed(req) {
  return !!(req.cookies && req.cookies[COOKIE_NAME] === COOKIE_VALUE);
}

// Normalizes older saved data (a single `image` string/null) onto the
// current media[] shape, so admin.js and the homepage never have to deal
// with both shapes — only this one place does.
function normalizeProject(project) {
  if (Array.isArray(project.media)) return project;
  const media = project.image ? [{ type: "image", url: project.image }] : [];
  const { image, ...rest } = project;
  return { ...rest, media };
}

async function readProjects() {
  const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
  if (blobs.length === 0) return null;
  const res = await fetch(blobs[0].url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    let projects = null;
    try {
      projects = await readProjects();
    } catch {
      projects = null;
    }
    if (!Array.isArray(projects)) projects = DEFAULT_PROJECTS;
    projects = projects.map(normalizeProject);
    res.status(200).json({ projects });
    return;
  }

  if (req.method === "POST") {
    if (!isAuthed(req)) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const body = req.body;
    if (!body || !Array.isArray(body.projects)) {
      res.status(400).json({ ok: false, error: "projects must be an array" });
      return;
    }

    try {
      await put(BLOB_PATH, JSON.stringify(body.projects), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } catch (err) {
      // Surfaced directly in the response so admin.js's error banner (and
      // the Network tab) show the real cause instead of Vercel's generic
      // FUNCTION_INVOCATION_FAILED page.
      res.status(500).json({ ok: false, error: String(err && err.message || err) });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).send("Method not allowed");
}
