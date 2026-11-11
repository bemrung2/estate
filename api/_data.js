/*
 * Where the watch list and the snapshots live.
 *
 * Two homes, one shape:
 *
 *   Supabase   estate_watches · estate_snapshots (db/schema.sql). The real one.
 *   a file     ESTATE_FILE_DB=<path>. For running on your own machine with
 *              `node dev.js` — no account needed.
 *
 * Prices are whole 만원 everywhere. A slot is the day a snapshot belongs to,
 * in Korean time: "2026-11-11".
 */
const fs = require("fs");
const lib = require("./_core.js");

const SUMMARY = "watch_id,slot,taken_at,count,min_price,med_price,max_price,sources";

function supabase(cfg) {
  const db = lib.db(cfg);
  const eq = (v) => "eq." + encodeURIComponent(v);
  return {
    kind: "supabase",
    watches: () => db.select("estate_watches", "select=*&order=ord.asc,created_at.asc"),
    putWatch: (row) => db.upsert("estate_watches", [row]),
    patchWatch: (id, fields) => db.update("estate_watches", "id=" + eq(id), fields),
    removeWatch: (id) => db.remove("estate_watches", "id=" + eq(id)),
    /* every watch's recent numbers, newest first — the list screen's sparkline */
    summaries: (limit) => db.select("estate_snapshots",
      "select=" + SUMMARY + "&order=slot.desc&limit=" + (limit || 2000)),
    history: (watchId) => db.select("estate_snapshots",
      "select=" + SUMMARY + "&watch_id=" + eq(watchId) + "&order=slot.desc&limit=800"),
    async snapshot(watchId, slot) {
      const rows = await db.select("estate_snapshots",
        "select=*&watch_id=" + eq(watchId) + "&slot=" + eq(slot));
      return rows && rows.length ? rows[0] : null;
    },
    putSnapshot: (row) => db.upsert("estate_snapshots", [row])
  };
}

function file(path) {
  function read() {
    try { return JSON.parse(fs.readFileSync(path, "utf8")); }
    catch (e) { return { watches: [], snapshots: [] }; }
  }
  function write(all) { fs.writeFileSync(path, JSON.stringify(all)); }
  const brief = (s) => ({
    watch_id: s.watch_id, slot: s.slot, taken_at: s.taken_at, count: s.count,
    min_price: s.min_price, med_price: s.med_price, max_price: s.max_price, sources: s.sources
  });
  const newest = (a, b) => (a.slot < b.slot ? 1 : a.slot > b.slot ? -1 : 0);
  return {
    kind: "file",
    async watches() {
      return read().watches.sort((a, b) => (a.ord - b.ord) || (a.created_at < b.created_at ? -1 : 1));
    },
    async putWatch(row) {
      const all = read();
      all.watches = all.watches.filter((w) => w.id !== row.id).concat([row]);
      write(all);
    },
    async patchWatch(id, fields) {
      const all = read();
      all.watches = all.watches.map((w) => (w.id === id ? { ...w, ...fields } : w));
      write(all);
    },
    async removeWatch(id) {
      const all = read();
      all.watches = all.watches.filter((w) => w.id !== id);
      all.snapshots = all.snapshots.filter((s) => s.watch_id !== id);
      write(all);
    },
    async summaries(limit) { return read().snapshots.sort(newest).slice(0, limit || 2000).map(brief); },
    async history(watchId) {
      return read().snapshots.filter((s) => s.watch_id === watchId).sort(newest).slice(0, 800).map(brief);
    },
    async snapshot(watchId, slot) {
      return read().snapshots.find((s) => s.watch_id === watchId && s.slot === slot) || null;
    },
    async putSnapshot(row) {
      const all = read();
      all.snapshots = all.snapshots
        .filter((s) => !(s.watch_id === row.watch_id && s.slot === row.slot)).concat([row]);
      write(all);
    }
  };
}

/* { data, missing } — `missing` names the settings that keep it shut */
function open() {
  if (process.env.ESTATE_FILE_DB) return { data: file(process.env.ESTATE_FILE_DB), missing: [] };
  const cfg = lib.env();
  return { data: cfg.missing.length ? null : supabase(cfg), missing: cfg.missing };
}

module.exports = { open };
