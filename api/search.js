/*
 * Finding a 단지 to watch.
 *
 *   GET /api/search?q=헬리오          -> { ok, complexes: [{ id, name, address, households }] }
 *   GET /api/search?complex=38487    -> { ok, types: [{ id, label, supply, exclusive, count:{trade,charter} }] }
 *   GET /api/search?naverOf=38487&name=헬리오시티
 *                                    -> { ok, naverId }   그 단지의 네이버 단지 번호 (KB부동산이
 *                                       단지마다 알려준다. 못 찾으면 "")
 */
const lib = require("./_core.js");
const { open } = require("./_data.js");
const zigbang = require("../collect/zigbang.js");
const kb = require("../collect/kb.js");

module.exports = async function handler(req, res) {
  const home = open();
  if (home.missing.length) return lib.setupError(res, home.missing);
  try {
    const url = new URL(req.url, "http://x");

    const of = url.searchParams.get("naverOf");
    if (of) {
      if (!/^\d{1,12}$/.test(of)) return lib.json(res, 400, { ok: false, error: "complex" });
      let naverId = "";
      try {
        const where = await zigbang.place(of);
        naverId = await kb.naverId({ ...where, name: (url.searchParams.get("name") || "").trim().slice(0, 60) });
      } catch (e) { /* 못 찾은 것으로 친다 */ }
      return lib.json(res, 200, { ok: true, naverId });
    }

    const complex = url.searchParams.get("complex");
    if (complex) {
      if (!/^\d{1,12}$/.test(complex)) return lib.json(res, 400, { ok: false, error: "complex" });
      return lib.json(res, 200, { ok: true, types: await zigbang.roomTypes(complex) });
    }

    const q = (url.searchParams.get("q") || "").trim().slice(0, 40);
    if (q.length < 2) return lib.json(res, 200, { ok: true, complexes: [] });
    return lib.json(res, 200, { ok: true, complexes: await zigbang.search(q) });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "source", message: String(e.message || e).slice(0, 300) });
  }
};
