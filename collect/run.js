/*
 * One round of collecting: every watched 단지 · 평형 gets today's snapshot —
 * the asking prices from every platform that answered, in one list — and its
 * recent 실거래가.
 *
 * It is safe to run twice, and from two places. A snapshot is keyed by
 * (watch, day); a platform that answers replaces its own listings in it, and a
 * platform that does not answer leaves what an earlier run recorded. So the
 * scheduled run can record 직방 while a run at home adds 네이버 to the same day.
 */
const zigbang = require("./zigbang.js");
const naver = require("./naver.js");
const molit = require("./molit.js");

const PLATFORMS = { zigbang, naver };
const KST = 9 * 3600 * 1000;

/* the day `when` falls in, in Korean time: "2026-11-11" */
function slotOf(when) {
  return new Date((when || new Date()).getTime() + KST).toISOString().slice(0, 10);
}

function stats(listings) {
  const prices = listings.map((l) => l.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (!prices.length) return { count: listings.length, min_price: null, med_price: null, max_price: null };
  const mid = prices.length >> 1;
  return {
    count: listings.length,
    min_price: prices[0],
    med_price: prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2),
    max_price: prices[prices.length - 1]
  };
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const why = (e) => String((e && e.message) || e).slice(0, 200);

/* what is stored of one listing */
function keep(l) {
  return { src: l.src, id: l.id, item: l.item, price: l.price, dong: l.dong, floor: l.floor, title: l.title, n: l.n };
}

/* opts.only  collect just these watch ids */
async function run(data, opts) {
  opts = opts || {};
  const slot = slotOf(opts.now);
  let watches = await data.watches();
  if (opts.only) watches = watches.filter((w) => opts.only.indexOf(w.id) >= 0);

  /* one request per 단지 · 거래 and platform — its 평형s are split out of the same answer */
  const groups = {};
  watches.forEach((w) => {
    const key = [w.complex_id, w.trade].join("|");
    (groups[key] = groups[key] || []).push(w);
  });

  const report = { slot, saved: 0, deals: molit.enabled() ? 0 : "MOLIT_SERVICE_KEY 없음", failed: [] };
  const cache = {};
  let first = true;
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    const head = group[0];
    if (!first) await pause(400);          /* 남의 서버다 — 몰아치지 않는다 */
    first = false;

    const got = {};                        /* platform → listings, for the ones that answered */
    const state = {};
    try {
      got.zigbang = (await zigbang.catalog(head.complex_id, head.trade)).listings;
      state.zigbang = "ok";
    } catch (e) {
      state.zigbang = "fail";
      report.failed.push({ complex: head.complex_name, source: "직방", error: why(e) });
    }
    const naverId = (group.find((w) => w.naver_id) || {}).naver_id;
    if (naverId) {
      try {
        got.naver = (await naver.catalog(naverId, head.trade)).listings;
        state.naver = "ok";
      } catch (e) {
        state.naver = "fail";
        report.failed.push({ complex: head.complex_name, source: "네이버 부동산", error: why(e) });
      }
    }

    if (Object.keys(got).length) {
      const taken = new Date().toISOString();
      for (const w of group) {
        const before = await data.snapshot(w.id, slot);
        const sources = Object.assign({}, before && before.sources);
        let listings = [];
        Object.keys(PLATFORMS).forEach((src) => {
          if (got[src]) {
            const mine = src === "zigbang"
              ? got[src].filter((l) => l.type === w.room_type_id)
              : got[src].filter((l) => naver.sameType(l, w));
            listings = listings.concat(mine.map(keep));
            sources[src] = "ok";
          } else {
            /* 이번에 답하지 않은 곳은 오늘 먼저 받아둔 것을 그대로 둔다 */
            const kept = ((before && before.listings) || []).filter((l) => (l.src || "zigbang") === src);
            listings = listings.concat(kept);
            if (state[src] && !kept.length && sources[src] !== "ok") sources[src] = "fail";
          }
        });
        listings.sort((a, b) => a.price - b.price);
        await data.putSnapshot({ watch_id: w.id, slot, taken_at: taken, ...stats(listings), listings, sources });
        report.saved++;
      }
    }

    if (molit.enabled()) {
      try {
        const found = await molit.deals(group, cache);
        for (const w of group) {
          if (!found || !found[w.id]) continue;
          await data.patchWatch(w.id, { deals: molit.merge(w.deals, found[w.id]), deals_at: new Date().toISOString() });
          report.deals += found[w.id].length;
        }
      } catch (e) {
        report.failed.push({ complex: head.complex_name, source: "실거래가", error: why(e) });
      }
    }
  }
  return report;
}

module.exports = { run, slotOf, stats, PLATFORMS };
