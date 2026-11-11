/*
 * Can this server reach the platforms at all?  Open it in a browser:
 *
 *   GET /api/probe                 직방 · 네이버에 한 번씩 물어보고 결과를 말한다
 *   GET /api/probe?naver=111515    네이버 단지 번호를 정해서
 *
 * 실거래가도 함께 본다: 관심 단지마다 그 구의 거래가 몇 건 왔고, 그 단지 · 그 평형으로
 * 몇 건이 남는지.
 *
 * 네이버 부동산은 해외 · 데이터센터에서 오는 연결을 받지 않는다. 배포한 곳에서 되는지
 * 안 되는지를 여기서 바로 본다 — 되면 첫 매물이 그대로 찍히므로, collect/naver.js가
 * 읽는 이름들이 맞는지도 함께 확인된다.
 */
const lib = require("./_core.js");
const zigbang = require("../collect/zigbang.js");
const naver = require("../collect/naver.js");
const molit = require("../collect/molit.js");
const { open } = require("./_data.js");

async function timed(fn) {
  const at = Date.now();
  try { const out = await fn(); return { ok: true, ms: Date.now() - at, ...out }; }
  catch (e) { return { ok: false, ms: Date.now() - at, error: String(e.message || e).slice(0, 200) }; }
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const no = (url.searchParams.get("naver") || "111515").replace(/\D/g, "").slice(0, 12) || "111515";
  const [z, n, raw] = await Promise.all([
    timed(async () => ({ found: (await zigbang.search("헬리오시티")).length })),
    timed(async () => {
      const cat = await naver.catalog(no, "trade");
      return { name: cat.name, listings: cat.listings.length, first: cat.listings[0] || null };
    }),
    timed(async () => ({ item: await naver.raw(no) }))
  ]);
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
    naver: n,
    naver_raw_first_item: raw.ok ? raw.item : raw.error,
    deals_key: molit.enabled() ? molit.keyShape() : "MOLIT_SERVICE_KEY 없음",
    deals
  });
};
