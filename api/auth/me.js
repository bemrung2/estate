/* Who is looking, and what are they allowed to do. */
const lib = require("../_core.js");

module.exports = async function handler(req, res) {
  const cfg = lib.env();
  if (cfg.missing.length) return lib.setupError(res, cfg.missing);

  const who = lib.session(req, cfg.secret);
  if (!who) return lib.json(res, 200, { ok: true, signedIn: false, loginRequired: lib.loginRequired() });

  try {
    const row = await lib.member(lib.db(cfg), who.id);
    if (!row) return lib.json(res, 200, { ok: true, signedIn: false, loginRequired: lib.loginRequired() });
    return lib.json(res, 200, {
      ok: true, signedIn: true, loginRequired: lib.loginRequired(),
      me: { id: row.kakao_id, name: row.name, avatar: row.avatar, canEdit: !!row.can_edit, isOwner: !!row.is_owner }
    });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "store", message: String(e.message || e).slice(0, 300) });
  }
};
