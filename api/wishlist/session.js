// GET /api/wishlist/session — tells the page whether to show editing controls.
// (The controls are only a convenience; every write is checked server-side.)
import { isEditor } from "./_lib.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ editor: isEditor(req) });
}
