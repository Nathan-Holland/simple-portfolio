// Vercel Function (Node.js runtime): receives a raw image body (admin.js
// sends the File directly as the request body, with its name/type in
// headers), stores it in Vercel Blob under public access, and returns the
// URL admin.js then saves onto the project via /api/projects.
//
// Uses the classic (req, res) handler signature, not Request/Response —
// that Fetch-style signature is Edge-runtime-only and is silently ignored
// by the Node.js runtime, leaving requests hanging until they time out.
// Body parsing is disabled so we can read the raw image bytes ourselves —
// Vercel's automatic parser is built for json/text/urlencoded, not
// arbitrary binary uploads.
import { put } from "@vercel/blob";

export const config = {
  api: { bodyParser: false },
};

const COOKIE_NAME = "site_auth";
const COOKIE_VALUE = "3f9a7d2c-nate-portfolio-2026";
const MAX_BYTES = 10 * 1024 * 1024;

function isAuthed(req) {
  return !!(req.cookies && req.cookies[COOKIE_NAME] === COOKIE_VALUE);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  if (!isAuthed(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("image/")) {
    res.status(400).json({ ok: false, error: "only image uploads are allowed" });
    return;
  }

  const buffer = await readRawBody(req);
  if (buffer.length === 0) {
    res.status(400).json({ ok: false, error: "empty file" });
    return;
  }
  if (buffer.length > MAX_BYTES) {
    res.status(400).json({ ok: false, error: "file too large (max 10MB)" });
    return;
  }

  const rawName = req.headers["x-filename"] || "upload";
  const safeName = decodeURIComponent(rawName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `projects/${Date.now()}-${safeName}`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType,
  });

  res.status(200).json({ ok: true, url: blob.url });
}
