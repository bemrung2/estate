/*
 * 네이버 부동산 — 서버는 네이버를 부르지 않는다.
 *
 * 네이버는 공개 API가 없고 클라우드 서버의 연결을 받지 않는다. 그래서 매물은 사람이 제
 * 브라우저로 네이버 부동산의 단지 매물 탭을 열어 둔 채, 화면에 떠 있는 목록을 읽어
 * 넘겨준다 (북마크 단추 — estate/naver.js). 여기는 넘겨받은 것을 다듬고, 어느 관심 평형의
 * 것인지 가리는 일만 한다.
 *
 * 화면의 면적은 "81㎡ (전용60)"처럼 공급이 정수로 깎여 있다. 그래서 전용 면적을 먼저 보고
 * 공급은 느슨하게 본다.
 */

/* 주소든 번호든, 그 안의 단지 번호 */
function complexNo(text) {
  const s = String(text || "").trim();
  const m = s.match(/complex(?:es)?\/(?:info\/)?(\d{1,12})/) || s.match(/hscpNo=(\d{1,12})/) || s.match(/^(\d{1,12})$/);
  return m ? m[1] : "";
}

const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const num = (v, max) => { const n = Number(v); return n > 0 && n < max ? n : 0; };

/* 넘겨받은 한 줄을 믿을 수 있는 모양으로. 쓸 수 없으면 null */
function clean(l) {
  if (!l || (l.trade !== "trade" && l.trade !== "charter")) return null;
  const price = Math.round(num(l.price, 1e8));
  const id = text(l.id, 60);
  if (!price || !id) return null;
  const max = Math.round(num(l.max, 1e8));
  return {
    src: "naver", id, item: /^\d{1,14}$/.test(String(l.item || "")) ? String(l.item) : "",
    trade: l.trade, price, max: max > price ? max : 0,
    supply: num(l.supply, 2000), exclusive: num(l.exclusive, 2000),
    dong: text(l.dong, 20), floor: text(l.floor, 8), title: text(l.title, 120),
    n: Math.max(1, Math.min(99, Math.round(Number(l.n) || 1)))
  };
}

/* 이 매물이 그 평형과 얼마나 먼가 (전용 면적의 차). 같은 평형일 수 없으면 Infinity */
function distance(l, w) {
  const own = Number(w.exclusive_m2), supply = Number(w.supply_m2);
  if (l.trade !== w.trade) return Infinity;
  if (own && l.exclusive) {
    const d = Math.abs(l.exclusive - own);
    if (d > 0.6) return Infinity;
    if (supply && l.supply && Math.abs(l.supply - supply) > 1.5) return Infinity;
    return d;
  }
  if (supply && l.supply) return Math.abs(l.supply - supply) <= 1 ? 0.5 : Infinity;
  return Infinity;
}

/* 매물마다 가장 가까운 평형 하나로 보낸다 → { watchId: [listing…] }, 어디에도 안 맞은 수 */
function assign(listings, watches) {
  const out = {};
  watches.forEach((w) => { out[w.id] = []; });
  let unmatched = 0;
  listings.forEach((l) => {
    let best = null, far = Infinity;
    watches.forEach((w) => {
      const d = distance(l, w);
      if (d < far) { far = d; best = w; }
    });
    if (best) out[best.id].push(l); else unmatched++;
  });
  return { byWatch: out, unmatched };
}

module.exports = { key: "naver", name: "네이버 부동산", complexNo, clean, assign };
