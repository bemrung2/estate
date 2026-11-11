/*
 * Where the watch list and the snapshots live.
 *
 * Two homes, one shape:
 *
 *   Supabase   estate_watches · estate_snapshots (db/schema.sql). The real one.
 *   a file     ESTATE_FILE_DB=<path>. For running on your own machine with
 *              `node dev.js` — no account needed.
 *
 * Prices are whole 만원 everywhere. A slot is the half-day a snapshot belongs
 * to, in Korean time: "2026-11-11T00" or "2026-11-11T12".
 */
const fs = require("fs");
const lib = require("./_core.js");

const SUMMARY = "watch_id,slot,taken_at,count,min_price,med_price,max_price";

function supabase(cfg) {
  const db = lib.db(cfg);
  const eq = (v) => "eq." + encodeURIComponent(v);
  return {
    kind: "supabase",
    watches: () => db.select("estate_watches", "select=*&order=ord.asc,created_at.asc"),
    putWatch: (row) => db.upsert("estate_watches", [row]),
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
    min_price: s.min_price, med_price: s.med_price, max_price: s.max_price
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

/* { data, cfg, missing } — `missing` names the settings that keep it shut */
function open() {
  const cfg = lib.env();
  if (process.env.ESTATE_FILE_DB) return { data: file(process.env.ESTATE_FILE_DB), cfg, missing: [] };
  const missing = cfg.missing.filter((name) => name.indexOf("SUPABASE") === 0);
  return { data: missing.length ? null : supabase(cfg), cfg, missing };
}

/* Who is asking, and may they change the list. Reading is open; writing takes
   a signed-in editor unless EDIT_OPEN=1 (see api/_core.js). */
async function asker(req, home) {
  let row = null;
  if (home.cfg.secret && home.data && home.data.kind === "supabase") {
    const who = lib.session(req, home.cfg.secret);
    if (who) row = await lib.member(lib.db(home.cfg), who.id);
  }
  return {
    me: row ? { name: row.name, avatar: row.avatar, canEdit: lib.isEditor(row), isOwner: lib.isOwner(row) } : null,
    canWrite: lib.editOpen() ? true : lib.isEditor(row),
    /* 로그인 자체가 아직 설정되지 않았으면 화면이 로그인 단추를 내밀지 않는다 */
    canSignIn: !!(home.cfg.kakaoKey && home.cfg.secret && home.data && home.data.kind === "supabase")
  };
}

module.exports = { open, asker };
