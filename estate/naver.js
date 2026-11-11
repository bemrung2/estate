/* 네이버 부동산 매물 가져오기.
 *
 * 서버는 네이버를 부르지 못한다. 대신 사람이 제 브라우저로 네이버 부동산의 단지 매물 탭을
 * 열고 북마크 단추를 누르면, 화면에 떠 있는 목록을 읽어 이 앱의 "#/import/…" 주소로
 * 넘어온다. 단추(grab)는 글자만 그대로 옮기고, 뜻을 읽는 일(parse)은 여기서 한다 —
 * 읽는 법을 고쳐도 북마크를 다시 만들 필요가 없게. */

/* 북마크 단추의 몸. 네이버 화면에서 혼자 돌아야 하므로 바깥 것을 쓰지 않는다. */
function grab(base){
  var m = location.pathname.match(/complexes\/(\d+)/);
  if (location.hostname.indexOf("land.naver.com") < 0 || !m){
    alert("BEMESTATE: 네이버 부동산의 단지 화면(매물 탭)에서 눌러 주세요.");
    return;
  }
  var SEL = 'li[data-sentry-component="ArticleCard"]';
  var cards = function(){ return document.querySelectorAll(SEL); };
  if (!cards().length){
    alert("BEMESTATE: 매물 목록이 보이지 않습니다. '매물' 탭을 연 뒤 다시 눌러 주세요.");
    return;
  }
  var note = document.createElement("div");
  note.style.cssText = "position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);" +
    "padding:10px 16px;border-radius:999px;background:#111;color:#fff;font:600 13px/1.2 sans-serif;" +
    "box-shadow:0 6px 24px rgba(0,0,0,.3)";
  document.body.appendChild(note);
  var hi = document.querySelector('[class*="ArticleListWrapper"] [class*="__highlight"]');
  var total = hi ? parseInt(hi.textContent.replace(/\D/g, ""), 10) || 0 : 0;
  var last = -1, still = 0, tries = 0;
  function text(node, sel){
    var e = node.querySelector(sel);
    return e ? e.textContent.replace(/\s+/g, " ").trim() : "";
  }
  function done(){
    var rows = [];
    Array.prototype.forEach.call(cards(), function(li){
      var parts = [];
      Array.prototype.forEach.call(li.querySelectorAll('[class*="__item-summary"]'), function(e){
        parts.push(e.textContent.replace(/\s+/g, " ").trim());
      });
      var a = li.querySelector('a[href*="/articles/"]');
      var id = a ? (a.getAttribute("href").match(/articles\/(\d+)/) || [])[1] : "";
      rows.push([text(li, '[class*="__name"]'), text(li, '[class*="__price"]'), parts.join("|"),
        text(li, '[class*="__text-more"]'), id || "", text(li, '[class*="__text-comment"]').slice(0, 40)]);
    });
    location.href = base + "#/import/" + m[1] + "/" + encodeURIComponent(JSON.stringify({ total: total, rows: rows }));
  }
  /* 목록은 내려갈 때마다 더 실린다 — 더 늘지 않을 때까지 끝으로 내린다 */
  (function tick(){
    var list = cards(), n = list.length;
    note.textContent = "BEMESTATE · 매물 읽는 중 " + n + (total ? " / " + total : "");
    still = n === last ? still + 1 : 0;
    last = n;
    if ((total && n >= total) || still >= 5 || ++tries > 150) return done();
    list[n - 1].scrollIntoView({ block: "end" });
    var box = document.getElementById("complex_detail");
    if (box) box.scrollTop = box.scrollHeight;
    setTimeout(tick, 600);
  })();
}

/* 북마크에 넣을 주소. base: 이 앱의 주소 (뒤의 #… 없이) */
export function bookmarklet(base){
  return "javascript:" + encodeURIComponent("(" + grab.toString() + ")(" + JSON.stringify(base) + ")");
}

/* "15억 3,000" → 153000 (만원) */
function money(s){
  var m = String(s).replace(/,/g, "").match(/^\s*(?:(\d+)억)?\s*(\d+)?\s*$/);
  if (!m || (!m[1] && !m[2])) return 0;
  return (Number(m[1]) || 0) * 10000 + (Number(m[2]) || 0);
}

var TRADES = { "매매": "trade", "전세": "charter" };

/* 단추가 옮겨 온 글자들 → 서버에 보낼 매물들. 월세처럼 보지 않는 거래는 버린다. */
export function parse(rows){
  var out = [], seen = {};
  (rows || []).forEach(function(r){
    if (!Array.isArray(r)) return;
    var price = String(r[1] || "").match(/^(\S+)\s+(.+)$/);
    var trade = price && TRADES[price[1]];
    if (!trade) return;
    var span = price[2].split("~");
    var min = money(span[0]), max = span[1] ? money(span[1]) : 0;
    if (!min) return;
    var parts = String(r[2] || "").split("|");
    var area = parts.filter(function(p){ return /㎡/.test(p); })[0] || "";
    var floor = ((parts.filter(function(p){ return /층$/.test(p); })[0] || "").split("/")[0] || "").trim();
    var dong = (String(r[0] || "").match(/(\S+동)$/) || [])[1] || "";
    var l = {
      trade: trade, price: min, max: max,
      supply: Number((area.match(/([\d.]+)\s*㎡/) || [])[1]) || 0,
      exclusive: Number((area.match(/전용\s*([\d.]+)/) || [])[1]) || 0,
      dong: dong, floor: floor, title: String(r[5] || ""),
      n: Number((String(r[3] || "").match(/(\d+)\s*곳/) || [])[1]) || 1,
      item: /^\d+$/.test(String(r[4] || "")) ? String(r[4]) : ""
    };
    /* 날마다 같은 매물을 같은 것으로 알아보게 — 매물 번호는 묶인 매물에는 없을 수 있어
       동 · 층 · 면적으로 이름을 짓는다. 같은 자리에 둘이면 차례로 번호를 단다. */
    var key = [trade, dong, floor, l.exclusive || l.supply].join("|");
    seen[key] = (seen[key] || 0) + 1;
    l.id = key + "#" + seen[key];
    out.push(l);
  });
  return out;
}

/* "#/import/<단지>/<실어 온 것>"의 뒷부분을 푼다. 못 풀면 null */
export function unpack(payload){
  try{
    var data = JSON.parse(decodeURIComponent(payload));
    if (!data || !Array.isArray(data.rows)) return null;
    return { total: Number(data.total) || 0, rows: data.rows, listings: parse(data.rows) };
  }catch(e){ return null; }
}
