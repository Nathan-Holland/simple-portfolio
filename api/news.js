// GET /api/news — headlines for the start page (private login required).
// Reads publishers' own RSS/Atom feeds server-side (browsers can't, because of
// CORS) and returns the newest few per topic, each with an image, a short
// summary, the source and a direct link. The signed-in browser caches the
// response for 30 minutes so the feeds aren't hit on every page load.
import { isPrivate } from "./_site-auth.js";

const PER_TOPIC = 5;
const MAX_AGE_DAYS = 10;

// Each topic round-robins across a few outlets so no single one dominates
export const TOPICS = [
  {
    id: "design",
    label: "Design & UX",
    feeds: [
      { source: "UX Collective", url: "https://uxdesign.cc/feed" },
      { source: "Smashing Magazine", url: "https://www.smashingmagazine.com/feed/" },
      { source: "Creative Bloq", url: "https://www.creativebloq.com/feeds.xml" },
    ],
  },
  {
    id: "tech",
    label: "AI & tech",
    feeds: [
      { source: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
      { source: "Wired", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
      { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
    ],
  },
];

// Shopping posts (deals, price drops) swamp some of these outlets
const NOISE = /\b(deals?|discount|price (drop|cut)|cheapest|lowest price|black friday|cyber monday|prime day|sale|save \$|save £|coupon|promo code|best .{0,30} (to buy|right now))\b/i;

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&nbsp;/g, " ").replace(/&hellip;/g, "…").replace(/&[lr]squo;/g, "’").replace(/&[lr]dquo;/g, '"').replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return m ? decode(m[1]) : "";
}
function attr(xml, tagName, attrName, where) {
  const re = new RegExp("<" + tagName + "\\b[^>]*?" + (where || "") + "[^>]*>", "gi");
  for (const m of xml.matchAll(re)) {
    const a = m[0].match(new RegExp("\\s" + attrName + '\\s*=\\s*["\']([^"\']+)["\']', "i"));
    if (a) return decode(a[1]);
  }
  return "";
}
function textOf(html) {
  return decode(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function clip(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(" ") > n * 0.6 ? cut.lastIndexOf(" ") : n).replace(/[\s,;:.–—-]+$/, "") + "…";
}
function httpsUrl(u) {
  if (!u) return "";
  u = u.replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");
  return /^https:\/\//.test(u) ? u : "";
}

function imageOf(it) {
  // Feed-declared images first, then the first <img> in the article body
  const direct =
    attr(it, "media:thumbnail", "url") ||
    attr(it, "media:content", "url", 'medium=["\']image|type=["\']image') ||
    attr(it, "media:content", "url") ||
    attr(it, "enclosure", "url", 'type=["\']image');
  if (direct) return httpsUrl(direct);
  const body = decode(tag(it, "content:encoded") || tag(it, "content") || tag(it, "description") || tag(it, "summary"));
  const m = body.match(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i);
  return m ? httpsUrl(decode(m[1])) : "";
}

export function parseFeed(xml, source) {
  const items = [];
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const atom = !blocks.length;
  if (atom) for (const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) blocks.push(m[1]);
  for (const it of blocks) {
    const title = textOf(tag(it, "title"));
    const link = atom ? attr(it, "link", "href", 'rel=["\']alternate') || attr(it, "link", "href") : tag(it, "link") || attr(it, "link", "href");
    const when = new Date(tag(it, "pubDate") || tag(it, "published") || tag(it, "updated") || tag(it, "dc:date"));
    const summary = clip(textOf(tag(it, "description") || tag(it, "summary") || tag(it, "content:encoded") || tag(it, "content")), 180);
    if (!title || !/^https?:\/\//.test(link) || NOISE.test(title)) continue;
    items.push({
      title,
      link: link.replace(/\?source=rss[^#]*$/, ""),
      source,
      summary,
      image: imageOf(it),
      published: isNaN(when) ? null : when.toISOString(),
    });
  }
  return items;
}

async function fetchFeed(f) {
  const r = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 (nate-holland.com start page)" } });
  if (!r.ok) throw new Error(String(r.status));
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  return parseFeed(await r.text(), f.source)
    .filter((i) => !i.published || new Date(i.published).getTime() >= cutoff)
    .sort((a, b) => (b.published || "").localeCompare(a.published || ""));
}

async function fetchTopic(t) {
  const results = await Promise.allSettled(t.feeds.map(fetchFeed));
  const lists = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!lists.length) return { id: t.id, label: t.label, items: [], error: "Couldn’t load this feed" };
  const out = [];
  const seen = new Set();
  for (let i = 0; out.length < PER_TOPIC && lists.some((l) => l[i]); i++) {
    for (const l of lists) {
      const it = l[i];
      if (!it || out.length >= PER_TOPIC) continue;
      const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
  }
  // Newest first, but lead with a story that has an image so the top slot looks right
  out.sort((a, b) => (b.published || "").localeCompare(a.published || ""));
  const lead = out.findIndex((i) => i.image);
  if (lead > 0) out.unshift(out.splice(lead, 1)[0]);
  return { id: t.id, label: t.label, items: out };
}

export default async function handler(req, res) {
  if (!(await isPrivate(req))) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({ error: "Sign in with your private password first" });
    return;
  }
  const topics = await Promise.all(TOPICS.map(fetchTopic));
  res.setHeader("Cache-Control", "private, max-age=1800");
  res.status(200).json({ topics, fetched: new Date().toISOString() });
}
