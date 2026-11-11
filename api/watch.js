/*
 * The watch list and what was recorded for it.
 *
 *   GET  /api/watch                 -> { ok, deals, watches, series }
 *                                      series: { watchId: [summary…] } oldest first
 *                                      deals: whether 실거래가 is switched on
 *   GET  /api/watch?id=W            -> { ok, watch, history }            every day's numbers, and
 *                                                                        the watch with its 실거래
 *   GET  /api/watch?id=W&slot=S     -> { ok, snapshot, previous }        the 호가 list of one day,
 *                                                                        and of the one before it
 *   GET  /api/watch?id=W&slot=now   -> the same, asked of the platforms right now (not recorded)
 *   POST /api/watch { add: { complexId, complexName, address, trade, naver,
 *                            types:[{ id, label, supply, exclusive }] } }
 *   POST /api/watch { link: { complexId, naver } }    네이버 단지를 잇거나("" 이면) 끊는다
 *   POST /api/watch { remove: id }
 */
const lib = require("./_core.js");
const { open } = require("./_data.js");
const { run, peek, ensure, refreshDeals } = require("../collect/run.js");
const zigbang = require("../collect/zigbang.js");
const naver = require("../collect/naver.js");
const molit = require("../collect/molit.js");

const PER_WATCH = 30;      /* a month of days on the list screen */
const MAX_WATCHES = 40;
const SLOT = /^\d{4}-\d{2}-\d{2}(T12)?$/;
/* 예전에는 하루 두 번(…T00 · …T12) 기록했다. 00시 것은 더 보여주지 않는다 —
   db/schema.sql을 다시 실행하면 표에서도 지워진다. */
const current = (rows) => (rows || []).filter((s) => !/T00$/.test(s.slot));

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max); }
const area = (v) => { const n = Number(v); return n > 0 && n < 1000 ? Math.round(n * 100) / 100 : null; };

/* 목록에는 실거래 전부가 아니라 가장 최근 한 건만 실어 보낸다 */
function brief(w) {
  const { deals, ...rest } = w;
  const last = (deals || []).filter((d) => !d.canceled)[0] || null;
  return { ...rest, last_deal: last };
}

module.exports = async function handler(req, res) {
  const home = open();
  if (home.missing.length) return lib.setupError(res, home.missing);
  const data = home.data;

  try {
    const url = new URL(req.url, "http://x");

    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) {
        const [watches, rows] = await Promise.all([data.watches(), data.summaries()]);
        const series = {};
        current(rows).forEach((s) => {
          const list = (series[s.watch_id] = series[s.watch_id] || []);
          if (list.length < PER_WATCH) list.unshift(s);
        });
        return lib.json(res, 200, { ok: true, deals: molit.enabled(), watches: (watches || []).map(brief), series });
      }

      const slot = url.searchParams.get("slot");
      if (!slot) {
        const watches = (await data.watches()) || [];
        let watch = watches.find((w) => w.id === id);
        if (!watch) return lib.json(res, 404, { ok: false, error: "unknown" });
        /* 면적이나 주소를 아직 모르는 관심(예전에 등록한 것)은 열 때 채운다. 그래야
           실거래가를 가려낼 수 있다. 채웠으면 실거래가도 그 자리에서 한 번 받는다. */
        /* 실거래가: 한 번도 못 받았거나, 5년치를 아직 다 못 거슬러 갔거나, 비어 있는 채로
           10분이 지났으면 여는 김에 받는다 — 다음 수집까지 기다리지 않게 */
        const stale = molit.enabled() && (!watch.deals_at || !molit.complete(watch) ||
          (!(watch.deals || []).length && Date.now() - Date.parse(watch.deals_at) > 600 * 1000));
        const fresh = !Number(watch.exclusive_m2) || !watch.lawd_cd || stale;
        if (fresh || !watch.hgnn_id || !watch.naver_id) {
          try {
            const group = await ensure(data, watches.filter((w) => w.complex_id === watch.complex_id && w.trade === watch.trade));
            if (fresh) await refreshDeals(data, group, {}, 30);
            watch = ((await data.watches()) || []).find((w) => w.id === id) || watch;
          } catch (e) { watch = { ...watch, deals_error: String(e.message || e).slice(0, 160) }; }
        }
        const history = current(await data.history(id));
        return lib.json(res, 200, { ok: true, watch: { ...watch, deals_complete: molit.complete(watch) }, history: history.reverse() });
      }

      /* 현재: 지금 올라와 있는 것을 받아 보여주기만 한다 (기록하지 않는다) */
      if (slot === "now") {
        const watch = ((await data.watches()) || []).find((w) => w.id === id);
        if (!watch) return lib.json(res, 404, { ok: false, error: "unknown" });
        const last = current(await data.history(id))[0];
        const [snapshot, previous] = await Promise.all([peek(watch), last ? data.snapshot(id, last.slot) : null]);
        if (!Object.keys(snapshot.sources).some((k) => snapshot.sources[k] === "ok")) {
          return lib.json(res, 502, { ok: false, error: "source", message: "지금은 매물을 받아오지 못했습니다." });
        }
        return lib.json(res, 200, { ok: true, snapshot, previous });
      }

      if (!SLOT.test(slot)) return lib.json(res, 400, { ok: false, error: "slot" });
      const history = current(await data.history(id));
      const at = history.findIndex((s) => s.slot === slot);
      if (at < 0) return lib.json(res, 404, { ok: false, error: "unknown" });
      const before = history[at + 1];
      const [snapshot, previous] = await Promise.all([
        data.snapshot(id, slot),
        before ? data.snapshot(id, before.slot) : null
      ]);
      return lib.json(res, 200, { ok: true, snapshot, previous });
    }

    if (req.method === "POST") {
      const body = await lib.readBody(req, 16384);

      if (body && body.remove) {
        await data.removeWatch(clean(body.remove, 80));
        return lib.json(res, 200, { ok: true });
      }

      const existing = (await data.watches()) || [];

      if (body && body.link) {
        const complexId = clean(body.link.complexId, 12);
        const given = clean(body.link.naver, 200);
        const naverId = naver.complexNo(given);
        if (given && !naverId) {
          return lib.json(res, 400, { ok: false, error: "naver", message: "네이버 부동산 단지 주소나 번호를 확인해 주세요." });
        }
        const mine = existing.filter((w) => w.complex_id === complexId);
        if (!mine.length) return lib.json(res, 404, { ok: false, error: "unknown" });
        for (const w of mine) await data.patchWatch(w.id, { naver_id: naverId });
        let first = null;
        if (naverId) {
          try { first = await run(data, { only: mine.map((w) => w.id) }); }
          catch (e) { first = { failed: [{ error: String(e.message || e).slice(0, 200) }] }; }
        }
        return lib.json(res, 200, { ok: true, naverId, first });
      }

      const add = body && body.add;
      if (!add) return lib.json(res, 400, { ok: false, error: "empty" });
      const complexId = clean(add.complexId, 12);
      const types = Array.isArray(add.types) ? add.types.slice(0, 12) : [];
      if (!/^\d+$/.test(complexId) || !zigbang.TRADES[add.trade] || !types.length || !clean(add.complexName, 60)) {
        return lib.json(res, 400, { ok: false, error: "body" });
      }
      if (existing.length + types.length > MAX_WATCHES) {
        return lib.json(res, 400, { ok: false, error: "full", message: "관심 평형은 " + MAX_WATCHES + "개까지 등록할 수 있습니다." });
      }

      /* 같은 단지를 이미 보고 있으면 그 단지의 네이버 번호와 주소를 물려받는다 */
      const sibling = existing.find((w) => w.complex_id === complexId);
      const naverId = naver.complexNo(clean(add.naver, 200)) || (sibling && sibling.naver_id) || "";
      let where = sibling ? { lawd_cd: sibling.lawd_cd, dong_name: sibling.dong_name, jibun: sibling.jibun } : null;
      if (!where || !where.lawd_cd) {
        try { const { bcode, lat, lng, ...rest } = await zigbang.place(complexId); where = rest; }
        catch (e) { where = { lawd_cd: "", dong_name: "", jibun: "" }; }
      }

      let ord = existing.reduce((m, w) => Math.max(m, Number(w.ord) || 0), 0);
      const added = [];
      for (const t of types) {
        const typeId = clean(t && t.id, 12);
        if (!/^\d+$/.test(typeId)) return lib.json(res, 400, { ok: false, error: "body" });
        const id = ["zigbang", complexId, typeId, add.trade].join("-");
        if (existing.some((w) => w.id === id)) continue;       /* 이미 보고 있는 평형 */
        await data.putWatch({
          id, source: "zigbang", complex_id: complexId,
          complex_name: clean(add.complexName, 60), address: clean(add.address, 80),
          room_type_id: typeId, room_label: clean(t.label, 30), trade: add.trade,
          naver_id: naverId, supply_m2: area(t.supply), exclusive_m2: area(t.exclusive),
          lawd_cd: clean(where.lawd_cd, 5), dong_name: clean(where.dong_name, 30), jibun: clean(where.jibun, 20),
          hgnn_id: (sibling && sibling.hgnn_id) || "", deals: [], ord: ++ord, created_at: new Date().toISOString()
        });
        added.push(id);
      }

      /* 등록하자마자 첫 숫자가 보이도록 지금 한 번 받아 둔다. 실패해도 등록은 된 것이다 —
         다음 수집 때 다시 받는다. */
      let first = null;
      if (added.length) {
        try { first = await run(data, { only: added }); }
        catch (e) { first = { saved: 0, failed: [{ error: String(e.message || e).slice(0, 200) }] }; }
      }
      return lib.json(res, 200, { ok: true, added, first });
    }

    res.setHeader("allow", "GET, POST");
    return lib.json(res, 405, { ok: false, error: "method" });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "store", message: String(e.message || e).slice(0, 300) });
  }
};
