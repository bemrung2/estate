/*
 * KB부동산 — 단지의 '네이버 단지 코드'를 알아내는 데만 쓴다.
 *
 * KB는 단지마다 네이버 부동산의 단지 번호를 함께 내려준다. 그래서 이름으로 등록한 단지를
 * 손으로 잇지 않아도 네이버 단지가 정해진다: 법정동의 단지 목록에서 같은 단지를 찾고
 * (이름이 같거나, 자리가 가장 가까운 것), 그 단지의 평형 정보에서 코드를 읽는다.
 *
 * KB 웹이 쓰는 주소를 꾸밈없이 부른다. 매물은 여기서 받지 않는다.
 */
const BASE = "https://api.kbland.kr";

async function get(path, params) {
  const res = await fetch(BASE + path + "?" + new URLSearchParams(params), {
    headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error("kb " + res.status);
  const data = await res.json();
  const list = data && data.dataBody && data.dataBody.data;
  return Array.isArray(list) ? list : [];
}

const plain = (s) => String(s || "").replace(/[\s()·.\-]/g, "").toLowerCase();

/* 못 찾은 단지를 열 때마다 다시 묻지 않게, 이 프로세스가 사는 동안은 기억해 둔다 */
const missed = new Map();
const AGAIN = 6 * 3600 * 1000;

/* where: { bcode, name, lat, lng } → 네이버 단지 번호, 못 찾으면 "" */
async function naverId(where) {
  if (!where || !where.bcode) return "";
  const memo = where.bcode + "|" + where.name;
  if (missed.has(memo) && Date.now() - missed.get(memo) < AGAIN) return "";
  const found = await lookup(where);
  if (!found) missed.set(memo, Date.now());
  return found;
}

async function lookup(where) {
  const list = (await get("/land-complex/complexComm/hscmList", { 법정동코드: where.bcode }))
    .filter((c) => c.매물종별구분 === "01" || !c.매물종별구분);
  const name = plain(where.name);
  let pick = list.find((c) => plain(c.단지명) === name);
  if (!pick && where.lat && where.lng) {
    /* 이름 표기가 다를 때: 150m 안에서 가장 가까운 단지 */
    let far = Infinity;
    list.forEach((c) => {
      const dy = (Number(c.wgs84위도) - where.lat) * 111000;
      const dx = (Number(c.wgs84경도) - where.lng) * 88000;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < far) { far = d; pick = c; }
    });
    if (far > 150) pick = null;
  }
  if (!pick) return "";
  const types = await get("/land-complex/complex/typInfo", { 단지기본일련번호: pick.단지기본일련번호 });
  const code = (types.find((t) => t.네이버단지코드) || {}).네이버단지코드;
  return code ? String(code) : "";
}

module.exports = { naverId };
