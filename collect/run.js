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
const hogangnono = require("./hogangnono.js");
const kb = require("./kb.js");

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

/* Ask every platform this 단지 · 거래 is linked to. → { got: {platform: listings}, state, failed } */
async function fetchGroup(group) {
  const head = group[0];
  const got = {}, state = {}, failed = [];
  try {
    got.zigbang = (await zigbang.catalog(head.complex_id, head.trade)).listings;
    state.zigbang = "ok";
  } catch (e) {
    state.zigbang = "fail";
    failed.push({ complex: head.complex_name, source: "직방", error: why(e) });
  }
  const naverId = (group.find((w) => w.naver_id) || {}).naver_id;
  if (naverId) {
    try {
      got.naver = (await naver.catalog(naverId, head.trade)).listings;
      state.naver = "ok";
    } catch (e) {
      state.naver = "fail";
      failed.push({ complex: head.complex_name, source: "네이버 부동산", error: why(e) });
    }
  }
  return { got, state, failed };
}

/* One watch's list out of what the platforms answered. A platform that did not
   answer keeps what `before` (today's earlier record, if any) had from it. */
function listingsFor(w, fetched, before) {
  const sources = Object.assign({}, before && before.sources);
  let listings = [];
  Object.keys(PLATFORMS).forEach((src) => {
    if (fetched.got[src]) {
      const mine = src === "zigbang"
        ? fetched.got[src].filter((l) => l.type === w.room_type_id)
        : fetched.got[src].filter((l) => naver.sameType(l, w));
      listings = listings.concat(mine.map(keep));
      sources[src] = "ok";
    } else {
      const kept = ((before && before.listings) || []).filter((l) => (l.src || "zigbang") === src);
      listings = listings.concat(kept);
      if (fetched.state[src] && !kept.length && sources[src] !== "ok") sources[src] = "fail";
    }
  });
  listings.sort((a, b) => a.price - b.price);
  return { listings, sources };
}

/*
 * What a watch needs to know about itself before 실거래가 and 네이버 can be
 * matched to it: its areas (공급 · 전용) and where the 단지 stands. Watches
 * registered before these were recorded get them filled in here.
 * Returns the group as it now is.
 */
async function ensure(data, group) {
  const head = group[0];
  const patches = {};
  const note = (id, fields) => { patches[id] = Object.assign(patches[id] || {}, fields); };
  if (group.some((w) => !Number(w.exclusive_m2) || !Number(w.supply_m2))) {
    const types = await zigbang.roomTypes(head.complex_id);
    group.forEach((w) => {
      const t = types.find((x) => x.id === w.room_type_id);
      if (!t) return;
      if (!Number(w.supply_m2) && t.supply) note(w.id, { supply_m2: t.supply });
      if (!Number(w.exclusive_m2) && t.exclusive) note(w.id, { exclusive_m2: t.exclusive });
    });
  }
  const noPlace = group.some((w) => !w.lawd_cd), noHgnn = group.some((w) => !w.hgnn_id);
  const noNaver = group.some((w) => !w.naver_id);
  if (noPlace || noHgnn || noNaver) {
    const { bcode, lat, lng, ...where } = await zigbang.place(head.complex_id);
    if (noNaver) {
      /* 네이버 부동산의 그 단지 — KB가 단지마다 네이버 단지 코드를 알려준다 */
      let nid = "";
      try { nid = await kb.naverId({ bcode, lat, lng, name: head.complex_name }); }
      catch (e) { /* 다음에 다시 */ }
      if (nid) group.forEach((w) => { if (!w.naver_id) note(w.id, { naver_id: nid }); });
    }
    if (noPlace) group.forEach((w) => { if (!w.lawd_cd) note(w.id, where); });
    if (noHgnn) {
      /* 호갱노노의 그 단지. 못 찾았으면 "-"로 적어 두어 열 때마다 다시 묻지 않는다 */
      let id = "";
      try { id = (await hogangnono.find(head.complex_name, { bcode, jibun: where.jibun })) || "-"; }
      catch (e) { /* 다음에 다시 */ }
      if (id) group.forEach((w) => { if (!w.hgnn_id) note(w.id, { hgnn_id: id }); });
    }
  }
  for (const id of Object.keys(patches)) await data.patchWatch(id, patches[id]);
  return group.map((w) => Object.assign({}, w, patches[w.id]));
}

/* 실거래가 for one group; returns how many deals were found. `budget` is how
   many older months this call may reach back for (see molit.plan). */
async function refreshDeals(data, group, cache, budget) {
  if (!molit.enabled()) return 0;
  const todo = molit.plan(group, budget == null ? 60 : budget);
  const found = await molit.deals(group, cache || {}, todo.months);
  let n = 0;
  for (const w of group) {
    if (!found || !found[w.id]) continue;
    const fields = { deals: molit.merge(w.deals, found[w.id]), deals_at: new Date().toISOString() };
    try { await data.patchWatch(w.id, { ...fields, deals_from: todo.from }); }
    catch (e) {
      /* db/schema.sql을 아직 다시 실행하지 않아 deals_from 칸이 없을 때 — 거래는 남긴다 */
      if (!/deals_from/.test(String(e.message))) throw e;
      await data.patchWatch(w.id, fields);
    }
    n += found[w.id].length;
  }
  return n;
}

/* What is listed right now, without recording it. */
async function peek(watch) {
  const fetched = await fetchGroup([watch]);
  const made = listingsFor(watch, fetched, null);
  return {
    watch_id: watch.id, slot: "now", taken_at: new Date().toISOString(),
    ...stats(made.listings), listings: made.listings, sources: made.sources
  };
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
    let group = groups[key];
    const head = group[0];
    if (!first) await pause(400);          /* 남의 서버다 — 몰아치지 않는다 */
    first = false;

    try { group = await ensure(data, group); }
    catch (e) { report.failed.push({ complex: head.complex_name, source: "단지 정보", error: why(e) }); }

    const fetched = await fetchGroup(group);
    fetched.failed.forEach((f) => report.failed.push(f));
    if (Object.keys(fetched.got).length) {
      const taken = new Date().toISOString();
      for (const w of group) {
        const made = listingsFor(w, fetched, await data.snapshot(w.id, slot));
        await data.putSnapshot({ watch_id: w.id, slot, taken_at: taken, ...stats(made.listings), ...made });
        report.saved++;
      }
    }

    try { if (molit.enabled()) report.deals += await refreshDeals(data, group, cache); }
    catch (e) { report.failed.push({ complex: head.complex_name, source: "실거래가", error: why(e) }); }
  }
  return report;
}

/*
 * 네이버 매물 한 쪽을 남이 대신 받아다 줬을 때 (api/relay.js) 오늘 기록에 끼워 넣는다.
 * 1쪽이 오면 그 단지 · 거래의 오늘 네이버 매물을 새로 시작하고, 다음 쪽은 거기에 보탠다.
 * → 몇 개의 관심에 몇 건이 들어갔는지
 */
async function absorbNaver(data, where, page) {
  const slot = slotOf();
  const group = ((await data.watches()) || []).filter((w) => w.naver_id === where.complexId && w.trade === where.trade);
  let kept = 0;
  for (const w of group) {
    const before = await data.snapshot(w.id, slot);
    const old = (before && before.listings) || [];
    const others = old.filter((l) => (l.src || "zigbang") !== "naver");
    const mine = where.page > 1 ? old.filter((l) => l.src === "naver") : [];
    const seen = {};
    mine.forEach((l) => { seen[l.id] = true; });
    page.listings.filter((l) => naver.sameType(l, w)).forEach((l) => {
      if (!seen[l.id]) { seen[l.id] = true; mine.push(keep(l)); }
    });
    const listings = others.concat(mine).sort((a, b) => a.price - b.price);
    await data.putSnapshot({
      watch_id: w.id, slot, taken_at: new Date().toISOString(), ...stats(listings), listings,
      sources: Object.assign({}, before && before.sources, { naver: "ok" })
    });
    kept += mine.length;
  }
  return { watches: group.length, listings: kept };
}

module.exports = { run, peek, ensure, refreshDeals, absorbNaver, slotOf, stats, PLATFORMS };
