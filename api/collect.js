/*
 * The scheduled round. Vercel Cron calls this once a day (vercel.json):
 * 12:00 Korean time.
 *
 *   GET /api/collect      Authorization: Bearer <CRON_SECRET>
 *
 * Vercel sends that header by itself once CRON_SECRET is set on the project.
 * Without the secret set, nobody may call this.
 */
const lib = require("./_core.js");
const { open } = require("./_data.js");
const { run } = require("../collect/run.js");

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return lib.json(res, 200, { ok: false, error: "setup", message: "CRON_SECRET 환경변수가 없습니다." });
  if ((req.headers.authorization || "") !== "Bearer " + secret) {
    return lib.json(res, 401, { ok: false, error: "secret" });
  }
  const home = open();
  if (home.missing.length) return lib.setupError(res, home.missing);
  try {
    const report = await run(home.data);
    return lib.json(res, report.failed.length && !report.saved ? 502 : 200, { ok: true, ...report });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "collect", message: String(e.message || e).slice(0, 300) });
  }
};
