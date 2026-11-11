/*
 * 네이버 부동산을 서버 대신 받아다 주는 길.
 *
 * 네이버는 클라우드 서버(서울 리전 포함)의 연결을 받지 않는다. 그래서 네이버가 받아주는
 * 기기 — 내 폰이나 집 컴퓨터 — 가 네이버에서 받아 여기로 넘긴다. 서버는 어떤 주소를 받아
 * 오면 되는지 알려주고, 넘겨받은 것을 오늘 기록에 끼워 넣는다.
 *
 *   GET  /api/relay?key=<CRON_SECRET>
 *        -> { ok, urls: ["https://m.land.naver.com/…", …] }   받아 올 주소들
 *   POST /api/relay?key=<CRON_SECRET>   { url, body }
 *        url  = 위에서 받은 주소 하나,  body = 그 주소가 준 답 (글자 그대로든 JSON이든)
 *        -> { ok, watches, listings }
 *
 * 아이폰 단축어로 하루 한 번 자동으로 돌리는 법은 README의 '네이버 부동산'에 있다.
 * 열쇠(key)가 맞아야 한다 — 아무나 기록에 매물을 끼워 넣지 못하게.
 */
const lib = require("./_core.js");
const { open } = require("./_data.js");
const { absorbNaver } = require("../collect/run.js");
const naver = require("../collect/naver.js");

const PAGES = 5;      /* 단지 · 거래마다 100건까지. 가격순이라 싼 것부터 담긴다 */

module.exports = async function handler(req, res) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const url = new URL(req.url, "http://x");
  /* 열쇠를 주소창에 그대로 붙여넣으면 '+'가 빈칸으로, '%'가 엉뚱하게 읽힌다(base64로 만든
     열쇠에 흔하다). 주소에 적힌 그대로도, 풀어 읽은 것도 받아준다. */
  const raw = ((req.url.split("?")[1] || "").split("&").find((kv) => kv.indexOf("key=") === 0) || "").slice(4);
  let unescaped = raw;
  try { unescaped = decodeURIComponent(raw); } catch (e) { /* 그대로 둔다 */ }
  const tries = [raw, unescaped, url.searchParams.get("key") || "",
    (req.headers.authorization || "").replace(/^Bearer /, "")].map((k) => k.trim());
  const given = tries.indexOf(secret) >= 0 ? secret : "";
  if (!secret) return lib.json(res, 200, { ok: false, error: "setup", message: "CRON_SECRET 환경변수가 없습니다." });
  if (given !== secret) {
    return lib.json(res, 401, {
      ok: false, error: "key",
      message: "열쇠가 맞지 않습니다. 주소의 key= 뒤에 Vercel 환경변수 CRON_SECRET의 값을 그대로 넣어 주세요 " +
        "(<CRON_SECRET>이라는 글자가 아니라 그 값)."
    });
  }

  const home = open();
  if (home.missing.length) return lib.setupError(res, home.missing);
  try {
    if (req.method === "GET") {
      const seen = {}, urls = [];
      ((await home.data.watches()) || []).forEach((w) => {
        const k = w.naver_id + "|" + w.trade;
        if (!w.naver_id || seen[k]) return;
        seen[k] = true;
        for (let n = 1; n <= PAGES; n++) urls.push(naver.pageUrl(w.naver_id, w.trade, n));
      });
      return lib.json(res, 200, { ok: true, urls });
    }
    if (req.method === "POST") {
      const sent = await lib.readBody(req, 2 << 20);
      const where = naver.readUrl(sent && sent.url);
      if (!where) return lib.json(res, 400, { ok: false, error: "url" });
      let page;
      try { page = naver.parsePage(sent.body); }
      catch (e) { return lib.json(res, 400, { ok: false, error: "body", message: String(e.message).slice(0, 200) }); }
      /* 빈 쪽(매물이 그 앞에서 끝났다)은 지나친다 — 1쪽이 비었으면 오늘은 매물이 없는 것 */
      if (!page.listings.length && where.page > 1) return lib.json(res, 200, { ok: true, watches: 0, listings: 0 });
      return lib.json(res, 200, { ok: true, ...(await absorbNaver(home.data, where, page)) });
    }
    res.setHeader("allow", "GET, POST");
    return lib.json(res, 405, { ok: false, error: "method" });
  } catch (e) {
    return lib.json(res, 502, { ok: false, error: "store", message: String(e.message || e).slice(0, 300) });
  }
};
