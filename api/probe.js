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
  /* 예약 실행이 실제로 돈 날: 기록에 남은 "누가 받았나"를 본다 (이 표시는 2026-11-17부터 남는다) */
  let runs = null;
  try {
    const rows = (await open().data.summaries(400)) || [];
    runs = {};
    rows.forEach((r) => {
      const by = (r.sources && r.sources.zigbang_by) || "(표시 전)";
      const day = (runs[r.slot] = runs[r.slot] || {});
      day[by] = (day[by] || 0) + 1;
    });
  } catch (e) { runs = String(e.message || e).slice(0, 120); }

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
    /* 아침 수집(Vercel Cron)이 돌 수 있는 상태인가 */
    cron: {
      secret: process.env.CRON_SECRET ? "있음" : "없음 — /api/collect가 거절된다",
      deployment: process.env.VERCEL_ENV || "(로컬)",
      note: process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
        ? "이 배포는 production이 아니다 — Vercel은 production 배포에서만 예약 실행을 돌린다" : "",
      /* 날마다 직방 기록을 누가 남겼나: cron(예약 실행) · auto(화면 열 때) · button(직접) · add(등록) */
      by_day: runs
    },
    zigbang: z,
    deals_key: molit.enabled() ? molit.keyShape() : "MOLIT_SERVICE_KEY 없음",
    deals
  });
};
