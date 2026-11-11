/*
 * Finding a 단지 to watch.
 *
 *   GET /api/search?q=헬리오          -> { ok, complexes: [{ id, name, address, households }] }
 *   GET /api/search?complex=38487&trade=trade
 *                                    -> { ok, types: [{ id, label, count }] }
 *
 * Editors only: this spends requests on someone else's server.
 */
const lib = require("./_core.js");
const { open, asker } = require("./_data.js");
const { SOURCES } = require("../collect/run.js");

module.exports = async function handler(req, res) {
  const home = open();
  if (home.missing.length) return lib.setupError(res, home.missing);
  try {
    const who = await asker(req, home);
    if (!who.canWrite) return lib.json(res, 403, { ok: false, error: who.me ? "readonly" : "signin" });

    const url = new URL(req.url, "http://x");
    const source = SOURCES[url.searchParams.get("source") || "zigbang"];
    if (!source) return lib.json(res, 400, { ok: false, error: "source" });

    const complex = url.searchParams.get("complex");
    if (complex) {
      if (!/^\d{1,12}$/.test(complex)) return lib.json(res, 400, { ok: false, error: "complex" });
      const trade = url.searchParams.get("trade") || "trade";
      if (!source.TRADES[trade]) return lib.json(res, 400, { ok: false, error: "trade" });
      return lib.json(res, 200, { ok: true, types: await source.roomTypes(complex, trade) });
    }

    const q = (url.searchParams.get("q") || "").trim().slice(0, 40);
    if (q.length < 2) return lib.json(res, 200, { ok: true, complexes: [] });
    return lib.json(res, 200, { ok: true, complexes: await source.search(q) });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "source", message: String(e.message || e).slice(0, 300) });
  }
};
