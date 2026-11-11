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

/* 기록 하나의 이름. 예전 기록은 하루 두 번이어서 시각이 붙어 있다:
   "2026-11-11" → "11.11" · "2026-11-11T00" → "11.11 00시" */
export function slotShort(slot){
  return dayShort(slot) + (slot.length > 10 ? " " + slot.slice(11, 13) + "시" : "");
}

/* "2026-11-11" → "11.11 (수)" */
export function slotLabel(slot){
  var day = new Date(slot.slice(0, 10) + "T00:00:00");
  return dayShort(slot) + " (" + DOW[day.getDay()] + ")" + (slot.length > 10 ? " " + slot.slice(11, 13) + "시" : "");
}

/* 층은 숫자로도, 저 · 중 · 고로도 온다 */
export function floorLabel(f){
  return f ? f + "층" : "";
}

/* ---------- 다른 사이트의 그 자리 ---------- */
export var PLATFORM = { zigbang: "직방", naver: "네이버" };

/* 매물 하나의 원래 화면 */
export function listingUrl(l){
  if (l.src === "naver") return "https://m.land.naver.com/article/info/" + encodeURIComponent(l.item || l.id);
  if (l.item) return "https://www.zigbang.com/home/apt/items/" + encodeURIComponent(l.item);
  return "";
}

/* 호갱노노는 단지 번호를 따로 쓴다 — 이름으로 찾은 화면으로 보낸다 */
export function hogangnonoUrl(name){
  return "https://hogangnono.com/search?q=" + encodeURIComponent(name);
}

export function naverComplexUrl(id){
  return "https://new.land.naver.com/complexes/" + encodeURIComponent(id);
}

/* 번호를 모를 때: 네이버 부동산에서 그 이름을 찾은 화면 */
export function naverSearchUrl(name){
  return "https://m.land.naver.com/search/result/" + encodeURIComponent(name);
}
