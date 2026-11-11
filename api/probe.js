/*
 * Is the server getting what it should?  Open it in a browser:
 *
 *   GET /api/probe
 *
 * 직방에 닿는지, 그리고 실거래가가 관심 단지마다 어디까지 받아지고 어디서 걸러지는지를
 * 보여준다. (네이버는 서버가 부르지 않는다 — collect/naver.js)
 */
const lib = require("./_core.js");
const zigbang = require("../collect/zigbang.js");
const molit = require("../collect/molit.js");
const { open } = require("./_data.js");

async function timed(fn) {
  const at = Date.now();
  try { const out = await fn(); return { ok: true, ms: Date.now() - at, ...out }; }
  catch (e) { return { ok: false, ms: Date.now() - at, error: String(e.message || e).slice(0, 200) }; }
}

module.exports = async function handler(req, res) {
  const z = await timed(async () => ({ found: (await zigbang.search("헬리오시티")).length }));

  /* 실거래가: 관심 단지마다 어디까지 받아지고 어디서 걸러지는지 */
  let deals = [];
  try {
    const home = open();
    const watches = home.data ? (await home.data.watches()) || [] : [];
    const cache = {};
    for (const w of watches.slice(0, 8)) deals.push(await molit.diagnose(w, cache));
    if (!watches.length) deals = "관심 단지가 없습니다";
  } catch (e) { deals = "관심 목록을 읽지 못했습니다 — " + String(e.message || e).slice(0, 160); }

  return lib.json(res, 200, {
    ok: true,
    region: process.env.VERCEL_REGION || "(로컬)",
    zigbang: z,
    deals_key: molit.enabled() ? molit.keyShape() : "MOLIT_SERVICE_KEY 없음",
    deals
  });
};
