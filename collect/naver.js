/*
 * 네이버 부동산 — 서버는 네이버를 부르지 않는다.
 *
 * 네이버는 공개 API가 없고 클라우드 서버의 연결을 받지 않는다. 그래서 매물은 사람의 크롬에
 * 깔린 확장(extension/)이 날마다 그 단지의 매물 탭을 열어, 화면에 뜬 목록의 글자를 그대로
 * 보내 준다. 여기는 그 글자를 읽고(parse), 어느 관심 평형의 것인지 가린다(assign).
 * 읽는 법이 여기 있으니 네이버가 화면 글귀를 바꿔도 확장은 다시 깔 필요가 없다.
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

/* "15억 3,000" → 153000 (만원) */
function money(v) {
  const m = String(v).replace(/,/g, "").match(/^\s*(?:(\d+)억)?\s*(\d+)?\s*$/);
  if (!m || (!m[1] && !m[2])) return 0;
  return (Number(m[1]) || 0) * 10000 + (Number(m[2]) || 0);
}

const TRADES = { "매매": "trade", "전세": "charter" };

/*
 * 확장이 보낸 줄들 → 매물들. 한 줄은 화면의 카드 하나에서 옮긴 글자다:
 *   [이름 "신도림동아3차 303동", 값 "매매 15억 3,000", 요약 "아파트|81㎡ (전용60)|21/26층|남동향",
 *    "중개사 6곳에서 등록했어요", 매물 번호, 한 줄 설명]
 * 월세처럼 보지 않는 거래는 버린다.
 */
function parse(rows) {
  const out = [], seen = {};
  (rows || []).forEach((r) => {
    if (!Array.isArray(r)) return;
    const said = String(r[1] || "").match(/^(\S+)\s+(.+)$/);
    const trade = said && TRADES[said[1]];
    if (!trade) return;
    const span = said[2].split("~");
    const price = money(span[0]), max = span[1] ? money(span[1]) : 0;
    if (!price || price >= 1e8) return;
    const parts = String(r[2] || "").split("|");
    const area = parts.find((p) => /㎡/.test(p)) || "";
    const floor = ((parts.find((p) => /층$/.test(p)) || "").split("/")[0] || "").trim();
    const dong = (String(r[0] || "").match(/(\S+동)$/) || [])[1] || "";
    const supply = num((area.match(/([\d.]+)\s*㎡/) || [])[1], 2000);
    const exclusive = num((area.match(/전용\s*([\d.]+)/) || [])[1], 2000);
    /* 날마다 같은 매물을 같은 것으로 알아보게 — 묶인 매물에는 매물 번호가 없을 수 있어
       동 · 층 · 면적으로 이름을 짓는다. 같은 자리에 둘이면 차례로 번호를 단다. */
    const key = [trade, dong, floor, exclusive || supply].join("|");
    seen[key] = (seen[key] || 0) + 1;
    out.push({
      src: "naver", id: text(key + "#" + seen[key], 60),
      item: /^\d{1,14}$/.test(String(r[4] || "")) ? String(r[4]) : "",
      trade, price, max: max > price && max < 1e8 ? max : 0, supply, exclusive,
      dong: text(dong, 20), floor: text(floor, 8), title: text(r[5], 120),
      n: Math.max(1, Math.min(99, Number((String(r[3] || "").match(/(\d+)\s*곳/) || [])[1]) || 1))
    });
  });
  return out;
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

module.exports = { key: "naver", name: "네이버 부동산", complexNo, parse, assign };
