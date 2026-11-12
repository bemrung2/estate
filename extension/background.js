/*
 * BEMESTATE 네이버 매물 — 하루에 한 번 하는 일.
 *
 *   1. BEMESTATE에 관심 단지를 묻는다 (GET <site>/api/watch) → 네이버 단지 번호들
 *   2. 단지마다 네이버 부동산의 매물 탭을 작은 창으로 열고, 화면에 뜬 목록을 끝까지 내려 읽는다
 *   3. 읽은 글자를 그대로 BEMESTATE에 보낸다 (POST <site>/api/watch { importNaver })
 *
 * 사람이 그 화면을 열어 보는 것과 같은 일을 정해진 시각에 대신 할 뿐이다 — 네이버에 따로
 * 요청을 만들어 보내지 않고, 화면이 뜨지 않으면 그날은 건너뛴다. 글자의 뜻을 읽는 일은
 * 서버(collect/naver.js)가 한다.
 */
const ALARM = "collect";
const DEFAULTS = { site: "", at: "12:10", last: null, log: [] };

const get = () => chrome.storage.local.get(DEFAULTS);
const set = (v) => chrome.storage.local.set(v);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 오늘 (이 컴퓨터의 날짜) "2026-11-11" */
function today() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
/* 오늘 그 시각 */
function due(at) {
  const [h, m] = at.split(":").map(Number), d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

async function schedule() {
  const { at } = await get();
  let when = due(at).getTime();
  if (when <= Date.now()) when += 24 * 3600 * 1000;
  await chrome.alarms.create(ALARM, { when, periodInMinutes: 24 * 60 });
}

/* 네이버 화면 안에서 도는 몸. 화면에 뜬 매물 카드의 글자를 옮겨 온다.
   → { total, rows } · 목록이 안 보이면 { error } */
async function grab() {
  const SEL = 'li[data-sentry-component="ArticleCard"]';
  const cards = () => document.querySelectorAll(SEL);
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (node, sel) => {
    const e = node.querySelector(sel);
    return e ? e.textContent.replace(/\s+/g, " ").trim() : "";
  };
  const count = () => {
    const hi = document.querySelector('[class*="ArticleListWrapper"] [class*="__highlight"]');
    return hi ? parseInt(hi.textContent.replace(/\D/g, ""), 10) || 0 : -1;
  };
  /* 화면이 다 뜰 때까지. 목록을 받는 동안에는 건수가 잠깐 0으로 보이기도 한다 — 0이
     열 번(5초) 내리 이어져야 정말 매물이 없는 것으로 친다. */
  let zero = 0;
  for (let i = 0; i < 60 && !cards().length && zero < 10; i++) {
    zero = count() === 0 ? zero + 1 : 0;
    await nap(500);
  }
  const total = Math.max(0, count());
  if (!cards().length) {
    return zero >= 10 ? { total: 0, rows: [] } : { error: "매물 목록이 뜨지 않았습니다 (" + document.title + ")" };
  }
  /* 목록은 내려갈 때마다 더 실린다 — 더 늘지 않을 때까지 끝으로 내린다 */
  let last = -1, still = 0;
  for (let tries = 0; tries < 150; tries++) {
    const list = cards(), n = list.length;
    still = n === last ? still + 1 : 0;
    last = n;
    if ((total && n >= total) || still >= 5) break;
    list[n - 1].scrollIntoView({ block: "end" });
    const box = document.getElementById("complex_detail");
    if (box) box.scrollTop = box.scrollHeight;
    await nap(700);
  }
  const rows = Array.from(cards(), (li) => {
    const parts = Array.from(li.querySelectorAll('[class*="__item-summary"]'),
      (e) => e.textContent.replace(/\s+/g, " ").trim());
    const a = li.querySelector('a[href*="/articles/"]');
    const id = a ? (a.getAttribute("href").match(/articles\/(\d+)/) || [])[1] : "";
    return [text(li, '[class*="__name"]'), text(li, '[class*="__price"]'), parts.join("|"),
      text(li, '[class*="__text-more"]'), id || "", text(li, '[class*="__text-comment"]').slice(0, 60)];
  });
  return { total, rows };
}

function loaded(tabId) {
  return new Promise((done) => {
    const stop = setTimeout(finish, 30000);
    function finish() { chrome.tabs.onUpdated.removeListener(seen); clearTimeout(stop); done(); }
    function seen(id, info) { if (id === tabId && info.status === "complete") finish(); }
    chrome.tabs.onUpdated.addListener(seen);
    chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") finish(); }).catch(finish);
  });
}

/* 한 단지의 매물 탭을 열어 읽는다 */
async function read(complex) {
  const win = await chrome.windows.create({
    url: "https://fin.land.naver.com/complexes/" + complex + "?tab=article",
    type: "popup", focused: false, width: 480, height: 900
  });
  const tabId = win.tabs[0].id;
  try {
    await loaded(tabId);
    const run = async () => (await chrome.scripting.executeScript({ target: { tabId }, func: grab }))[0].result;
    let got = await run();
    /* 가려진 창에서는 목록이 더 실리지 않을 수 있다 — 덜 읽혔으면 창을 앞으로 내어 한 번 더 */
    if (got && !got.error && got.total > got.rows.length) {
      await chrome.windows.update(win.id, { focused: true });
      got = await run();
    }
    return got || { error: "화면을 읽지 못했습니다" };
  } finally {
    chrome.windows.remove(win.id).catch(() => {});
  }
}

async function api(site, init) {
  const res = await fetch(site + "/api/watch", Object.assign({ cache: "no-store" }, init));
  const data = await res.json().catch(() => null);
  if (!data || !data.ok) throw new Error((data && (data.message || data.error)) || "BEMESTATE 오류 " + res.status);
  return data;
}

let running = false;
async function collect() {
  if (running) return;
  running = true;
  const { site } = await get();
  const log = [];
  try {
    if (!site) throw new Error("BEMESTATE 주소를 먼저 넣어 주세요.");
    const watches = (await api(site)).watches || [];
    const names = {};
    watches.forEach((w) => { if (w.naver_id) names[w.naver_id] = w.complex_name; });
    const ids = Object.keys(names);
    if (!ids.length) log.push({ ok: false, text: "네이버에 연결된 관심 단지가 없습니다." });
    for (const id of ids) {
      try {
        const got = await read(id);
        if (got.error) throw new Error(got.error);
        if (!got.rows.length) {
          /* 정말 없는 것인지, 잘못 이어진 단지인지 여기서는 모른다 — 기록은 건드리지 않고 알린다 */
          log.push({ ok: false, text: names[id] + " — 네이버 화면에 매물이 0건입니다 (네이버 단지 " + id +
            "). 다른 단지로 이어져 있지 않은지 확인해 주세요." });
          await wait(3000);
          continue;
        }
        const done = await api(site, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ importNaver: { complex: id, rows: got.rows } })
        });
        const kept = done.watches.reduce((n, w) => n + w.count, 0);
        log.push({
          ok: got.rows.length >= got.total,
          text: names[id] + " — 화면 " + got.rows.length + (got.total > got.rows.length ? " / " + got.total : "") +
            "건, 관심 평형 " + kept + "건 기록"
        });
      } catch (e) {
        log.push({ ok: false, text: names[id] + " — " + String(e.message || e) });
      }
      await wait(3000);          /* 남의 사이트다 — 몰아치지 않는다 */
    }
  } catch (e) {
    log.push({ ok: false, text: String(e.message || e) });
  }
  await set({ last: { day: today(), at: new Date().toISOString() }, log });
  await chrome.action.setBadgeText({ text: log.some((l) => !l.ok) ? "!" : "" });
  running = false;
}

/* 그 시각에 크롬이 꺼져 있었으면, 켜졌을 때 한 번 따라잡는다 */
async function catchUp() {
  const { site, at, last } = await get();
  if (site && Date.now() >= due(at).getTime() && (!last || last.day !== today())) await collect();
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) collect(); });
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(async () => { await schedule(); await catchUp(); });
chrome.runtime.onMessage.addListener((msg, from, reply) => {
  if (msg === "schedule") schedule().then(() => reply(true));
  else if (msg === "collect") collect().then(() => reply(true));
  else return false;
  return true;
});
