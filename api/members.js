/*
 * Who has signed in, and who may edit.
 *
 *   GET  /api/members                              -> { ok, members }
 *   POST /api/members  { id, canEdit }             -> { ok }   (owner only)
 *
 * The owner can never be demoted here — there would be nobody left to let
 * anyone back in.
 */
const lib = require("./_core.js");

module.exports = async function handler(req, res) {
  const cfg = lib.env();
  if (cfg.missing.length) return lib.setupError(res, cfg.missing);

  const who = lib.session(req, cfg.secret);
  if (!who) return lib.json(res, 401, { ok: false, error: "signin" });

  const store = lib.db(cfg);
  try {
    const row = await lib.member(store, who.id);
    if (!row) return lib.json(res, 401, { ok: false, error: "signin" });

    if (req.method === "GET") {
      const rows = (await store.select("members", "select=*&order=joined_at.asc")) || [];
      return lib.json(res, 200, {
        ok: true,
        /* 명단으로 정해둔 경우에는 표가 아니라 명단이 답이고, 화면의 스위치도
           의미가 없다 — locked로 알린다. */
        locked: lib.membersLocked(),
        members: rows.map((m) => ({
          id: m.kakao_id, name: m.name, avatar: m.avatar,
          canEdit: lib.isEditor(m), isOwner: lib.isOwner(m), you: m.kakao_id === who.id
        }))
      });
    }

    if (req.method === "POST") {
      if (!lib.isOwner(row)) return lib.json(res, 403, { ok: false, error: "owner" });
      if (lib.membersLocked()) return lib.json(res, 403, { ok: false, error: "locked" });
      const body = await lib.readBody(req, 4096);
      const id = String((body && body.id) || "");
      if (!id) return lib.json(res, 400, { ok: false, error: "id" });

      const target = await lib.member(store, id);
      if (!target) return lib.json(res, 404, { ok: false, error: "unknown" });
      if (lib.isOwner(target)) return lib.json(res, 400, { ok: false, error: "owner" });

      await store.upsert("members", [{
        kakao_id: target.kakao_id, name: target.name, avatar: target.avatar,
        can_edit: !!body.canEdit, is_owner: false,
        joined_at: target.joined_at, seen_at: target.seen_at
      }]);
      return lib.json(res, 200, { ok: true });
    }

    res.setHeader("allow", "GET, POST");
    return lib.json(res, 405, { ok: false, error: "method" });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "store", message: String(e.message || e).slice(0, 300) });
  }
};
