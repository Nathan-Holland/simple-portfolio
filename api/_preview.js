// Link previews for bookmarks: reads a page's title, description, preview image
// and icon from its <head> (Open Graph / Twitter / standard meta tags).
// Used by GET /api/store?preview=<url>. Files starting with "_" aren't routes.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) =>
  String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const clean = (s, max) => (s ? decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Only public http(s) addresses: no localhost, private networks or other schemes. */
export function safeUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim().match(/^[a-z]+:/i) ? String(raw).trim() : "https://" + String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^(\d+\.){3}\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return null;
  }
  if (h.includes(":")) return null; // raw IPv6
  return u;
}

function meta(html, keys) {
  for (const key of keys) {
    const re = new RegExp("<meta\\b[^>]*(?:property|name)\\s*=\\s*[\"']" + key.replace(":", "\\:") + "[\"'][^>]*>", "i");
    const tag = html.match(re);
    if (tag) {
      const c = tag[0].match(/\scontent\s*=\s*(["'])([\s\S]*?)\1/i);
      if (c && c[2].trim()) return c[2];
    }
  }
  return "";
}

function icon(html, base) {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  let best = null, bestScore = -1;
  for (const l of links) {
    const rel = (l.match(/\srel\s*=\s*(["'])(.*?)\1/i) || [])[2] || "";
    if (!/icon/i.test(rel)) continue;
    const href = (l.match(/\shref\s*=\s*(["'])(.*?)\1/i) || [])[2];
    if (!href) continue;
    const size = parseInt(((l.match(/\ssizes\s*=\s*(["'])(\d+)/i) || [])[2]) || "0", 10);
    const score = (/apple-touch/i.test(rel) ? 200 : 0) + size + (/\.svg/i.test(href) ? 50 : 0);
    if (score > bestScore) { bestScore = score; best = href; }
  }
  try { return new URL(best || "/favicon.ico", base).toString(); } catch { return ""; }
}

/** { url, title, description, image, icon, site } — fields may be empty if the page hides them. */
export async function preview(raw) {
  const u = safeUrl(raw);
  if (!u) throw Object.assign(new Error("That doesn’t look like a website address"), { status: 400 });
  const res = await fetch(u, {
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9", Accept: "text/html,application/xhtml+xml" },
  });
  const finalUrl = res.url || u.toString();
  // Only the <head> matters; stop reading after ~400 KB
  let html = "";
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    while (html.length < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    try { reader.cancel(); } catch { /* ignore */ }
  } else {
    html = (await res.text()).slice(0, 400_000);
  }
  const title = clean(meta(html, ["og:title", "twitter:title"]) || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1], 200);
  const description = clean(meta(html, ["og:description", "twitter:description", "description"]), 300);
  let image = meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
  try { image = image ? new URL(decode(image).trim(), finalUrl).toString().replace(/^http:/, "https:") : ""; } catch { image = ""; }
  return {
    url: finalUrl,
    title,
    description,
    image,
    icon: icon(html, finalUrl).replace(/^http:/, "https:"),
    site: clean(meta(html, ["og:site_name", "application-name"]), 80) || new URL(finalUrl).hostname.replace(/^www\./, ""),
  };
}
