/*
 * 호갱노노 — 단지 화면으로 바로 가는 주소를 만들려고 그 단지의 번호만 찾는다.
 * (hogangnono.com/apt/<번호>. 이름으로 찾은 화면 주소는 앱이 열리면 단지로 가지 않는다.)
 *
 * 호갱노노 웹이 쓰는 검색 주소를 꾸밈없이 부른다. 같은 이름의 단지가 여럿일 수 있어
 * 법정동 코드와 지번이 맞는 것을 고른다.
 */
const BASE = "https://hogangnono.com";

const lot = (s) => String(s || "").trim().replace(/^0+/, "");

/* where: { bcode: "1171010700", jibun: "913" } → 단지 번호, 없으면 "" */
async function find(name, where) {
  const res = await fetch(BASE + "/api/v2/searches/new?query=" + encodeURIComponent(name), {
    headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error("hogangnono " + res.status);
  const data = await res.json();
  const list = (data && data.data && data.data.matched && data.data.matched.apt && data.data.matched.apt.list) || [];
  if (!list.length) return "";
  const w = where || {};
  const here = list.filter((a) => w.bcode && String(a.region_code) === String(w.bcode));
  const exact = here.find((a) => w.jibun && lot(String(a.address || "").split(" ").pop()) === lot(w.jibun));
  const pick = exact || here.find((a) => a.name === name) || (w.bcode ? here[0] : list[0]);
  return pick ? String(pick.id) : "";
}

module.exports = { find };
