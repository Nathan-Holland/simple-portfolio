// TEMPORARY — GET /api/wishlist/check
// Diagnoses "Editing isn't set up" by reporting whether WISHLIST_PASSWORD reaches this
// deployment. Shows names and yes/no only — never any values. Delete once sorted.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const raw = process.env.WISHLIST_PASSWORD;
  res.status(200).json({
    deployment: process.env.VERCEL_ENV || "unknown",          // "preview" or "production"
    branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "unknown",
    wishlistPasswordPresent: raw !== undefined,
    wishlistPasswordEmpty: raw !== undefined && raw.trim() === "",
    // Names only, to catch typos like WISHLIST_PASWORD or wishlist_password.
    similarSettingNames: Object.keys(process.env).filter((k) => /wish|pass/i.test(k)),
  });
}
