/*
 * 카카오 로그인.
 *
 *   GET /api/auth?login    카카오 로그인 화면으로 보낸다
 *   GET /api/auth?code=…   카카오가 돌려보내는 자리 (콘솔의 Redirect URI: https://<주소>/api/auth)
 *   GET /api/auth?logout   로그아웃
 *
 * 주인(KAKAO_OWNER_ID)이면 쿠키를 주고 첫 화면으로, 아니면 그 계정의 회원번호를 보여준다 —
 * 처음 차릴 때 그 번호를 KAKAO_OWNER_ID에 넣으면 된다.
 */
const crypto = require("crypto");
const auth = require("./_auth.js");

const STATE = "estate_k";

function origin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const proto = String(req.headers["x-forwarded-proto"] || (/^(localhost|127\.)/.test(host) ? "http" : "https")).split(",")[0];
  return proto + "://" + host;
}

function go(res, to, setCookies) {
  res.statusCode = 302;
  if (setCookies) res.setHeader("set-cookie", setCookies);
  res.setHeader("location", to);
  res.setHeader("cache-control", "no-store");
  res.end();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function page(res, code, title, lines) {
  res.statusCode = code;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>BEMESTATE</title><style>:root{color-scheme:light dark}body{max-width:400px;margin:18vh auto 0;padding:0 24px;' +
    'font:15px/1.6 -apple-system,"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all}' +
    'h1{font-size:20px;letter-spacing:-.02em}code{font-size:16px;font-weight:700;user-select:all}p{opacity:.8}a{color:#1F5FD6}</style>' +
    '<h1>' + esc(title) + '</h1>' + lines.map((l) => '<p>' + l + '</p>').join("") + '<p><a href="/">BEMESTATE로 돌아가기</a></p></html>');
}

async function kakao(url, init) {
  const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(8000) }, init));
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error((data && (data.error_description || data.msg)) || "카카오 오류 " + res.status);
  return data;
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const q = url.searchParams;

  if (q.has("logout")) return go(res, "/", [auth.clearCookie(req)]);

  if (!auth.enabled() || !auth.secret()) {
    return page(res, 200, "카카오 로그인이 아직 차려지지 않았습니다",
      ["Vercel 환경변수 <code>KAKAO_REST_KEY</code>를 넣고 다시 배포해 주세요."]);
  }
  const redirect = origin(req) + "/api/auth";

  if (q.has("login")) {
    const state = crypto.randomBytes(16).toString("base64url");
    return go(res, "https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=" +
      encodeURIComponent(process.env.KAKAO_REST_KEY) + "&redirect_uri=" + encodeURIComponent(redirect) +
      "&state=" + state, [auth.cookie(STATE, state, 600, req)]);
  }

  if (q.get("error")) return page(res, 200, "로그인을 마치지 못했습니다", [esc(q.get("error_description") || q.get("error"))]);

  const code = q.get("code");
  if (!code) return go(res, "/");
  const sent = auth.cookies(req)[STATE];
  if (!sent || !auth.same(sent, q.get("state") || "")) {
    return page(res, 400, "로그인을 마치지 못했습니다", ["로그인 요청이 이 브라우저에서 시작된 것이 아닙니다. 다시 시도해 주세요."]);
  }

  try {
    const form = new URLSearchParams({
      grant_type: "authorization_code", client_id: process.env.KAKAO_REST_KEY, redirect_uri: redirect, code
    });
    if (process.env.KAKAO_CLIENT_SECRET) form.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
    const token = await kakao("https://kauth.kakao.com/oauth/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form.toString()
    });
    const me = await kakao("https://kapi.kakao.com/v2/user/me", { headers: { authorization: "Bearer " + token.access_token } });
    const id = String(me.id || "");
    if (!id) throw new Error("카카오가 회원번호를 주지 않았습니다.");

    res.setHeader("set-cookie", [auth.cookie(STATE, "", 0, req)]);
    if (!auth.ownerId()) {
      return page(res, 200, "주인 계정을 정해 주세요", [
        "이 카카오 계정의 회원번호는 <code>" + esc(id) + "</code> 입니다.",
        "Vercel 환경변수 <code>KAKAO_OWNER_ID</code>에 이 번호를 넣고 다시 배포하면, 이 계정만 편집할 수 있습니다."
      ]);
    }
    if (!auth.same(id, auth.ownerId())) {
      return page(res, 403, "이 계정으로는 편집할 수 없습니다", ["BEMESTATE는 주인 계정만 고칠 수 있습니다. 보는 것은 누구나 할 수 있습니다."]);
    }
    return go(res, "/", [auth.cookie(STATE, "", 0, req), auth.sessionCookie(req, id)]);
  } catch (e) {
    return page(res, 502, "로그인을 마치지 못했습니다", [esc(String(e.message || e).slice(0, 200))]);
  }
};
