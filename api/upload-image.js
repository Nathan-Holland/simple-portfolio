// Vercel Edge Function: receives a raw image body (admin.js sends the File
// directly as the request body, with its name/type in headers), stores it
// in Vercel Blob under public access, and returns the URL admin.js then
// saves onto the project via /api/projects.
import { put } from "@vercel/blob";

export const config = { runtime: "edge" };

const COOKIE_NAME = "site_auth";
const COOKIE_VALUE = "3f9a7d2c-nate-portfolio-2026";
const MAX_BYTES = 10 * 1024 * 1024;

function isAuthed(request) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === COOKIE_VALUE;
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!isAuthed(request)) {
    return jsonError("unauthorized", 401);
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return jsonError("only image uploads are allowed", 400);
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0) {
    return jsonError("empty file", 400);
  }
  if (buffer.byteLength > MAX_BYTES) {
    return jsonError("file too large (max 10MB)", 400);
  }

  const rawName = request.headers.get("x-filename") || "upload";
  const safeName = decodeURIComponent(rawName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `projects/${Date.now()}-${safeName}`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType,
  });

  return new Response(JSON.stringify({ ok: true, url: blob.url }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
