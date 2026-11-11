/*
 * The watch list and what was recorded for it.
 *
 *   GET  /api/watch                 -> { ok, me, canWrite, canSignIn, sources, watches, series }
 *                                      series: { watchId: [summary…] } oldest first
 *   GET  /api/watch?id=W            -> { ok, watch, history }            every snapshot's numbers
 *   GET  /api/watch?id=W&slot=S     -> { ok, snapshot, previous }        the 호가 list of one, and
 *                                                                        of the one before it
 *   POST /api/watch { add: { source, complexId, complexName, address, trade, types:[{id,label}] } }
 *   POST /api/watch { remove: id }
 */
const lib = require("./_core.js");
const { open, asker } = require("./_data.js");
const { run, SOURCES } = require("../collect/run.js");

const PER_WATCH = 28;      /* two weeks of half-days on the list screen */
const MAX_WATCHES = 40;

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max); }

module.exports = async function handler(req, res) {
  const home = open();
  if (home.missing.length) return lib.setupError(res, home.missing);
  const data = home.data;

  try {
    const who = await asker(req, home);
    const url = new URL(req.url, "http://x");

    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) {
        const [watches, rows] = await Promise.all([data.watches(), data.summaries()]);
        const series = {};
        (rows || []).forEach((s) => {
          const list = (series[s.watch_id] = series[s.watch_id] || []);
          if (list.length < PER_WATCH) list.unshift(s);
        });
        return lib.json(res, 200, {
          ok: true, me: who.me, canWrite: who.canWrite, canSignIn: who.canSignIn,
          sources: Object.keys(SOURCES).map((k) => ({ key: k, name: SOURCES[k].name })),
          watches: watches || [], series
        });
      }

      const slot = url.searchParams.get("slot");
      if (!slot) {
        const [watches, history] = await Promise.all([data.watches(), data.history(id)]);
        const watch = (watches || []).find((w) => w.id === id);
        if (!watch) return lib.json(res, 404, { ok: false, error: "unknown" });
        return lib.json(res, 200, { ok: true, watch, history: (history || []).reverse() });
      }

      if (!/^\d{4}-\d{2}-\d{2}T(00|12)$/.test(slot)) return lib.json(res, 400, { ok: false, error: "slot" });
      const history = (await data.history(id)) || [];
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
      if (!who.canWrite) return lib.json(res, 403, { ok: false, error: who.me ? "readonly" : "signin" });
      const body = await lib.readBody(req, 16384);

      if (body && body.remove) {
        await data.removeWatch(clean(body.remove, 80));
        return lib.json(res, 200, { ok: true });
      }

      const add = body && body.add;
      if (!add) return lib.json(res, 400, { ok: false, error: "empty" });
      const source = SOURCES[add.source];
      const complexId = clean(add.complexId, 12);
      const types = Array.isArray(add.types) ? add.types.slice(0, 12) : [];
      if (!source || !/^\d+$/.test(complexId) || !source.TRADES[add.trade] || !types.length ||
          !clean(add.complexName, 60)) {
        return lib.json(res, 400, { ok: false, error: "body" });
      }

      const existing = (await data.watches()) || [];
      if (existing.length + types.length > MAX_WATCHES) {
        return lib.json(res, 400, { ok: false, error: "full", message: "관심 평형은 " + MAX_WATCHES + "개까지 등록할 수 있습니다." });
      }
      let ord = existing.reduce((m, w) => Math.max(m, Number(w.ord) || 0), 0);
      const added = [];
      for (const t of types) {
        const typeId = clean(t && t.id, 12);
        if (!/^\d+$/.test(typeId)) return lib.json(res, 400, { ok: false, error: "body" });
        const id = [source.key, complexId, typeId, add.trade].join("-");
        if (existing.some((w) => w.id === id)) continue;       /* 이미 보고 있는 평형 */
        await data.putWatch({
          id, source: source.key, complex_id: complexId,
          complex_name: clean(add.complexName, 60), address: clean(add.address, 80),
          room_type_id: typeId, room_label: clean(t.label, 30), trade: add.trade,
          ord: ++ord, created_at: new Date().toISOString()
        });
        added.push(id);
      }

      /* 등록하자마자 첫 숫자가 보이도록 지금 한 번 받아 둔다. 실패해도 등록은 된 것이다 —
         다음 정각에 다시 받는다. */
      let first = null;
      if (added.length) {
        try { first = await run(data, { only: added, onlyMissing: true }); }
        catch (e) { first = { failed: [{ error: String(e.message || e).slice(0, 200) }] }; }
      }
      return lib.json(res, 200, { ok: true, added, first });
    }

    res.setHeader("allow", "GET, POST");
    return lib.json(res, 405, { ok: false, error: "method" });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "store", message: String(e.message || e).slice(0, 300) });
  }
};
