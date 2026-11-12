/*
 * 실거래가 — 국토교통부 실거래가 공개 API (공공데이터포털, data.go.kr).
 *
 * MOLIT_SERVICE_KEY가 있어야 한다. 공공데이터포털에서 '국토교통부_아파트 매매 실거래가
 * 상세 자료'와 '국토교통부_아파트 전월세 실거래가 자료'를 활용신청하면 나오는 인증키
 * (Decoding 키)다. 없으면 실거래가는 비워 둔다 — 호가 기록은 그대로 된다.
 *
 * 한 번의 요청은 시군구 하나의 한 달치다. 단지는 법정동 + 지번으로, 평형은 전용
 * 면적으로 가려낸다. 5년치를 쌓는다 — 처음에는 여러 번에 나눠 거슬러 받고, 그 뒤로는
 * 최근 석 달만 다시 받는다.
 *
 * !! 주소와 오류 답은 확인했지만(키가 틀리면 "등록되지 않은 서비스키"), 만든 쪽에는 키가
 * 없어 실제 거래 목록은 받아보지 못했다. 그래서 답이 JSON이든 XML이든, 이름이 영문이든
 * 한글이든 읽도록 해 두었고, /api/probe 가 어디서 걸러지는지 단계별로 보여준다.
 */
const BASE = "https://apis.data.go.kr/1613000/";
const PATH = {
  trade: "RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
  charter: "RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
};
const RECENT = 3;          /* 신고는 계약 뒤 30일 안에 들어온다 — 최근 석 달은 매번 다시 받는다 */
const SPAN = 60;           /* 거슬러 5년 */
const KEEP = 3000;
const TOGETHER = 3;        /* 한꺼번에 걸어 두는 요청 수 (실제로는 한 줄로 띄워 나간다 — ask) */

/* 붙여넣다 딸려 온 따옴표와 빈칸은 떼어낸다 */
function key() { return String(process.env.MOLIT_SERVICE_KEY || "").trim().replace(/^["']+|["']+$/g, "").trim(); }

/* 키 자체는 보이지 않게, 모양만 — 잘못 붙여넣었는지 볼 때 (api/probe.js) */
function keyShape() {
  const raw = String(process.env.MOLIT_SERVICE_KEY || ""), k = key();
  if (!k) return "없음";
  return "길이 " + k.length + (/%[0-9A-Fa-f]{2}/.test(k) ? " · Encoding 꼴" : " · Decoding 꼴") +
    (raw !== k ? " · 앞뒤에 빈칸이나 따옴표가 있어 떼어냄" : "") + (/\s/.test(k) ? " · 가운데 빈칸 있음(잘못 붙여넣음)" : "");
}

const num = (v) => Number(String(v == null ? "" : v).replace(/[,\s]/g, "")) || 0;
const pad = (n) => String(n).padStart(2, "0");

/* 이번 달부터 거슬러 n달: ["202611", "202610", …] (한국 시간) */
function monthsBack(n, now) {
  const k = new Date((now || new Date()).getTime() + 9 * 3600 * 1000);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - i, 1));
    out.push(d.getUTCFullYear() + pad(d.getUTCMonth() + 1));
  }
  return out;
}
function months(now) { return monthsBack(RECENT, now); }

/*
 * 이번에 받을 달들. 최근 석 달은 늘 받고, 그보다 옛것은 아직 안 받은 데서부터 5년 전까지
 * 한 번에 `budget`달씩 거슬러 간다. deals_from은 거기까지는 이미 받았다는 표시("202211").
 * → { months, from }   from = 이번 것을 받고 나면 어디까지 받은 것이 되는지
 */
function plan(group, budget, now) {
  const all = monthsBack(SPAN, now);
  const recent = all.slice(0, RECENT);
  const known = group.every((w) => w.deals_from) ? group.map((w) => w.deals_from).sort().pop() : "";
  const older = all.slice(RECENT).filter((ym) => !known || ym < known).slice(0, Math.max(0, budget));
  const from = older.length ? older[older.length - 1] : (known && known < recent[RECENT - 1] ? known : recent[RECENT - 1]);
  return { months: recent.concat(older), from };
}

/* 5년 전까지 다 받았는가 */
function complete(w, now) {
  return !!w.deals_from && w.deals_from <= monthsBack(SPAN, now)[SPAN - 1];
}

/* 인증키는 두 가지로 나눠 준다: 그대로인 것(Decoding)과 주소에 넣게 바꿔 둔 것(Encoding).
   어느 쪽을 넣어도 되게 한다 — 이미 바뀐 것을 또 바꾸면 '등록되지 않은 키'가 된다. */
function keyParam() {
  const k = key().trim();
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
}

/* 이 API는 판마다 이름이 달랐다(영문 · 한글). 어느 쪽으로 와도 같은 모양으로 읽는다. */
const NAMES = {
  aptNm: ["aptNm", "아파트"], umdNm: ["umdNm", "법정동"], jibun: ["jibun", "지번"],
  excluUseAr: ["excluUseAr", "전용면적"], floor: ["floor", "층"],
  dealYear: ["dealYear", "년"], dealMonth: ["dealMonth", "월"], dealDay: ["dealDay", "일"],
  dealAmount: ["dealAmount", "거래금액"], deposit: ["deposit", "보증금액", "보증금"],
  monthlyRent: ["monthlyRent", "월세금액", "월세"], cdealType: ["cdealType", "해제여부"]
};
function norm(it) {
  const out = {};
  Object.keys(NAMES).forEach((k) => {
    const name = NAMES[k].find((n) => it[n] != null);
    out[k] = name == null ? "" : String(it[name]).trim();
  });
  return out;
}

/* 답은 JSON으로도 XML로도 온다. 오류도 그렇다. → { items, total } 또는 던진다 */
function parse(text, status) {
  const t = String(text || "").trim();
  if (t[0] === "{") {
    let data;
    try { data = JSON.parse(t); } catch (e) { throw new Error("실거래가 API: 읽을 수 없는 답"); }
    const bad = data.OpenAPI_ServiceResponse && data.OpenAPI_ServiceResponse.cmmMsgHeader;
    if (bad) throw new Error("실거래가 API: " + (bad.returnAuthMsg || bad.errMsg || "오류"));
    const head = (data.response && data.response.header) || {};
    if (!data.response) throw new Error("실거래가 API: 뜻밖의 답 (" + t.slice(0, 80) + ")");
    if (head.resultCode != null && !/^0+$/.test(String(head.resultCode))) {
      throw new Error("실거래가 API: " + (head.resultMsg || head.resultCode));
    }
    const body = data.response.body || {};
    let items = (body.items && body.items.item) || [];
    if (!Array.isArray(items)) items = [items];
    return { items, total: num(body.totalCount) };
  }
  if (t[0] === "<") {
    const tag = (name) => (t.match(new RegExp("<" + name + ">([^<]*)</" + name + ">")) || [])[1];
    const auth = tag("returnAuthMsg") || tag("errMsg");
    if (auth) throw new Error("실거래가 API: " + auth);
    const code = tag("resultCode");
    if (code != null && !/^0+$/.test(code)) throw new Error("실거래가 API: " + (tag("resultMsg") || code));
    const items = (t.match(/<item>[\s\S]*?<\/item>/g) || []).map((block) => {
      const it = {};
      block.replace(/<([^\/>\s]+)>([^<]*)<\/\1>/g, (m, k, v) => { it[k] = v; return m; });
      return it;
    });
    return { items, total: num(tag("totalCount")) };
  }
  throw new Error("실거래가 API: HTTP " + status);
}

/*
 * 공공데이터포털은 초당 요청 수를 센다. 그래서 요청은 한 줄로 세워 SPACING만큼 띄워 보내고,
 * 그래도 "초당 … 제한 … 초과"가 오면 잠깐 쉬었다가 몇 번 다시 묻는다.
 */
const SPACING = 220, RETRIES = 4;
let gate = Promise.resolve();
const rest = (ms) => new Promise((done) => setTimeout(done, ms));
function turn() {
  const mine = gate.then(() => rest(SPACING));
  gate = mine.catch(() => {});
  return mine;
}
const limited = (e) => /초당|제한횟수|LIMITED_NUMBER_OF_SERVICE_REQUESTS|\b22\b|HTTP 429/.test(String(e && e.message));

async function ask(url) {
  for (let n = 0; ; n++) {
    await turn();
    try {
      let res;
      try { res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) }); }
      catch (e) { throw new Error("실거래가 API에 닿지 못했습니다"); }
      return parse(await res.text(), res.status);
    } catch (e) {
      if (!limited(e) || n >= RETRIES) throw e;
      /* 뒤에 선 요청들도 함께 쉬게 줄 자체를 늦춘다 */
      gate = gate.then(() => rest(1200 * (n + 1)));
    }
  }
}

async function month(trade, lawd, ym) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const url = BASE + PATH[trade] + "?serviceKey=" + keyParam() +
      "&LAWD_CD=" + lawd + "&DEAL_YMD=" + ym + "&numOfRows=1000&pageNo=" + page + "&_type=json";
    const got = await ask(url);
    got.items.forEach((it) => rows.push(norm(it)));
    if (rows.length >= got.total || !got.items.length) break;
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
  if (!price || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    id: [date, it.floor, price].join("/"),
    date, price, floor: it.floor,
    canceled: !!it.cdealType
  };
}

/* 그 구의 거래 가운데 이 단지의 것. 지번이 맞는 것이 단지다 — 지번으로 하나도 안 잡히면
   (지번 표기가 다르거나 모를 때) 이름이 같은 것으로 잡는다. */
function ofComplex(rows, head) {
  const byLot = head.jibun ? rows.filter((it) =>
    plain(it.umdNm) === plain(head.dong_name) && lot(it.jibun) === lot(head.jibun)) : [];
  if (byLot.length) return byLot;
  const name = plain(head.complex_name);
  return rows.filter((it) => plain(it.aptNm) === name &&
    (!head.dong_name || plain(it.umdNm) === plain(head.dong_name)));
}

const sameArea = (it, w) => Math.abs(num(it.excluUseAr) - Number(w.exclusive_m2)) <= 0.5;
const newest = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

async function rowsFor(head, cache, yms) {
  const want = yms || months();
  const keyOf = (ym) => [head.trade, head.lawd_cd, ym].join("|");
  const todo = want.filter((ym) => !cache[keyOf(ym)]);
  for (let i = 0; i < todo.length; i += TOGETHER) {
    await Promise.all(todo.slice(i, i + TOGETHER).map(async (ym) => {
      cache[keyOf(ym)] = await month(head.trade, head.lawd_cd, ym);
    }));
  }
  const rows = [];
  want.forEach((ym) => cache[keyOf(ym)].forEach((r) => rows.push(r)));
  return rows;
}

/*
 * watches: one 단지 · 거래의 관심 평형들 (same lawd_cd · dong_name · jibun).
 * cache: { "trade|11710|202611": rows } — 같은 구의 다른 단지가 다시 묻지 않게.
 * yms: 받을 달들 (없으면 최근 석 달)
 * → { watchId: [deal…] } 최근 것이 앞
 */
async function deals(watches, cache, yms) {
  const head = watches[0];
  if (!key() || !head.lawd_cd || !PATH[head.trade]) return null;
  const here = ofComplex(await rowsFor(head, cache, yms), head);
  const out = {};
  watches.forEach((w) => {
    if (!Number(w.exclusive_m2)) return;
    out[w.id] = here.filter((it) => sameArea(it, w)).map((it) => deal(w.trade, it)).filter(Boolean).sort(newest);
  });
  return out;
}

/* 어디서 걸러졌는지 단계별로 센다 — 실거래가 안 보일 때 이유를 찾는 데 쓴다 (api/probe.js) */
async function diagnose(w, cache) {
  const out = {
    watch: w.complex_name + " " + w.room_label, trade: w.trade,
    lawd_cd: w.lawd_cd || "(없음)", dong: w.dong_name || "(없음)", jibun: w.jibun || "(없음)",
    exclusive_m2: w.exclusive_m2 || "(없음)"
  };
  if (!key()) return { ...out, error: "MOLIT_SERVICE_KEY가 없습니다" };
  if (!w.lawd_cd) return { ...out, error: "시군구 코드를 아직 모릅니다 — 단지 화면을 한 번 열어 주세요" };
  try {
    const rows = await rowsFor(w, cache);
    const here = ofComplex(rows, w);
    const mine = here.filter((it) => sameArea(it, w));
    return {
      ...out, months: months(),
      rows_in_district: rows.length,
      rows_of_complex: here.length,
      areas_of_complex: [...new Set(here.map((it) => it.excluUseAr))].sort(),
      rows_of_this_type: mine.length,
      newest: mine.map((it) => deal(w.trade, it)).filter(Boolean).sort(newest).slice(0, 3),
      sample_row: rows[0] || null
    };
  } catch (e) { return { ...out, error: String(e.message || e) }; }
}

/* 전에 받아둔 것과 합친다 — 석 달이 지난 거래도 남는다 */
function merge(old, fresh) {
  const by = {};
  (old || []).forEach((d) => { by[d.id] = d; });
  (fresh || []).forEach((d) => { by[d.id] = d; });
  return Object.keys(by).map((k) => by[k])
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, KEEP);
}

module.exports = { enabled: () => !!key(), keyShape, plan, complete, deals, diagnose, merge, months, parse, norm };
