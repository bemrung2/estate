/* How numbers, days and places on other sites are said. Prices arrive as whole 만원. */

/* 249000 → "24억 9,000" · 250000 → "25억" · 8500 → "8,500만" */
export function won(n){
  if (n == null) return "—";
  var eok = Math.floor(n / 10000), rest = n % 10000;
  if (!eok) return rest.toLocaleString("ko-KR") + "만";
  return eok + "억" + (rest ? " " + rest.toLocaleString("ko-KR") : "");
}

/* 달라진 값: "▲ 1,000만" · "▼ 1억 2,000" */
export function delta(d){
  return (d > 0 ? "▲ " : "▼ ") + won(Math.abs(d));
}

var DOW = ["일", "월", "화", "수", "목", "금", "토"];

/* "2026-11-11" → "11.11" */
export function dayShort(iso){
  return Number(iso.slice(5, 7)) + "." + Number(iso.slice(8, 10));
}

/* 기록 하나의 이름: "2026-11-11" → "11.11" */
export function slotShort(slot){ return dayShort(slot); }

/* "2026-11-11" → "11.11 (수)" */
export function slotLabel(slot){
  var day = new Date(slot.slice(0, 10) + "T00:00:00");
  return dayShort(slot) + " (" + DOW[day.getDay()] + ")";
}

/* 시각 하나: "14:05" (보는 사람의 시계로) */
export function clock(iso){
  var d = new Date(iso);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/* 층은 숫자로도, 저 · 중 · 고로도 온다 */
export function floorLabel(f){
  return f ? f + "층" : "";
}

/* ---------- 다른 사이트의 그 자리 ---------- */
export var PLATFORM = { zigbang: "직방", naver: "네이버" };

/* 매물 하나의 원래 화면 */
export function listingUrl(l, w){
  if (l.src === "naver"){
    /* 여러 중개사가 묶어 올린 매물은 번호가 없다 — 그때는 단지의 매물 탭으로 */
    if (l.item) return "https://fin.land.naver.com/articles/" + encodeURIComponent(l.item);
    return w && w.naver_id ? naverComplexUrl(w.naver_id) : "";
  }
  if (l.item) return "https://www.zigbang.com/home/apt/items/" + encodeURIComponent(l.item);
  return "";
}

/* 호갱노노의 그 단지. 번호를 아직 못 찾았으면 이름으로 찾은 화면 */
export function hogangnonoUrl(w){
  if (w.hgnn_id && w.hgnn_id !== "-") return "https://hogangnono.com/apt/" + encodeURIComponent(w.hgnn_id);
  return "https://hogangnono.com/search?q=" + encodeURIComponent(w.complex_name);
}

export function naverComplexUrl(id){
  return "https://fin.land.naver.com/complexes/" + encodeURIComponent(id) + "?tab=article";
}

/* 번호를 모를 때: 네이버 부동산에서 그 이름을 찾은 화면 */
export function naverSearchUrl(name){
  return "https://m.land.naver.com/search/result/" + encodeURIComponent(name);
}
