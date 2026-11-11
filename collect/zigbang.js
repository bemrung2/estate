/*
 * 직방 — 단지 검색, 평형, 그리고 지금 올라와 있는 매물.
 *
 * 직방 웹이 쓰는 주소를 그대로, 꾸밈없이 부른다. 공개 문서가 있는 API가 아니라서
 * 모양이 바뀔 수 있다 — 바뀌면 여기 한 파일만 고치면 된다.
 *
 * 단지와 평형의 번호는 직방 것을 기준으로 삼는다. 매물은 '호' 단위로 묶여서 온다
 * (areaHoId): 같은 집을 중개사 여럿이 올려도 한 줄이고, itemCount가 그 수다. 이 번호가
 * 기록 사이에서 같은 집을 알아보는 키다.
 */
const BASE = "https://apis.zigbang.com";
const PAGE = 200;
const TRADES = { trade: "매매", charter: "전세" };

async function get(path) {
  const res = await fetch(BASE + path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("zigbang " + res.status + " " + path.split("?")[0]);
  return res.json();
}

/* "84" · "25" → "84㎡ · 25평" */
function label(title) {
  const t = title || {};
  return (t.m2 || "?") + "㎡ · " + (t.p || "?") + "평";
}

async function search(q) {
  const data = await get("/v2/search?q=" + encodeURIComponent(q));
  return (data.items || [])
    .filter((it) => it.type === "apartment")
    .map((it) => ({
      id: String(it.id),
      name: it.name,
      address: it.description || "",
      households: (it._source && it._source.household) || 0
    }));
}

/* 실거래가를 찾을 때 쓰는 주소: 시군구 5자리 · 법정동 · 지번 */
async function place(complexId) {
  const d = await get("/apt/danjis/" + encodeURIComponent(complexId));
  return {
    lawd_cd: String(d.local2_code || "").slice(0, 5),
    dong_name: d.local3 || "",
    jibun: String(d.bunji || ""),
    bcode: String(d.bcode || ""),
    lat: Number(d.lat) || 0,
    lng: Number(d.lng) || 0
  };
}

/* 한 단지의 한 거래 유형 전부. 평형으로 거르는 건 받는 쪽이 한다 — 서버는
   평형 조건을 받지 않는다. areas는 매물에서 읽은 그 평형의 공급 · 전용 면적. */
async function catalog(complexId, trade) {
  if (!TRADES[trade]) throw new Error("unknown trade " + trade);
  const types = {}, areas = {};
  const listings = [];
  for (let offset = 0; offset < 5000; offset += PAGE) {
    const data = await get("/apt/danjis/" + encodeURIComponent(complexId) +
      "/item-catalogs?tranTypeIn[]=" + trade + "&includeOfferItem=true&offset=" + offset + "&limit=" + PAGE);
    (data.danjiRoomTypes || []).forEach((t) => { types[String(t.id)] = label(t.roomTypeTitle); });
    const list = data.list || [];
    list.forEach((it) => {
      const type = String(it.danjiRoomTypeId);
      if (!types[type]) types[type] = label(it.roomTypeTitle);
      if (!areas[type] && it.sizeContractM2) {
        areas[type] = { supply: Number(it.sizeContractM2), exclusive: Number(it.sizeM2) || null };
      }
      const first = (it.itemIdList || [])[0];
      listings.push({
        src: "zigbang",
        id: String(it.areaHoId),
        item: first ? String(first.itemId) : "",
        type,
        price: Number(it.depositMin) || 0,
        dong: it.dong || "",
        floor: it.floor == null ? "" : String(it.floor),
        title: it.itemTitle || "",
        n: Number(it.itemCount) || 1
      });
    });
    if (list.length < PAGE) break;
  }
  return { types, areas, listings };
}

/* 등록 화면이 고를 평형들: 지금 매물이 몇 건인지, 면적은 얼마인지와 함께.
   매물이 하나도 없는 평형은 면적을 모른다 — 공급 면적만 이름에서 읽는다. */
async function roomTypes(complexId) {
  const both = await Promise.all(Object.keys(TRADES).map((t) => catalog(complexId, t)));
  const out = {};
  both.forEach((cat, i) => {
    const trade = Object.keys(TRADES)[i];
    Object.keys(cat.types).forEach((id) => {
      const row = (out[id] = out[id] || { id, label: cat.types[id], supply: null, exclusive: null, count: {} });
      if (cat.areas[id] && !row.supply) { row.supply = cat.areas[id].supply; row.exclusive = cat.areas[id].exclusive; }
    });
    cat.listings.forEach((l) => { out[l.type].count[trade] = (out[l.type].count[trade] || 0) + 1; });
  });
  return Object.keys(out).map((id) => {
    const row = out[id];
    if (!row.supply) row.supply = parseFloat(row.label) || null;
    return row;
  }).sort((a, b) => parseFloat(a.label) - parseFloat(b.label) || (a.label < b.label ? -1 : 1));
}

module.exports = { key: "zigbang", name: "직방", TRADES, search, place, catalog, roomTypes };
