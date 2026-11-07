// GET /api/news — headlines for the start page (site login required).
// Reads Google News RSS searches server-side (browsers can't, because of CORS) and
// returns a few recent items per topic. Vercel's CDN caches the response for
// 30 minutes so the feeds aren't hit on every page load.
import { isSignedIn } from "./_site-auth.js";

const GN = "https://news.google.com/rss";
const LOCALE = "hl=en-GB&gl=GB&ceid=GB:en";

// Finance chatter (share purchases, earnings calls) swamps company names like Figma or Nvidia,
// …and shopping deals swamp the design and gadget outlets
const NOISE = '-shares -stock -stocks -earnings -investor -investors -"price target" -acquires -NASDAQ -NYSE -deal -deals -"Black Friday" -sale -discount -coupon';
const search = (q) => `${GN}/search?q=${encodeURIComponent(q + " " + NOISE)}&${LOCALE}`;

// Each topic merges a few searches: broad keywords plus the outlets that cover it best
export const TOPICS = [
  {
    id: "design",
    label: "Design & UX",
    urls: [
      search('("UX design" OR "UI design" OR "product design" OR "design system" OR "interaction design") when:7d'),
      search("(site:creativebloq.com OR site:itsnicethat.com OR site:dezeen.com OR site:smashingmagazine.com OR site:fastcompany.com/co-design) when:7d"),
      search('(Figma OR Framer OR "Adobe XD" OR Sketch app) (design OR designers OR feature OR launch) when:7d'),
    ],
  },
  {
    id: "tech",
    label: "AI & tech",
    urls: [
      search('("artificial intelligence" OR OpenAI OR Anthropic OR Claude OR ChatGPT OR Gemini OR "Google DeepMind") when:2d'),
      search("(Apple OR iPhone OR Mac OR Google OR Microsoft) -game -games -Xbox -PlayStation when:2d"),
      search("(site:theverge.com OR site:techcrunch.com OR site:arstechnica.com OR site:wired.com) (AI OR software OR startup OR app OR chip) when:2d"),
    ],
  },
];

const PER_TOPIC = 5;

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&")
    .trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">"));
  return m ? decode(m[1]) : "";
}

export function parseRss(xml) {
  const items = [];
  const seen = new Set();
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const source = tag(it, "source");
    let title = tag(it, "title");
    // Google News titles end with " - Source"; drop it, the source is shown separately
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    const link = tag(it, "link");
    const date = new Date(tag(it, "pubDate"));
    if (!title || !/^https?:\/\//.test(link)) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, link, source, published: isNaN(date) ? null : date.toISOString() });
  }
  items.sort((a, b) => (b.published || "").localeCompare(a.published || ""));
  return items;
}

async function fetchFeed(url) {
  const r = await fetch(url, { headers: { "User-Agent": "nate-holland.com start page" } });
  if (!r.ok) throw new Error(String(r.status));
  return parseRss(await r.text());
}

// Round-robin across a topic's searches so no single one dominates, newest first within each
async function fetchTopic(t) {
  const results = await Promise.allSettled(t.urls.map(fetchFeed));
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
  out.sort((a, b) => (b.published || "").localeCompare(a.published || ""));
  return { id: t.id, label: t.label, items: out };
}

export default async function handler(req, res) {
  if (!(await isSignedIn(req))) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({ error: "Sign in to nate-holland.com first" });
    return;
  }
  const topics = await Promise.all(TOPICS.map(fetchTopic));
  // Private: only cached in the signed-in browser, for 30 minutes
  res.setHeader("Cache-Control", "private, max-age=1800");
  res.status(200).json({ topics, fetched: new Date().toISOString() });
}
