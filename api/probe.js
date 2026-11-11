/*
 * Can this server reach the platforms at all?  Open it in a browser:
 *
 *   GET /api/probe                 직방 · 네이버에 한 번씩 물어보고 결과를 말한다
 *   GET /api/probe?naver=111515    네이버 단지 번호를 정해서
 *
 * 네이버 부동산은 해외 · 데이터센터에서 오는 연결을 받지 않는다. 배포한 곳에서 되는지
 * 안 되는지를 여기서 바로 본다 — 되면 첫 매물이 그대로 찍히므로, collect/naver.js가
 * 읽는 이름들이 맞는지도 함께 확인된다.
 */
const lib = require("./_core.js");
const zigbang = require("../collect/zigbang.js");
const naver = require("../collect/naver.js");

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
  return lib.json(res, 200, {
    ok: true,
    region: process.env.VERCEL_REGION || "(로컬)",
    zigbang: z,
    naver: n,
    naver_raw_first_item: raw.ok ? raw.item : raw.error
  });
};
