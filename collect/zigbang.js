/*
 * 직방 — 단지 검색, 평형, 그리고 지금 올라와 있는 매물.
 *
 * 직방 웹이 쓰는 주소를 그대로, 꾸밈없이 부른다. 공개 문서가 있는 API가 아니라서
 * 모양이 바뀔 수 있다 — 바뀌면 여기 한 파일만 고치면 된다.
 *
 * 매물은 '호' 단위로 묶여서 온다(areaHoId): 같은 집을 중개사 여럿이 올려도 한
 * 줄이고, itemCount가 그 수다. 이 번호가 스냅샷 사이에서 같은 집을 알아보는 키다.
 */
const BASE = "https://apis.zigbang.com";
const PAGE = 200;
const TRADES = { trade: "매매", charter: "전세" };

async function get(path) {
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
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

/* 한 단지의 한 거래 유형 전부. 평형으로 거르는 건 받는 쪽이 한다 — 서버는
   평형 조건을 받지 않는다. */
async function catalog(complexId, trade) {
  if (!TRADES[trade]) throw new Error("unknown trade " + trade);
  const types = {};
  const listings = [];
  for (let offset = 0; offset < 5000; offset += PAGE) {
    const data = await get("/apt/danjis/" + encodeURIComponent(complexId) +
      "/item-catalogs?tranTypeIn[]=" + trade + "&includeOfferItem=true&offset=" + offset + "&limit=" + PAGE);
    (data.danjiRoomTypes || []).forEach((t) => { types[String(t.id)] = label(t.roomTypeTitle); });
    const list = data.list || [];
    list.forEach((it) => {
      const type = String(it.danjiRoomTypeId);
      if (!types[type]) types[type] = label(it.roomTypeTitle);
      listings.push({
        id: String(it.areaHoId),
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
  return { types, listings };
}

/* 등록 화면이 고를 평형들: 지금 매물이 몇 건인지와 함께 */
async function roomTypes(complexId, trade) {
  const cat = await catalog(complexId, trade);
  const count = {};
  cat.listings.forEach((l) => { count[l.type] = (count[l.type] || 0) + 1; });
  return Object.keys(cat.types)
    .map((id) => ({ id, label: cat.types[id], count: count[id] || 0 }))
    .sort((a, b) => parseFloat(a.label) - parseFloat(b.label) || (a.label < b.label ? -1 : 1));
}

module.exports = { key: "zigbang", name: "직방", TRADES, search, catalog, roomTypes };
