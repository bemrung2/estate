/* How numbers and times are said. Prices arrive as whole 만원. */

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

/* "2026-11-11T00" → "11.11 (수) 00시" */
export function slotLabel(slot){
  var day = new Date(slot.slice(0, 10) + "T00:00:00");
  return slotShort(slot).replace(" ", " (" + DOW[day.getDay()] + ") ");
}

/* "2026-11-11T00" → "11.11 00시" */
export function slotShort(slot){
  return Number(slot.slice(5, 7)) + "." + Number(slot.slice(8, 10)) + " " + slot.slice(11, 13) + "시";
}

/* 층은 숫자로도, 저 · 중 · 고로도 온다 */
export function floorLabel(f){
  if (!f) return "";
  return f + "층";
}
