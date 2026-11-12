/*
 * 누가 고칠 수 있는가 — 카카오로 로그인한 주인 한 사람.
 *
 *   KAKAO_REST_KEY        카카오 개발자 콘솔의 REST API 키
 *   KAKAO_OWNER_ID        고칠 수 있는 카카오 계정의 회원번호 (처음 로그인하면 화면이 알려준다)
 *   KAKAO_CLIENT_SECRET   콘솔에서 Client Secret을 켰을 때만
 *
 * 로그인하면 서명한 쿠키 하나를 준다. 그 안에는 회원번호와 만료 시각뿐이고, 서명은
 * SESSION_SECRET(없으면 CRON_SECRET)으로 한다. 보는 것은 누구나 한다.
 *
 * KAKAO_REST_KEY가 없으면 로그인을 차릴 수 없으므로 잠그지 않는다 — 내 컴퓨터에서
 * `node dev.js`로 돌릴 때가 그렇다.
 */
const crypto = require("crypto");

const COOKIE = "estate_s";
const DAYS = 30;

const enabled = () => !!process.env.KAKAO_REST_KEY;
const ownerId = () => String(process.env.KAKAO_OWNER_ID || "").trim();
function secret() {
  return process.env.SESSION_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

const mac = (text) => crypto.createHmac("sha256", secret()).update(text).digest("base64url");
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((part) => {
    const at = part.indexOf("=");
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  });
  return out;
}

function cookie(name, value, maxAge, req) {
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || ""));
  return name + "=" + value + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAge + (local ? "" : "; Secure");
}

/* 로그인한 사람의 회원번호. 없거나 서명이 틀리거나 지났으면 "" */
function who(req) {
  if (!secret()) return "";
  const [body, sig] = String(cookies(req)[COOKIE] || "").split(".");
  if (!body || !sig || !same(sig, mac(body))) return "";
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString());
    return s && s.exp > Date.now() ? String(s.id) : "";
  } catch (e) { return ""; }
}

/* 이 요청이 고쳐도 되는가 */
function mayEdit(req) {
  if (!enabled()) return true;
  const id = who(req);
  return !!id && !!ownerId() && same(id, ownerId());
}

function sessionCookie(req, id) {
  const body = Buffer.from(JSON.stringify({ id: String(id), exp: Date.now() + DAYS * 86400000 })).toString("base64url");
  return cookie(COOKIE, body + "." + mac(body), DAYS * 86400, req);
}
const clearCookie = (req) => cookie(COOKIE, "", 0, req);

module.exports = { enabled, ownerId, secret, mac, same, cookies, cookie, who, mayEdit, sessionCookie, clearCookie };
