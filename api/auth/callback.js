/* Kakao sends the browser back here with a code. Trade it for a token, ask who
   it belongs to, write the session cookie, and return to the page. */
const lib = require("../_core.js");

const KAKAO_TOKEN = process.env.KAKAO_TOKEN_URL || "https://kauth.kakao.com/oauth/token";
const KAKAO_ME = process.env.KAKAO_ME_URL || "https://kapi.kakao.com/v2/user/me";

function bounce(res, to) {
  res.statusCode = 302;
  res.setHeader("location", to);
  res.setHeader("cache-control", "no-store");
  res.end();
}

module.exports = async function handler(req, res) {
  const cfg = lib.env();
  if (cfg.missing.length) return lib.setupError(res, cfg.missing);

  const url = new URL(req.url, "http://x");
  const code = url.searchParams.get("code");
  const state = lib.unsign(url.searchParams.get("state"), cfg.secret);
  if (!code || !state) return bounce(res, "/?login=failed");

  try {
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.kakaoKey,
      redirect_uri: lib.origin(req) + "/api/auth/callback",
      code
    });
    if (cfg.kakaoSecret) form.set("client_secret", cfg.kakaoSecret);

    const tokenRes = await fetch(KAKAO_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: form.toString()
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) return bounce(res, "/?login=failed");

    const meRes = await fetch(KAKAO_ME, {
      headers: { authorization: "Bearer " + token.access_token }
    });
    const me = await meRes.json();
    if (!meRes.ok || !me.id) return bounce(res, "/?login=failed");

    const profile = {
      id: String(me.id),
      name: (me.properties && me.properties.nickname) ||
            (me.kakao_account && me.kakao_account.profile && me.kakao_account.profile.nickname) || "",
      avatar: (me.properties && me.properties.thumbnail_image) ||
              (me.kakao_account && me.kakao_account.profile && me.kakao_account.profile.thumbnail_image_url) || ""
    };

    const store = lib.db(cfg);
    const row = await lib.touchMember(store, profile);

    lib.setSession(res, {
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      owner: !!row.is_owner,
      exp: Date.now() + 30 * 24 * 3600 * 1000
    }, cfg.secret);

    const next = state.next && state.next.indexOf("#") === 0 ? state.next : "";
    return bounce(res, "/" + next);
  } catch (e) {
    return bounce(res, "/?login=failed");
  }
};
