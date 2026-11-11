#!/usr/bin/env node
/*
 * 집 컴퓨터에서 네이버 부동산을 받아 배포된 사이트로 넘긴다. 설치할 것 없음 (Node 18+).
 *
 *   node relay.js https://<도메인> <CRON_SECRET>
 *
 * 사이트가 받아 올 주소를 알려주고, 이 컴퓨터가 네이버에서 받아 그대로 넘긴다.
 * 하루 한 번(낮 12시 조금 뒤) 예약해 두면 된다 — cron · 작업 스케줄러.
 */
const [site, key] = process.argv.slice(2);
if (!site || !key) { console.error("node relay.js https://<도메인> <CRON_SECRET>"); process.exit(2); }
const api = site.replace(/\/$/, "") + "/api/relay?key=" + encodeURIComponent(key);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

(async () => {
  const plan = await (await fetch(api)).json();
  if (!plan.ok) throw new Error(plan.message || plan.error);
  if (!plan.urls.length) return console.log("네이버가 연결된 관심 단지가 없습니다.");
  const got = {};
  const done = {};                       /* 매물이 끝난 단지 · 거래는 다음 쪽을 묻지 않는다 */
  for (const url of plan.urls) {
    const group = url.replace(/&page=\d+/, "");
    if (done[group]) continue;
    const body = await (await fetch(url, { headers: { accept: "application/json" } })).text();
    const out = await (await fetch(api, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, body })
    })).json();
    if (!out.ok) throw new Error(url + " → " + (out.message || out.error));
    if (!/"moreDataYn"\s*:\s*"Y"/.test(body)) done[group] = true;
    got[group] = out.listings;
    await pause(400);
  }
  const total = Object.keys(got).reduce((n, k) => n + got[k], 0);
  console.log("넘겼습니다 — 관심 평형에 담긴 네이버 매물 " + total + "건");
})().catch((e) => { console.error("실패:", e.message, e.cause ? "(" + e.cause.code + ")" : ""); process.exit(1); });
