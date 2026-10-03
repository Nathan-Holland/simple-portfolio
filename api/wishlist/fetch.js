// GET /api/wishlist/fetch?url=… — editor only. Reads a product page and returns
// {name, brand, category, price, image, link}. Tries Shopify's /products/<handle>.js
// first (clean data), then JSON-LD Product data, then Open Graph / meta tags.
import { isEditor } from "./_lib.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) =>
  String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const text = (s) => (s == null ? null : decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || null);

function num(v) {
  if (v == null) return null;
  let n = String(v).replace(/[^\d.,]/g, "");
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", "."); // 1.234,00
  else n = n.replace(/,/g, ""); // 1,234.00
  const f = parseFloat(n);
  if (!Number.isFinite(f)) return null;
  return f % 1 === 0 ? f : Math.round(f * 100) / 100;
}

function absUrl(src, base) {
  if (!src) return null;
  let s = String(src).trim();
  if (s.startsWith("//")) s = "https:" + s;
  try { return new URL(s, base).toString(); } catch { return s; }
}

async function get(url, accept) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Accept: accept },
  });
  return { status: res.status, body: await res.text() };
}

async function shopify(uri) {
  if (!/\/products\/[^/]+/.test(uri.pathname)) return null;
  const path = uri.pathname.replace(/\/$/, "").replace(/\.(js|json)$/, "");
  try {
    const { status, body } = await get(`${uri.protocol}//${uri.host}${path}.js`, "application/json");
    if (status !== 200) return null;
    const p = JSON.parse(body);
    if (!p || !p.title) return null;
    const price = p.price != null ? Math.round(Number(p.price)) / 100 : null;
    return {
      name: p.title,
      brand: p.vendor,
      type: p.type,
      price,
      image: absUrl(p.featured_image || (p.images || [])[0], uri.toString()),
      description: text(p.description)?.slice(0, 280),
    };
  } catch {
    return null;
  }
}

function findProduct(node) {
  if (Array.isArray(node)) {
    for (const n of node) { const r = findProduct(n); if (r) return r; }
    return null;
  }
  if (node && typeof node === "object") {
    const types = [].concat(node["@type"] || []).map(String);
    if (types.some((t) => /^(Product|ProductGroup|IndividualProduct)$/.test(t))) return node;
    return findProduct(node["@graph"]) || findProduct(node.mainEntity);
  }
  return null;
}

function fromHtml(html, url) {
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1];
    const val = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (key && val != null && !(key.toLowerCase() in meta)) meta[key.toLowerCase()] = decode(val);
  }

  let ld = null;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { ld = findProduct(JSON.parse(m[1].trim())); } catch { continue; }
    if (ld) break;
  }
  ld = ld || {};

  const variant = [].concat(ld.hasVariant || [])[0] || {};
  const offers = ld.offers || variant.offers;
  const offer = (Array.isArray(offers) ? offers[0] : offers) || {};
  let brand = ld.brand;
  if (Array.isArray(brand)) brand = brand[0];
  if (brand && typeof brand === "object") brand = brand.name;
  let image = ld.image || variant.image;
  if (Array.isArray(image)) image = image[0];
  if (image && typeof image === "object") image = image.url || image.contentUrl;

  const title = meta["og:title"] || text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  return {
    name: text(ld.name) || title,
    brand: text(brand) || meta["product:brand"] || meta["og:brand"] || meta["og:site_name"],
    type: text(ld.category),
    price: num(offer.price ?? offer.lowPrice ?? meta["product:price:amount"] ?? meta["og:price:amount"] ?? meta["price"]),
    image: absUrl(image || meta["og:image"] || meta["og:image:secure_url"] || meta["twitter:image"], url),
    description: text(ld.description || meta["og:description"] || meta["description"])?.slice(0, 280),
  };
}

const CATEGORIES = [
  ["Outerwear", /jacket|coat|parka|blazer|anorak|bomber|gilet|vest|overshirt|trucker|fleece|puffer|windbreaker|cardigan/i],
  ["Footwear", /shoe|sneaker|trainer|boot|loafer|sandal|derby|mule|clog|slipper|runner/i],
  ["Bottoms", /trouser|pant|jean|chino|short|skirt|jogger|denim|slacks/i],
  ["Accessories", /bag|tote|backpack|wallet|belt|hat|cap|beanie|scarf|sock|glove|sunglass|watch|ring|necklace|bracelet|tie|keychain/i],
  ["Tops", /shirt|tee|t-shirt|sweater|sweatshirt|hoodie|knit|crew|polo|henley|top|jumper|pullover|turtleneck|tank/i],
];
const guessCategory = (...hints) => {
  const s = hints.filter(Boolean).join(" ");
  return CATEGORIES.find(([, re]) => re.test(s))?.[0] || null;
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!isEditor(req)) {
    res.status(401).json({ error: "Sign in to edit" });
    return;
  }
  const url = String(req.query.url || "").trim();
  let uri;
  try { uri = new URL(url); } catch { uri = null; }
  if (!uri || !/^https?:$/.test(uri.protocol)) {
    res.status(422).json({ error: "Enter a full http(s) link" });
    return;
  }

  try {
    let data = await shopify(uri);
    if (!data) {
      const { status, body } = await get(url, "text/html,application/xhtml+xml,*/*;q=0.8");
      if (status >= 400) throw new Error(`The site blocked the request (HTTP ${status})`);
      data = fromHtml(body, url);
    }

    let name = String(data.name || "");
    const brand = String(data.brand || "");
    if (brand) name = name.replace(new RegExp(`\\s*[|\\-–—]\\s*${escapeRe(brand)}.*$`, "i"), ""); // strip " | Brand"
    if (!name && !data.image) throw new Error("Couldn't find product details on that page");

    res.status(200).json({
      name,
      brand,
      category: guessCategory(name, data.type) || guessCategory(data.description) || "",
      price: data.price ?? null,
      image: data.image || "",
      link: url,
      notes: "",
    });
  } catch (err) {
    const msg = err && err.name === "TimeoutError" ? "That page took too long to respond" : err?.message || "Couldn't reach that page";
    res.status(422).json({ error: msg });
  }
}
