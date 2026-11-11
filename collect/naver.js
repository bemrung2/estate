/*
 * 네이버 부동산 — 단지 번호로 그 단지의 매물을 받는다.
 *
 * !! 이 파일은 실제 응답으로 확인하지 못한 채 쓰였다. 만든 환경(클라우드 서버)에서는
 * 네이버가 연결을 받자마자 끊어서 한 번도 답을 받지 못했다. 주소와 필드 이름은 널리
 * 알려진 모바일 웹(m.land.naver.com)의 것을 따랐으니, 집 컴퓨터에서
 *
 *     node dev.js probe naver <단지 번호>
 *
 * 로 먼저 확인하고, 모양이 다르면 여기 한 파일만 고치면 된다.
 *
 * 요청은 꾸밈없이 보낸다. 브라우저인 척하거나 차단을 피해 가는 장치는 두지 않는다 —
 * 네이버가 받아주는 곳에서만 돌고, 막는 곳에서는 실패로 기록된다.
 *
 * 네이버에는 이름 검색을 쓰지 않는다. 단지 화면의 주소(…/complexes/111515)나 번호를
 * 붙여넣으면 그 단지를 찾는다. 평형은 매물의 공급 · 전용 면적으로 나눈다.
 */
const BASE = "https://m.land.naver.com";
const TRADES = { trade: "매매", charter: "전세" };
const CODE = { trade: "A1", charter: "B1" };
const MAX_PAGES = 40;

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function get(path) {
  let res;
  try { res = await fetch(BASE + path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) }); }
  catch (e) { throw new Error("네이버 부동산이 이 서버의 연결을 받지 않습니다. 집 컴퓨터에서 수집해 주세요."); }
  if (!res.ok) throw new Error("naver " + res.status + " " + path.split("?")[0]);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) { throw new Error("naver: JSON이 아닌 답 (" + text.slice(0, 60).replace(/\s+/g, " ") + ")"); }
}

/* "24억 9,000" → 249000 · "9억" → 90000 · "8,500" → 8500 (만원) */
function price(text) {
  const s = String(text == null ? "" : text).replace(/[,\s]/g, "");
  const m = s.match(/^(?:(\d+)억)?(\d+)?/);
  if (!m || (!m[1] && !m[2])) return 0;
  return (Number(m[1]) || 0) * 10000 + (Number(m[2]) || 0);
}

/* 공급 110.44 · 전용 84.98 → id "110.44_84.98", "110㎡ · 33평 (전용 84)" */
function typeOf(it) {
  const supply = parseFloat(it.spc1) || 0, own = parseFloat(it.spc2) || 0;
  return {
    id: supply + "_" + own,
    label: Math.round(supply) + "㎡ · " + Math.round(supply / 3.3058) + "평" + (own ? " (전용 " + Math.floor(own) + ")" : "")
  };
}

/* 주소든 번호든, 그 안의 단지 번호 */
function complexNo(text) {
  const s = String(text || "").trim();
  const m = s.match(/complex(?:es)?\/(?:info\/)?(\d{1,12})/) || s.match(/hscpNo=(\d{1,12})/) || s.match(/^(\d{1,12})$/);
  return m ? m[1] : "";
}

async function page(complexId, trade, n) {
  const data = await get("/complex/getComplexArticleList?hscpNo=" + encodeURIComponent(complexId) +
    "&tradTpCd=" + CODE[trade] + "&order=prc&showR0=N&page=" + n);
  const result = (data && data.result) || {};
  return { list: result.list || [], more: result.moreDataYn === "Y" };
}

async function catalog(complexId, trade) {
  if (!TRADES[trade]) throw new Error("unknown trade " + trade);
  const types = {};
  const listings = [];
  const seen = {};
  for (let n = 1; n <= MAX_PAGES; n++) {
    if (n > 1) await pause(350);
    const got = await page(complexId, trade, n);
    got.list.forEach((it) => {
      const id = String(it.atclNo || "");
      if (!id || seen[id]) return;
      seen[id] = true;
      const t = typeOf(it);
      types[t.id] = t.label;
      listings.push({
        id,
        type: t.id,
        price: price(it.prcInfo),
        dong: it.bildNm || "",
        floor: String(it.flrInfo || "").split("/")[0],
        title: it.atclFetrDesc || "",
        n: Number(it.sameAddrCnt) || 1,
        complexName: it.atclNm || ""
      });
    });
    if (!got.more || !got.list.length) break;
  }
  return { types, listings };
}

/* 번호 하나가 가리키는 단지. 이름은 그 단지의 매물이 말해준다. */
async function search(q) {
  const id = complexNo(q);
  if (!id) return [];
  let name = "";
  for (const trade of Object.keys(TRADES)) {
    const got = await page(id, trade, 1);
    if (got.list.length) { name = got.list[0].atclNm || ""; break; }
  }
  return [{ id, name: name || "단지 " + id, address: "네이버 부동산 · 단지 " + id, households: 0 }];
}

async function roomTypes(complexId, trade) {
  const cat = await catalog(complexId, trade);
  const count = {};
  cat.listings.forEach((l) => { count[l.type] = (count[l.type] || 0) + 1; });
  return Object.keys(cat.types)
    .map((id) => ({ id, label: cat.types[id], count: count[id] || 0 }))
    .sort((a, b) => parseFloat(a.id) - parseFloat(b.id));
}

module.exports = {
  key: "naver", name: "네이버 부동산", TRADES,
  /* 등록 창이 무엇을 물을지 */
  ask: { label: "네이버 부동산 단지 주소 또는 번호", placeholder: "예: https://new.land.naver.com/complexes/111515" },
  search, catalog, roomTypes, price, complexNo
};
