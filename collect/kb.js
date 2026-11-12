/*
 * KB부동산 — 단지의 '네이버 단지 코드'와 평형별 면적을 알아내는 데 쓴다.
 *
 * KB는 단지마다 네이버 부동산의 단지 번호를 함께 내려준다. 그래서 이름으로 등록한 단지를
 * 손으로 잇지 않아도 네이버 단지가 정해진다: 법정동의 단지 목록에서 같은 단지를 찾고
 * (이름이 같거나, 자리가 가장 가까운 것), 그 단지의 평형 정보에서 코드를 읽는다.
 *
 * 직방은 지금 매물이 없는 평형의 전용 면적을 주지 않는다. KB의 평형 정보에는 공급 · 전용
 * 면적이 다 있어, 빈 곳을 그것으로 채운다 (fillAreas).
 *
 * KB 웹이 쓰는 주소를 꾸밈없이 부른다. 매물은 여기서 받지 않는다.
 */
const BASE = "https://api.kbland.kr";

async function get(path, params) {
  const ask = () => fetch(BASE + path + "?" + new URLSearchParams(params), {
    headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000)
  });
  /* 연결이 끊겨 돌아오는 일이 가끔 있다 — 한 번은 다시 묻는다 */
  const res = await ask().catch(() => ask());
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
  const types = await typesOf(where);
  const code = (types.find((t) => t.네이버단지코드) || {}).네이버단지코드;
  if (!code) missed.set(memo, Date.now());
  return code ? String(code) : "";
}

/* 그 단지의 평형별 면적 → [{ supply, exclusive }] */
async function areas(where) {
  if (!where || !where.bcode) return [];
  return (await typesOf(where))
    .map((t) => ({ supply: Number(t.공급면적) || 0, exclusive: Number(t.전용면적) || 0 }))
    .filter((t) => t.supply && t.exclusive);
}

/*
 * 면적을 모르는 평형을 KB의 것으로 채운다. types: [{ supply, exclusive, … }] (고쳐 쓴다)
 * 공급 면적이 가장 가까운 KB 평형을 고른다 — 직방은 면적을 모를 때 이름의 숫자("80㎡")만
 * 주므로 소수점 아래가 깎여 있다. 1.5㎡ 넘게 다르면 다른 평형으로 보고 채우지 않는다.
 */
async function fillAreas(types, where) {
  if (!types.some((t) => !Number(t.exclusive))) return types;
  let known = [];
  try { known = await areas(where); } catch (e) { return types; }
  types.forEach((t) => {
    if (Number(t.exclusive) || !Number(t.supply)) return;
    let best = null, far = Infinity;
    known.forEach((k) => {
      const d = Math.abs(k.supply - t.supply);
      if (d < far) { far = d; best = k; }
    });
    if (best && far <= 1.5) { t.supply = best.supply; t.exclusive = best.exclusive; }
  });
  return types;
}

/* 그 단지의 KB 평형 정보 (한 번 받은 것은 잠깐 기억한다) */
const seen = new Map();
async function typesOf(where) {
  const memo = where.bcode + "|" + where.name;
  const hit = seen.get(memo);
  if (hit && Date.now() - hit.at < 600 * 1000) return hit.types;
  const types = await lookup(where);
  seen.set(memo, { at: Date.now(), types });
  return types;
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
  if (!pick) return [];
  return get("/land-complex/complex/typInfo", { 단지기본일련번호: pick.단지기본일련번호 });
}

module.exports = { naverId, areas, fillAreas };
