/*
 * Finding a 단지 to watch.
 *
 *   GET /api/search?q=헬리오          -> { ok, complexes: [{ id, name, address, households }] }
 *   GET /api/search?complex=38487    -> { ok, types: [{ id, label, supply, exclusive, count:{trade,charter} }] }
 *   GET /api/search?naver=헬리오시티   -> { ok, naverId }   네이버 단지 번호를 이름으로 찾아본다
 *                                       (못 찾거나 네이버가 받지 않으면 "")
 */
const lib = require("./_core.js");
const { open } = require("./_data.js");
const zigbang = require("../collect/zigbang.js");
const naver = require("../collect/naver.js");

module.exports = async function handler(req, res) {
  const home = open();
  if (home.missing.length) return lib.setupError(res, home.missing);
  try {
    const url = new URL(req.url, "http://x");

    const name = url.searchParams.get("naver");
    if (name) {
      let naverId = "", message = "";
      try { naverId = await naver.find(name.trim().slice(0, 40)); }
      catch (e) { message = String(e.message || e).slice(0, 120); }
      return lib.json(res, 200, { ok: true, naverId, message });
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
