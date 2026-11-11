/* Send the browser to Kakao. The `state` carries a signed nonce and where to
   come back to, so a stray callback cannot be replayed at us. */
const lib = require("../_core.js");

const KAKAO_AUTH = process.env.KAKAO_AUTH_URL || "https://kauth.kakao.com/oauth/authorize";

module.exports = async function handler(req, res) {
  const cfg = lib.env();
  if (cfg.missing.length) return lib.setupError(res, cfg.missing);

  const url = new URL(req.url, "http://x");
  const next = url.searchParams.get("next") || "";
  const state = lib.sign({
    n: require("crypto").randomBytes(9).toString("base64url"),
    next: next.slice(0, 300),
    exp: Date.now() + 10 * 60 * 1000
  }, cfg.secret);

  const go = new URL(KAKAO_AUTH);
  go.searchParams.set("client_id", cfg.kakaoKey);
  go.searchParams.set("redirect_uri", lib.origin(req) + "/api/auth/callback");
  go.searchParams.set("response_type", "code");
  go.searchParams.set("state", state);

  res.statusCode = 302;
  res.setHeader("location", go.toString());
  res.setHeader("cache-control", "no-store");
  res.end();
};
