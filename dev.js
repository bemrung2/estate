#!/usr/bin/env node
/*
 * Run the whole thing on your own machine — the page, the API, and a file for
 * a database. No dependencies, no accounts.
 *
 *   node dev.js            http://localhost:3000
 *   node dev.js collect    one round of collecting, then exit
 *   node dev.js probe naver 111515
 *                          ask one source for one 단지 and print what came back
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

/* SUPABASE_URL이 주어지면 진짜 저장소에 쓴다 — 집 컴퓨터에서 수집만 돌릴 때 그렇게 한다 */
if (!process.env.SUPABASE_URL) {
  process.env.ESTATE_FILE_DB = process.env.ESTATE_FILE_DB || path.join(__dirname, ".estate-dev.json");
}

if (process.argv[2] === "collect") {
  const { open } = require("./api/_data.js");
  require("./collect/run.js").run(open().data).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.failed.length ? 1 : 0);
  });
  return;
}

if (process.argv[2] === "probe") {
  const source = require("./collect/run.js").SOURCES[process.argv[3]];
  if (!source || !process.argv[4]) { console.error("node dev.js probe <zigbang|naver> <단지 번호>"); process.exit(2); }
  source.catalog(process.argv[4], "trade").then((cat) => {
    console.log("평형", cat.types);
    console.log("매물 " + cat.listings.length + "건 — 앞의 3건:", cat.listings.slice(0, 3));
  }).catch((e) => { console.error("실패:", e.message, e.cause ? "(" + e.cause.message + ")" : ""); process.exit(1); });
  return;
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const PORT = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let rel = decodeURIComponent(url.pathname);
  if (rel.indexOf("..") >= 0) { res.statusCode = 400; return res.end(); }

  if (rel.indexOf("/api/") === 0) {
    const file = path.join(__dirname, rel + ".js");
    if (path.basename(file)[0] === "_" || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    try { return await require(file)(req, res); }
    catch (e) { res.statusCode = 500; return res.end(String(e.stack || e)); }
  }

  if (rel === "/") rel = "/index.html";
  const file = path.join(__dirname, rel);
  const type = TYPES[path.extname(file)];
  if (!type || !/^\/(index\.html|app\.js|(ui|estate|style)\/[\w.-]+)$/.test(rel) || !fs.existsSync(file)) {
    res.statusCode = 404; return res.end("not found");
  }
  res.setHeader("content-type", type + "; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log("BEMESTATE  http://localhost:" + PORT));
