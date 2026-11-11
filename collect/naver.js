/*
 * 네이버 부동산 — 단지 번호로 그 단지의 매물을 받고, 면적으로 평형을 맞춘다.
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
 */
const BASE = "https://m.land.naver.com";
const CODE = { trade: "A1", charter: "B1" };
const MAX_PAGES = 40;
/* 같은 평형으로 볼 면적 차이(㎡). 110.44와 110.17처럼 타입만 다른 평형은 갈라야 한다 */
const NEAR = 0.15;

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function request(path, init) {
  try { return await fetch(BASE + path, { signal: AbortSignal.timeout(8000), ...init }); }
  catch (e) { throw new Error("네이버 부동산이 이 서버의 연결을 받지 않습니다"); }
}

async function get(path) {
  const res = await request(path, { headers: { accept: "application/json" } });
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

/* 주소든 번호든, 그 안의 단지 번호 */
function complexNo(text) {
  const s = String(text || "").trim();
  const m = s.match(/complex(?:es)?\/(?:info\/)?(\d{1,12})/) || s.match(/hscpNo=(\d{1,12})/) || s.match(/^(\d{1,12})$/);
  return m ? m[1] : "";
}

/* 이름으로 단지 번호 찾기. 모바일 웹의 검색은 딱 맞는 단지가 있으면 그 단지 화면으로
   보낸다 — 그 주소에서 번호를 읽는다. 못 찾으면 빈 문자열. */
async function find(name) {
  const res = await request("/search/result/" + encodeURIComponent(name), { redirect: "manual" });
  return complexNo(res.headers.get("location") || "");
}

/* 한 단지의 한 거래 유형 전부. 매물마다 공급(supply) · 전용(exclusive) 면적이 붙는다. */
async function catalog(complexId, trade) {
  if (!CODE[trade]) throw new Error("unknown trade " + trade);
  const listings = [];
  const seen = {};
  let name = "";
  for (let n = 1; n <= MAX_PAGES; n++) {
    if (n > 1) await pause(350);
    const data = await get("/complex/getComplexArticleList?hscpNo=" + encodeURIComponent(complexId) +
      "&tradTpCd=" + CODE[trade] + "&order=prc&showR0=N&page=" + n);
    const result = (data && data.result) || {};
    const list = result.list || [];
    list.forEach((it) => {
      const id = String(it.atclNo || "");
      if (!id || seen[id]) return;
      seen[id] = true;
      name = name || it.atclNm || "";
      listings.push({
        src: "naver",
        id,
        item: id,
        supply: parseFloat(it.spc1) || 0,
        exclusive: parseFloat(it.spc2) || 0,
        price: price(it.prcInfo),
        dong: it.bildNm || "",
        floor: String(it.flrInfo || "").split("/")[0],
        title: it.atclFetrDesc || "",
        n: Number(it.sameAddrCnt) || 1
      });
    });
    if (result.moreDataYn !== "Y" || !list.length) break;
  }
  return { name, listings };
}

/* 이 매물이 그 관심 평형의 것인가 — 공급 면적으로, 전용 면적을 알면 그것으로도 */
function sameType(listing, watch) {
  const supply = Number(watch.supply_m2), own = Number(watch.exclusive_m2);
  if (!supply) return false;
  if (Math.abs(listing.supply - supply) > (own ? NEAR : 0.6)) return false;
  return !own || !listing.exclusive || Math.abs(listing.exclusive - own) <= NEAR;
}

module.exports = { key: "naver", name: "네이버 부동산", catalog, find, sameType, price, complexNo };
