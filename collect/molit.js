/*
 * 실거래가 — 국토교통부 실거래가 공개 API (공공데이터포털, data.go.kr).
 *
 * MOLIT_SERVICE_KEY가 있어야 한다. 공공데이터포털에서 '국토교통부_아파트 매매 실거래가
 * 상세 자료'와 '국토교통부_아파트 전월세 실거래가 자료'를 활용신청하면 나오는 인증키
 * (Decoding 키)다. 없으면 실거래가는 비워 둔다 — 호가 기록은 그대로 된다.
 *
 * 한 번의 요청은 시군구 하나의 한 달치다. 단지는 법정동 + 지번으로, 평형은 전용
 * 면적으로 가려낸다.
 *
 * !! 주소는 응답을 확인했지만(키 없이 부르면 "SERVICE_KEY_IS_NULL"), 키가 없어 실제
 * 거래 목록은 받아보지 못했다. 필드 이름은 공개 명세를 따랐다.
 */
const BASE = "https://apis.data.go.kr/1613000/";
const PATH = {
  trade: "RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
  charter: "RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
};
const MONTHS = 3;
const KEEP = 200;

function key() { return process.env.MOLIT_SERVICE_KEY || ""; }

const num = (v) => Number(String(v == null ? "" : v).replace(/[,\s]/g, "")) || 0;
const pad = (n) => String(n).padStart(2, "0");

/* 이번 달부터 거슬러 MONTHS달: ["202611", "202610", "202609"] (한국 시간) */
function months(now) {
  const k = new Date((now || new Date()).getTime() + 9 * 3600 * 1000);
  const out = [];
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - i, 1));
    out.push(d.getUTCFullYear() + pad(d.getUTCMonth() + 1));
  }
  return out;
}

async function month(trade, lawd, ym) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const url = BASE + PATH[trade] + "?serviceKey=" + encodeURIComponent(key()) +
      "&LAWD_CD=" + lawd + "&DEAL_YMD=" + ym + "&numOfRows=1000&pageNo=" + page + "&_type=json";
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      const why = (text.match(/<returnAuthMsg>([^<]*)/) || text.match(/<errMsg>([^<]*)/) || [])[1];
      throw new Error("실거래가 API: " + (why || "HTTP " + res.status));
    }
    const body = (data.response && data.response.body) || {};
    const head = (data.response && data.response.header) || {};
    if (head.resultCode && !/^0+$/.test(String(head.resultCode))) throw new Error("실거래가 API: " + head.resultMsg);
    let items = (body.items && body.items.item) || [];
    if (!Array.isArray(items)) items = [items];
    items.forEach((it) => rows.push(it));
    if (rows.length >= num(body.totalCount) || !items.length) break;
  }
  return rows;
}

/* 지번은 "913", "913-2", "0913" 처럼 온다 */
const lot = (s) => String(s || "").trim().split("-").map((p) => String(parseInt(p, 10) || 0)).join("-").replace(/-0$/, "");
const plain = (s) => String(s || "").replace(/[\s()·.\-]/g, "");

function deal(trade, it) {
  if (trade === "charter" && num(it.monthlyRent) > 0) return null;      /* 월세는 전세가 아니다 */
  const date = it.dealYear + "-" + pad(it.dealMonth) + "-" + pad(it.dealDay);
  const price = num(trade === "trade" ? it.dealAmount : it.deposit);
  if (!price) return null;
  const floor = String(it.floor == null ? "" : it.floor).trim();
  return {
    id: [date, floor, price].join("/"),
    date, price, floor,
    canceled: !!String(it.cdealType || "").trim()
  };
}

/*
 * watches: one 단지 · 거래의 관심 평형들 (same lawd_cd · dong_name · jibun).
 * cache: { "trade|11710|202611": rows } — 같은 구의 다른 단지가 다시 묻지 않게.
 * → { watchId: [deal…] } 최근 것이 앞
 */
async function deals(watches, cache) {
  const head = watches[0];
  if (!key() || !head.lawd_cd || !PATH[head.trade]) return null;
  const rows = [];
  for (const ym of months()) {
    const k = [head.trade, head.lawd_cd, ym].join("|");
    if (!cache[k]) cache[k] = await month(head.trade, head.lawd_cd, ym);
    cache[k].forEach((r) => rows.push(r));
  }
  /* 지번이 맞는 것이 단지다. 지번을 모르면 이름으로 */
  const here = rows.filter((it) => head.jibun
    ? plain(it.umdNm) === plain(head.dong_name) && lot(it.jibun) === lot(head.jibun)
    : plain(it.aptNm) === plain(head.complex_name));
  const out = {};
  watches.forEach((w) => {
    const own = Number(w.exclusive_m2);
    if (!own) return;
    out[w.id] = here
      .filter((it) => Math.abs(num(it.excluUseAr) - own) <= 0.5)
      .map((it) => deal(w.trade, it)).filter(Boolean)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  });
  return out;
}

/* 전에 받아둔 것과 합친다 — 석 달이 지난 거래도 남는다 */
function merge(old, fresh) {
  const by = {};
  (old || []).forEach((d) => { by[d.id] = d; });
  (fresh || []).forEach((d) => { by[d.id] = d; });
  return Object.keys(by).map((k) => by[k])
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, KEEP);
}

module.exports = { enabled: () => !!key(), deals, merge, months };
