/* The screens: the watch list, one 단지 · 평형 over time, and the sheet that
   adds a new one. */
import { el, esc, icon, ripple, toast, toastDone, toastUndo } from "../ui/dom.js";
import { Store } from "../ui/store.js";
import { themeButton } from "../ui/theme.js";
import { brandMark, pageFooter } from "../ui/shell.js";
import { sheetShell, showOverlay, closeOverlay, askThenDelete, pickGroup, flag, openTextDialog } from "../ui/sheet.js";
import { won, delta, slotLabel, slotShort, dayShort, clock, floorLabel, PLATFORM,
         listingUrl, hogangnonoUrl, naverComplexUrl, naverSearchUrl } from "./format.js";
import { bookmarklet, unpack } from "./naver.js";
import { sparkline, flowChart, flowLegend, dealChart } from "./chart.js";

var nav = { go: function(){}, set: function(){}, reload: function(){} };
export function wire(n){ nav = n; }

var TRADE = { trade: "매매", charter: "전세" };

function chg(now, before){
  if (now == null || before == null) return "";
  var d = now - before;
  if (!d) return '<span class="chg">변동 없음</span>';
  return '<span class="chg ' + (d > 0 ? "up" : "down") + '">' + delta(d) + '</span>';
}

function place(address){
  return address ? '<span class="sub-place">' + icon("pin", "sub-pin") + esc(address) + '</span>' : "";
}

function outlink(label, url){
  return '<a class="outlink" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + icon("out") + '</a>';
}

/* ---------- the list ---------- */
export function renderList(view){
  var pad = el('<div class="pad"></div>');
  var head = el('<div class="page-head"><div class="page-title">' + brandMark() + '</div></div>');
  if (Store.state === "ok" && Store.watches.length){
    /* 카드로 볼지, 한 줄씩 볼지 */
    var mode = el('<button class="icon-btn" type="button" aria-label="' +
      (dense() ? "카드로 보기" : "간단히 보기") + '">' + icon(dense() ? "cards" : "rows") + '</button>');
    ripple(mode, function(){ setDense(!dense()); renderList(view); });
    head.appendChild(mode);
  }
  head.appendChild(themeButton(function(){ renderList(view); }));
  pad.appendChild(head);

  if (Store.state !== "ok"){
    pad.appendChild(el('<div class="blankstate"><div class="blankstate-mark">' + icon("alert") + '</div>' +
      '<h2>' + (Store.state === "setup" ? "서버 설정이 필요합니다" : "서버에 닿지 못했습니다") + '</h2>' +
      '<p>' + esc(Store.message || "잠시 후 다시 열어 주세요.") + '</p></div>'));
    return swap(view, pad);
  }

  var list = el('<div class="trip-list"></div>');
  if (!Store.watches.length){
    var blank = el('<div class="blankstate"><div class="blankstate-mark">' + icon("pin") + '</div>' +
      '<h2>관심 단지가 아직 없습니다</h2>' +
      '<p>단지와 평형을 등록하면 매일 낮 12시에 그날의 호가 목록을 기록합니다.</p>' +
      '<button class="btn btn-primary" type="button">' + icon("plus") + '관심 단지 추가</button></div>');
    ripple(blank.querySelector(".btn"), openAdd);
    pad.appendChild(blank);
  } else {
    if (dense()){
      /* 간단히 보기: 단지 하나가 카드 하나, 그 안에 평형이 한 줄씩 */
      var groups = [], byComplex = {};
      Store.watches.forEach(function(w){
        if (!byComplex[w.complex_id]) groups.push(byComplex[w.complex_id] = []);
        byComplex[w.complex_id].push(w);
      });
      groups.forEach(function(g){
        var box = el('<div class="trip-card dense-card"><div class="dense-head">' +
          '<span class="watch-name">' + esc(g[0].complex_name) + '</span>' + place(g[0].address) + '</div></div>');
        g.forEach(function(w){ box.appendChild(watchRow(w, view)); });
        list.appendChild(box);
      });
    } else Store.watches.forEach(function(w){ list.appendChild(watchCard(w, view)); });
    var add = el('<button class="addcard" type="button">' + icon("plus") + '관심 단지 추가</button>');
    ripple(add, openAdd);
    list.appendChild(add);
    pad.appendChild(list);
    pad.appendChild(el('<p class="store-note">매일 낮 12시에 기록합니다</p>'));
  }
  pad.appendChild(pageFooter());
  swap(view, pad);
}

function swap(view, node){
  view.innerHTML = "";
  view.appendChild(node);
  window.scrollTo(0, 0);
}

/* 간단히 보기를 골랐는가 — 이 브라우저가 기억한다 */
function dense(){
  try{ return localStorage.getItem("estate.dense") === "1"; }catch(e){ return false; }
}
function setDense(on){
  try{ localStorage.setItem("estate.dense", on ? "1" : "0"); }catch(e){ /* private mode */ }
}

/* 지우고, 몇 초 동안 되돌릴 수 있게 한다. 어디서 지우든 이 길이다. */
var UNDO_MS = 5000;
function removeWatch(w, repaint){
  return Store.removeSoon(w, UNDO_MS, repaint);
}

/*
 * 왼쪽으로 밀면 삭제 단추가 드러난다. `slide`가 미는 면이고 `wrap`이 그 틀이다.
 * 밀고 난 뒤의 손 뗌은 누름으로 치지 않는다 — 밀다가 화면이 넘어가면 안 된다.
 */
var OPEN_X = 80;
var opened = null;         /* 지금 열려 있는 것 하나. 다른 데를 건드리면 닫힌다 */
function swipeToDelete(wrap, slide, w, view){
  var act = el('<button class="swipe-del" type="button" aria-label="' + esc(w.complex_name + " " + w.room_label) +
    ' 삭제" tabindex="-1"><i>' + icon("trash") + '</i><span>삭제</span></button>');
  wrap.insertBefore(act, wrap.firstChild);
  var x0 = 0, y0 = 0, from = 0, dx = 0, drag = false, moved = false, id = null;
  function set(x, smooth){
    slide.style.transition = smooth ? "transform 200ms cubic-bezier(0.2, 0, 0, 1)" : "none";
    slide.style.transform = x ? "translateX(" + x + "px)" : "";
    wrap.classList.toggle("swiped", x < 0);
  }
  function close(){ set(0, true); act.tabIndex = -1; if (opened === close) opened = null; }
  slide.addEventListener("pointerdown", function(e){
    if (e.button && e.button !== 0) return;
    /* 다른 줄이 열려 있었으면 이 누름은 그것을 닫는 데 쓰인다 — 화면을 넘기지 않는다 */
    var other = opened && opened !== close;
    if (other) opened();
    x0 = e.clientX; y0 = e.clientY; from = opened === close ? -OPEN_X : 0; dx = 0;
    drag = false; moved = !!other; id = e.pointerId;
  });
  slide.addEventListener("pointermove", function(e){
    if (id !== e.pointerId) return;
    var mx = e.clientX - x0, my = e.clientY - y0;
    if (!drag){
      if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(my) * 1.2) return;
      drag = true; moved = true;
      try{ slide.setPointerCapture(id); }catch(err){ /* 이미 놓였다 */ }
    }
    dx = Math.max(-OPEN_X - 24, Math.min(0, from + mx));
    set(dx, false);
  });
  function up(e){
    if (id !== e.pointerId) return;
    id = null;
    if (!drag) return;
    drag = false;
    if (dx < -OPEN_X / 2){ set(-OPEN_X, true); opened = close; act.tabIndex = 0; }
    else close();
  }
  slide.addEventListener("pointerup", up);
  slide.addEventListener("pointercancel", up);
  /* 민 직후의 클릭, 그리고 열려 있을 때의 클릭은 닫기만 한다 */
  slide.addEventListener("click", function(e){
    if (moved || opened === close){
      e.stopImmediatePropagation(); e.preventDefault();
      if (!moved) close();
      moved = false;
    }
  }, true);
  ripple(act, function(){
    opened = null;
    var undo = removeWatch(w, function(){ renderList(view); });
    renderList(view);
    toastUndo("삭제했습니다.", undo);
  });
}

function nums(w){
  var series = Store.series[w.id] || [];
  return { series: series, last: series[series.length - 1], prev: series[series.length - 2], deal: w.last_deal };
}

/* 간단히 보기의 한 줄: 평형, 작은 추이선, 최저 호가와 그 아래 견줄 값 하나 */
function watchRow(w, view){
  var n = nums(w);
  var under = n.deal ? '실거래 ' + won(n.deal.price)
    : n.prev && n.last ? chg(n.last.min_price, n.prev.min_price) : "";
  var row = el('<div class="dense-row"><button class="dense-open" type="button">' +
    '<span class="dense-id"><span class="watch-type">' + esc(w.room_label) + '</span>' +
      '<small>' + TRADE[w.trade] + (n.last ? ' · 매물 ' + n.last.count + '건' : ' · 기록 전') + '</small></span>' +
    sparkline(n.series.map(function(s){ return s.min_price; })) +
    '<span class="dense-num"><b>' + (n.last && n.last.min_price != null ? won(n.last.min_price) : "—") + '</b>' +
      (under ? '<small>' + under + '</small>' : '') + '</span></button></div>');
  var open = row.querySelector(".dense-open");
  swipeToDelete(row, open, w, view);
  ripple(open, function(){ nav.go("/w/" + encodeURIComponent(w.id)); });
  return row;
}

function watchCard(w, view){
  var series = Store.series[w.id] || [];
  var last = series[series.length - 1];
  var prev = series[series.length - 2];
  var deal = w.last_deal;
  var wrap = el('<div class="swipe"><div class="trip-card"><button class="trip-open" type="button">' +
    '<div class="watch-top"><div class="watch-id">' +
      '<span class="watch-name">' + esc(w.complex_name) + '</span>' + place(w.address) +
    '</div><span class="watch-type">' + esc(w.room_label) + '</span></div>' +
    '<div class="watch-mid"><div class="watch-price"><span class="lbl">' + TRADE[w.trade] + ' 최저 호가</span>' +
      (last && last.min_price != null
        ? '<b>' + won(last.min_price) + '</b>'
        : '<b class="none">' + (last ? "매물 없음" : "아직 기록이 없습니다") + '</b>') +
    '</div>' +
    /* 호가와 실거래를 같은 크기로 나란히 — 둘을 견주는 것이 이 카드의 일이다 */
    (deal ? '<div class="watch-price deal"><span class="lbl">최근 실거래 · ' + dayShort(deal.date) + '</span>' +
      '<b>' + won(deal.price) + '</b></div>' : '') + '</div>' +
    (last ? '<div class="watch-foot"><span>매물 <b>' + last.count + '</b>건</span>' +
      (prev ? chg(last.min_price, prev.min_price) : "") +
      sparkline(series.map(function(s){ return s.min_price; })) +
      '<span class="watch-when">' + slotShort(last.slot) + '</span></div>' : "") +
    '</button></div></div>');
  /* 카드가 통째로 비켜서고, 그 자리에 삭제가 선다 */
  swipeToDelete(wrap, wrap.querySelector(".trip-card"), w, view);
  ripple(wrap.querySelector(".trip-open"), function(){ nav.go("/w/" + encodeURIComponent(w.id)); });
  return wrap;
}

/* ---------- one watch ---------- */
var shown = 0;       /* 늦게 도착한 답이 다른 화면을 덮지 않게 */

export function renderWatch(view, id, slot){
  var w = Store.watch(id);
  var mine = ++shown;
  var page = el('<div class="tabpad"></div>');
  var hero = el('<div class="hero"><div class="hero-top">' +
    '<button class="icon-btn hero-back" type="button" aria-label="목록으로">' + icon("back") + '</button>' +
    '<div class="hero-id"><h1 class="hero-city">' + esc(w.complex_name) + '</h1></div></div>' +
    '<div class="hero-sub">' + place(w.address) +
      '<span class="watch-type">' + esc(w.room_label) + '</span>' +
      '<span class="watch-trade">' + TRADE[w.trade] + '</span></div>' +
    '<div class="hero-sub links">' + outlink("호갱노노", hogangnonoUrl(w)) +
      (w.naver_id ? outlink("네이버 부동산", naverComplexUrl(w.naver_id)) : '') + '</div></div>');
  ripple(hero.querySelector(".hero-back"), function(){ nav.go("/"); });
  var link = el('<button class="outlink" type="button">' + (w.naver_id ? "네이버 매물 가져오기" : "네이버 연결") +
    icon("plus") + '</button>');
  ripple(link, function(){ if (w.naver_id) openNaverImport(w); else openNaverLink(w); });
  hero.querySelector(".links").appendChild(link);
  page.appendChild(hero);
  var body = el('<div><div class="card"><span class="bar bar-s"></span><span class="bar bar-m"></span>' +
    '<span class="bar bar-l"></span></div></div>');
  page.appendChild(body);
  swap(view, page);

  Store.history(id).then(function(data){
    if (mine !== shown || !data) return;
    var history = data.history || [];
    var full = data.watch || w;
    var hg = hero.querySelector(".links a.outlink");
    if (hg) hg.href = hogangnonoUrl(full);
    body.innerHTML = "";
    if (!history.length){
      body.appendChild(el('<div class="card dashed"><p class="card-empty">아직 기록이 없습니다. ' +
        '다음 낮 12시에 첫 기록이 남습니다.</p></div>'));
      body.appendChild(dealsCard(full));
      body.appendChild(removeFoot(w));
      return;
    }
    var at = history.length - 1;
    history.forEach(function(s, i){ if (s.slot === slot) at = i; });
    if (slot !== "now") return paintWatch(body, hero, full, history, at, mine, null);
    /* 현재: 기록을 먼저 그려 두고, 지금 올라와 있는 것을 받아 오면 바꿔 그린다 */
    paintWatch(body, hero, full, history, at, mine, "wait");
    return Store.live(id).then(function(live){
      if (mine !== shown || !live) return;
      paintWatch(body, hero, full, history, at, mine, live);
    }).catch(function(e){
      if (mine !== shown) return;
      toast("지금 호가를 받아오지 못했습니다 — " + e.message, true);
      paintWatch(body, hero, full, history, at, mine, null);
    });
  }).catch(function(e){
    if (mine !== shown) return;
    body.innerHTML = "";
    body.appendChild(el('<div class="card dashed"><p class="card-empty">기록을 불러오지 못했습니다 — ' +
      esc(e.message) + '</p></div>'));
  });
}

function liveDeals(w){ return (w.deals || []).filter(function(d){ return !d.canceled; }); }

/* live: null(기록을 본다) · "wait"(지금 것을 받는 중) · { snapshot, previous }(지금 것) */
function paintWatch(body, hero, w, history, at, mine, live){
  var now = live && live !== "wait" ? live.snapshot : null;
  var snap = now || history[at], before = now ? history[history.length - 1] : history[at - 1];
  var deal = liveDeals(w)[0];
  var old = hero.querySelector(".now");
  if (old) old.remove();
  var gap = "";
  if (deal && snap.min_price != null){
    var d = snap.min_price - deal.price;
    gap = '<span class="gap">최저 호가가 ' + (d ? won(Math.abs(d)) + (d > 0 ? " 높음" : " 낮음") : "같음") + '</span>';
  }
  hero.appendChild(el('<div class="now">' +
    '<div class="now-label">' + TRADE[w.trade] + ' 최저 호가<span class="now-when">' +
      (now ? "현재 · " + clock(now.taken_at) + " 기준" : slotLabel(snap.slot)) + '</span></div>' +
    '<div class="now-big"><b>' + won(snap.min_price) + '</b>' + (before ? chg(snap.min_price, before.min_price) : "") + '</div>' +
    '<div class="now-stats">' +
      '<div><span class="lbl">중간</span><b>' + won(snap.med_price) + '</b></div>' +
      '<div><span class="lbl">최고</span><b>' + won(snap.max_price) + '</b></div>' +
      '<div><span class="lbl">매물</span><b>' + snap.count + '건</b></div>' +
    '</div>' +
    (deal ? '<div class="now-deal"><span class="lbl">최근 실거래</span><b>' + won(deal.price) + '</b>' +
      '<span>' + [floorLabel(deal.floor), dayShort(deal.date)].filter(Boolean).join(" · ") + '</span>' + gap + '</div>' : '') +
    '</div>'));

  body.innerHTML = "";
  function pick(i){
    nav.set("/w/" + encodeURIComponent(w.id) +
      (i === "now" ? "/now" : i === history.length - 1 ? "" : "/" + history[i].slot));
  }

  /* 호가 흐름 — 그날그날 호가가 걸쳐 있던 폭과 실거래를 한 그림에 */
  var chart = el('<div class="card chart-card"><div class="card-head"><h3>호가 흐름' +
    '<span class="card-n">' + history.length + '일</span></h3></div></div>');
  chart.appendChild(flowChart(history.map(function(s){
    return { slot: s.slot, label: slotLabel(s.slot), min: s.min_price, med: s.med_price, max: s.max_price, count: s.count };
  }), w.deals, live ? history.length - 1 : at, pick));
  chart.appendChild(flowLegend(liveDeals(w).length > 0));
  body.appendChild(chart);

  /* 어느 날을 볼지 — 최근 것이 앞에 */
  var row = el('<div class="chiprow slotrow"></div>');
  var nowChip = el('<button class="chip live" type="button" aria-pressed="' + !!live + '"><i></i>현재</button>');
  ripple(nowChip, function(){ pick("now"); });
  row.appendChild(nowChip);
  for (var i = history.length - 1; i >= 0; i--){
    (function(i){
      var b = el('<button class="chip" type="button" aria-pressed="' + (!live && i === at) + '">' +
        slotShort(history[i].slot) + '</button>');
      ripple(b, function(){ pick(i); });
      row.appendChild(b);
    })(i);
  }
  body.appendChild(row);

  var list = el('<div class="card" style="margin-top:12px"><div class="card-head"><h3>' +
    (live ? "지금 호가 목록" : "호가 목록") +
    (live === "wait" ? '' : '<span class="card-n">' + snap.count + '건</span>') + '</h3></div>' +
    '<p class="card-empty">' + (live === "wait" ? "지금 올라와 있는 매물을 받아오는 중…" : "불러오는 중…") + '</p></div>');
  body.appendChild(list);
  body.appendChild(dealsCard(w));
  body.appendChild(removeFoot(w));

  if (live === "wait") return;
  (now ? Promise.resolve(live) : Store.snapshot(w.id, snap.slot)).then(function(data){
    if (mine !== shown || !data || !list.parentNode) return;
    list.querySelector(".card-empty").remove();
    var key = function(l){ return (l.src || "zigbang") + ":" + l.id; };
    var rows = (data.snapshot && data.snapshot.listings) || [];
    var was = data.previous ? data.previous.listings || [] : null;
    var wasBy = {}, nowBy = {};
    (was || []).forEach(function(l){ wasBy[key(l)] = l; });
    rows.forEach(function(l){ nowBy[key(l)] = l; });
    /* 어제는 받지 못한 곳의 매물을 오늘 '신규'라 부르면 거짓말이다 */
    var hadSrc = {};
    (was || []).forEach(function(l){ hadSrc[l.src || "zigbang"] = true; });
    var nowSrc = {};
    rows.forEach(function(l){ nowSrc[l.src || "zigbang"] = true; });

    if (!rows.length) list.appendChild(el('<p class="card-empty">' +
      (now ? "지금은 올라온 매물이 없습니다." : "이날은 올라온 매물이 없었습니다.") + '</p>'));
    rows.forEach(function(l){
      var mark = "", o = wasBy[key(l)];
      if (was && hadSrc[l.src || "zigbang"]){
        if (!o) mark = '<span class="badge new">신규</span>';
        else if (o.price !== l.price) mark = '<span class="chg ' + (l.price > o.price ? "up" : "down") + '">' +
          delta(l.price - o.price) + '</span>';
      }
      list.appendChild(askRow(l, mark, false, w));
    });

    var sources = (data.snapshot && data.snapshot.sources) || {};
    var failed = Object.keys(sources).filter(function(k){ return sources[k] === "fail"; });
    if (failed.length) list.appendChild(el('<p class="src-note">' +
      failed.map(function(k){ return PLATFORM[k] || k; }).join(" · ") + ' 매물은 ' + (now ? "지금" : "이날") + ' 받지 못했습니다.</p>'));

    if (w.naver_id && sources.naver !== "ok"){
      var note = el('<p class="src-note">네이버 매물은 ' + (now ? "가져오기로만 기록됩니다" : "이날 가져오지 않았습니다") +
        ' · <button class="inline-link" type="button">가져오는 방법</button></p>');
      note.querySelector("button").addEventListener("click", function(){ openNaverImport(w); });
      list.appendChild(note);
    }

    var gone = (was || []).filter(function(l){ return !nowBy[key(l)] && nowSrc[l.src || "zigbang"]; });
    if (gone.length){
      var card = el('<div class="card dashed gone"><div class="card-head"><h3>' + (now ? "마지막 기록 이후 빠진 매물" : "직전 기록 이후 빠진 매물") +
        '<span class="card-n">' + gone.length + '건</span></h3></div></div>');
      gone.forEach(function(l){ card.appendChild(askRow(l, "", true)); });
      list.parentNode.insertBefore(card, list.nextSibling);
    }
  }).catch(function(e){
    if (mine !== shown) return;
    var p = list.querySelector(".card-empty");
    if (p) p.textContent = "목록을 불러오지 못했습니다 — " + e.message;
  });
}

/* 매물 한 줄. 누르면 그 매물을 올린 곳의 화면이 새 창으로 열린다 —
   빠진 매물은 갈 곳이 없으니 줄만 남는다. */
function askRow(l, mark, dead, w){
  var src = l.src || "zigbang";
  var where = [l.dong, floorLabel(l.floor)].filter(Boolean).join(" · ");
  var url = dead ? "" : listingUrl(l, w);
  var inner = '<span class="ask-price">' + won(l.price) + '</span>' +
    '<span class="ask-body"><b>' + esc(where || "동 · 층 미상") +
      '<span class="badge src ' + src + '">' + esc(PLATFORM[src] || src) + '</span></b>' +
      (l.title ? '<small>' + esc(l.title) + '</small>' : '') + '</span>' +
    '<span class="ask-mark">' + mark +
      (l.n > 1 ? '<span class="badge">중개 ' + l.n + '곳</span>' : '') + '</span>';
  return el(url
    ? '<a class="askrow" href="' + esc(url) + '" target="_blank" rel="noopener">' + inner + '</a>'
    : '<div class="askrow">' + inner + '</div>');
}

/* 실거래를 볼 기간. 고른 것은 화면을 옮겨도 그대로다 */
var PERIODS = [
  { key: "5y", label: "전체 (5년)", said: "최근 5년", months: 60 },
  { key: "3y", label: "최근 3년", said: "최근 3년", months: 36 },
  { key: "1y", label: "최근 1년", said: "최근 1년", months: 12 },
  { key: "3m", label: "최근 3개월", said: "최근 3개월", months: 3 }
];
var period = "5y";
var LIST_FIRST = 30;

function since(months){
  var to = new Date();
  return isoDay(new Date(to.getFullYear(), to.getMonth() - months, to.getDate()));
}

function isoDay(d){
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function dealsCard(w){
  var all = w.deals || [];
  var card = el('<div class="card t-deal" style="margin-top:12px"><div class="card-head"><h3>실거래' +
    '</h3></div></div>');
  if (!all.length){
    card.appendChild(el('<p class="card-empty">' + (w.deals_error ? "실거래가를 받아오지 못했습니다 — " + esc(w.deals_error) : Store.deals
      ? (!w.exclusive_m2 ? "이 평형의 전용 면적을 몰라 실거래를 가려낼 수 없습니다."
        : w.deals_complete ? "최근 5년 안에 신고된 거래가 없습니다."
        : "실거래가를 받아오는 중입니다. 잠시 뒤 다시 열어 주세요.")
      : "실거래가 인증키(MOLIT_SERVICE_KEY)를 넣으면 국토교통부 실거래가를 함께 보여줍니다.") + '</p>'));
    return card;
  }

  /* 기간마다 몇 건인지 단추에 적어 둔다 — 눌러 보지 않아도 어디에 거래가 있는지 보인다 */
  var picks = el('<div class="pickrow scroll deal-periods"></div>');
  var body = el('<div></div>');
  card.appendChild(picks);
  card.appendChild(body);
  pickGroup(picks, PERIODS.map(function(p){
    var from = since(p.months);
    return { key: p.key, label: p.label + " " + all.filter(function(d){ return d.date >= from; }).length };
  }), function(){ return period; }, function(k){ period = k; paint(false); });

  function paint(more){
    var p = PERIODS.filter(function(x){ return x.key === period; })[0];
    var fromIso = since(p.months), toIso = isoDay(new Date());
    var inRange = all.filter(function(d){ return d.date >= fromIso; });
    var live = inRange.filter(function(d){ return !d.canceled; });
    body.innerHTML = "";
    if (!inRange.length){
      body.appendChild(el('<p class="card-empty">' + p.said + ' 동안 신고된 거래가 없습니다.' +
        (all.length ? ' 전체 ' + all.length + '건은 더 긴 기간에 있습니다.' : '') + '</p>'));
      return note();
    }
    if (live.length){
      var prices = live.map(function(d){ return d.price; });
      var sum = prices.reduce(function(a, b){ return a + b; }, 0);
      body.appendChild(el('<div class="now-stats deal-stats">' +
        '<div><span class="lbl">거래</span><b>' + live.length + '건</b></div>' +
        '<div><span class="lbl">평균</span><b>' + won(Math.round(sum / prices.length / 100) * 100) + '</b></div>' +
        '<div><span class="lbl">최고</span><b>' + won(Math.max.apply(null, prices)) + '</b></div>' +
        '<div><span class="lbl">최저</span><b>' + won(Math.min.apply(null, prices)) + '</b></div></div>'));
      body.appendChild(dealChart(live, fromIso, toIso));
      body.appendChild(el('<div class="legend"><span><i class="lg deal"></i>거래</span>' +
        '<span><i class="lg dealavg"></i>월 평균</span></div>'));
    }
    body.appendChild(el('<p class="deal-count">' + p.said + ' <b>' + inRange.length + '건</b>' +
      (inRange.length < all.length ? ' · 전체 ' + all.length + '건 중' : '') +
      (inRange.length > live.length ? ' · 해제 ' + (inRange.length - live.length) + '건 포함' : '') + '</p>'));
    /* 달마다 묶어서 — 언제 얼마나 거래됐는지가 먼저 보이게 */
    var shownRows = more ? inRange : inRange.slice(0, LIST_FIRST);
    var month = "";
    shownRows.forEach(function(d){
      var m = d.date.slice(0, 7);
      if (m !== month){
        month = m;
        var n = inRange.filter(function(x){ return x.date.slice(0, 7) === m; }).length;
        body.appendChild(el('<div class="deal-month">' + m.replace("-", ".") + '<span>' + n + '건</span></div>'));
      }
      body.appendChild(el('<div class="deal-row' + (d.canceled ? " off" : "") + '"><b>' + won(d.price) + '</b>' +
        '<span>' + esc(floorLabel(d.floor) || "층 미상") + (d.canceled ? " · 해제" : "") + '</span>' +
        '<span class="when">' + Number(d.date.slice(8, 10)) + '일</span></div>'));
    });
    if (!more && inRange.length > LIST_FIRST){
      var b = el('<button class="btn btn-quiet deal-more" type="button">' + inRange.length + '건 중 ' + LIST_FIRST +
        '건을 보는 중 · 나머지 ' + (inRange.length - LIST_FIRST) + '건 모두 보기</button>');
      ripple(b, function(){ paint(true); });
      body.appendChild(b);
    }
    note();
  }
  function note(){
    body.appendChild(el('<p class="src-note">국토교통부 실거래가 공개시스템 · 전용 ' + esc(String(w.exclusive_m2)) + '㎡' +
      (w.deals_complete === false ? ' · 5년치를 거슬러 받는 중입니다 — 다시 열면 더 채워집니다' : '') + '</p>'));
  }
  paint(false);
  return card;
}

function removeFoot(w){
  var foot = el('<div class="dangerfoot"></div>');
  if (w.naver_id){
    var relink = el('<button class="linkbtn" type="button">' + icon("link") + '네이버 연결 바꾸기</button>');
    ripple(relink, function(){ openNaverLink(w); });
    foot.appendChild(relink);
  }
  var off = el('<button class="linkbtn danger" type="button">' + icon("trash") + '삭제</button>');
  ripple(off, function(){
    askThenDelete(w.complex_name + " " + w.room_label, function(){
      /* 목록으로 나가고, 되돌리면 목록에 다시 선다 */
      var undo = removeWatch(Store.watch(w.id) || w, function(){ nav.reload(); });
      nav.go("/");
      return undo;
    });
  });
  foot.appendChild(off);
  return foot;
}

/* 네이버 부동산의 그 단지를 잇는다. 같은 단지의 다른 평형에도 함께 걸린다. */
function openNaverLink(w){
  openTextDialog({
    title: "네이버 부동산 연결",
    value: w.naver_id ? naverComplexUrl(w.naver_id) : "",
    placeholder: "https://fin.land.naver.com/complexes/…",
    hint: "네이버 부동산에서 이 단지를 열고 주소를 붙여넣어 주세요. 단지 번호만 적어도 됩니다.",
    okLabel: "연결"
  }, function(value){
    Store.post({ link: { complexId: w.complex_id, naver: value } }).then(function(data){
      if (!data) return;
      var was = w.naver_id || "";
      if (was === data.naverId) toastDone("네이버 부동산을 연결했습니다.");
      else toastUndo("네이버 연결을 수정했습니다.", function(){
        Store.post({ link: { complexId: w.complex_id, naver: was } }).then(function(){
          toastDone("되돌렸습니다."); nav.reload();
        }).catch(function(e){ toast("되돌리지 못했습니다 — " + e.message, true); });
      }, "edit");
      nav.reload();
    }).catch(function(e){ toast("연결하지 못했습니다 — " + e.message, true); });
    return null;
  });
}

/* 네이버 매물을 가져오는 법. 서버는 네이버에 닿지 못해서, 내 브라우저에 떠 있는 매물 탭을
   북마크 단추로 읽어 온다 (estate/naver.js). */
function openNaverImport(w){
  var sheet = sheetShell("네이버 매물 가져오기", w.complex_name);
  var code = bookmarklet(location.origin + location.pathname);
  var body = sheet.querySelector(".sheet-body");
  body.appendChild(el('<ol class="guide">' +
    '<li><b>처음 한 번</b> — 아래 단추를 브라우저의 북마크바로 끌어다 놓습니다.' +
      '<div class="guide-row"><a class="bookmark" href="' + esc(code) + '">' + icon("link") + 'BEMESTATE 가져오기</a>' +
      '<button class="linkbtn" type="button" data-copy>주소 복사</button></div>' +
      '<small>휴대폰에서는 아무 화면이나 북마크한 뒤, 그 북마크의 주소를 복사한 것으로 바꿔 넣습니다.</small></li>' +
    '<li>네이버 부동산에서 이 단지의 <a href="' + esc(naverComplexUrl(w.naver_id)) +
      '" target="_blank" rel="noopener">매물 탭</a>을 엽니다. 거래 방식 · 면적을 걸러 두었다면 풀어 주세요.</li>' +
    '<li>그 화면에서 북마크 <b>BEMESTATE 가져오기</b>를 누릅니다. 목록을 끝까지 읽은 뒤 이 화면으로 돌아와 ' +
      '오늘 기록에 넣습니다.</li></ol>' +
    '<p class="src-note">같은 단지의 다른 관심 평형도 한 번에 채워집니다. 하루에 여러 번 가져오면 마지막 것이 남습니다.</p>'));
  body.querySelector(".bookmark").addEventListener("click", function(e){
    e.preventDefault();
    toast("누르지 말고, 북마크바로 끌어다 놓아 주세요.");
  });
  body.querySelector("[data-copy]").addEventListener("click", function(){
    navigator.clipboard.writeText(code).then(function(){ toastDone("북마크 주소를 복사했습니다."); })
      .catch(function(){ toast("복사하지 못했습니다. 단추를 길게 눌러 링크 주소를 복사해 주세요.", true); });
  });
  sheet.querySelector(".sheet-foot").hidden = true;
  showOverlay(sheet);
}

/* 북마크 단추가 네이버 화면에서 읽어 온 것을 받아 오늘 기록에 넣는다 ("#/import/<단지>/<…>") */
export function renderImport(view, complex, payload){
  var got = unpack(payload);
  var page = el('<div class="tabpad"><div class="card"><div class="card-head"><h3>네이버 매물 가져오기</h3></div>' +
    '<p class="card-empty">읽어 온 매물을 기록하는 중…</p></div></div>');
  swap(view, page);
  if (!got || !got.rows.length){
    toast("읽어 온 매물이 없습니다. 네이버 매물 탭에서 다시 눌러 주세요.", true);
    return nav.set("/");
  }
  Store.post({ importNaver: { complex: complex, listings: got.listings } }).then(function(data){
    var n = data.watches.reduce(function(sum, x){ return sum + x.count; }, 0);
    var each = data.watches.map(function(x){
      var w = Store.watch(x.id);
      return (w ? w.room_label + " " + TRADE[w.trade] : x.id) + " " + x.count + "건";
    }).join(" · ");
    var short = got.total > got.rows.length ? " (네이버 " + got.total + "건 중 " + got.rows.length + "건만 읽었습니다)" : "";
    var first = data.watches.filter(function(x){ return x.count; })[0] || data.watches[0];
    if (n) toastDone("네이버 매물을 기록했습니다 — " + each + short);
    else toast("관심 평형에 맞는 네이버 매물이 없었습니다 (읽은 매물 " + got.rows.length + "건)" + short, true);
    Store.load().then(function(){ nav.set("/w/" + encodeURIComponent(first.id)); });
  }).catch(function(e){
    toast("네이버 매물을 기록하지 못했습니다 — " + e.message, true);
    nav.set("/");
  });
}

/* ---------- adding a watch ---------- */
function openAdd(){
  var sheet = sheetShell("관심 단지 추가");
  var body = sheet.querySelector(".sheet-body");
  var foot = sheet.querySelector(".sheet-foot");
  var save = el('<button class="btn btn-primary" type="button">등록</button>');
  foot.appendChild(save);
  foot.hidden = true;

  var chosen = null, trade = "trade", types = [], picked = {}, naverInput = null;
  var asked = 0;

  function stepSearch(){
    chosen = null; foot.hidden = true;
    body.innerHTML = "";
    var fld = el('<div class="fld"><label for="q">단지 이름</label>' +
      '<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="예: 헬리오시티"></div>');
    var out = el('<div></div>');
    body.appendChild(fld);
    body.appendChild(out);
    var input = fld.querySelector("input"), timer = null;
    function find(){
      var q = input.value.trim();
      if (q.length < 2){ out.innerHTML = ""; return; }
      var mine = ++asked;
      out.innerHTML = '<p class="card-empty">찾는 중…</p>';
      Store.search(q).then(function(data){
        if (mine !== asked || !data) return;
        out.innerHTML = "";
        if (!data.complexes.length){
          out.appendChild(el('<p class="card-empty">찾은 아파트 단지가 없습니다.</p>'));
          return;
        }
        data.complexes.forEach(function(c){
          var b = el('<button class="found" type="button"><span class="rowbody"><b>' + esc(c.name) + '</b>' +
            '<small>' + esc(c.address) + (c.households ? " · " + c.households.toLocaleString() + "세대" : "") +
            '</small></span>' + icon("go") + '</button>');
          ripple(b, function(){ chosen = c; stepTypes(); });
          out.appendChild(b);
        });
      }).catch(function(e){
        if (mine !== asked) return;
        out.innerHTML = "";
        out.appendChild(el('<p class="card-empty"></p>')).textContent = "찾지 못했습니다 — " + e.message;
      });
    }
    input.addEventListener("input", function(){ clearTimeout(timer); timer = setTimeout(find, 350); });
    input.addEventListener("keydown", function(e){
      if (e.key === "Enter" && !e.isComposing){ clearTimeout(timer); find(); }
    });
    setTimeout(function(){ input.focus(); }, 60);
  }

  function stepTypes(){
    body.innerHTML = "";
    picked = {};
    var top = el('<div class="chosen"><span class="rowbody"><b>' + esc(chosen.name) + '</b>' +
      '<small>' + esc(chosen.address) + '</small></span>' +
      '<button class="quietbtn" type="button">다시 찾기</button></div>');
    ripple(top.querySelector("button"), stepSearch);
    body.appendChild(top);

    var tr = el('<div class="fld"><label>거래</label><div class="pickrow"></div></div>');
    pickGroup(tr.querySelector(".pickrow"),
      Object.keys(TRADE).map(function(k){ return { key: k, label: TRADE[k] }; }),
      function(){ return trade; }, function(k){ trade = k; paintTypes(); });
    body.appendChild(tr);

    body.appendChild(el('<div class="fld"><label>평형 <span class="opt">여럿 고를 수 있음</span></label>' +
      '<div class="pickrow" id="types"><p class="card-empty">평형을 불러오는 중…</p></div>' +
      '<p class="fld-hint">숫자는 지금 직방에 올라와 있는 매물 수입니다.</p></div>'));

    /* 네이버 부동산은 단지 번호가 따로다. 먼저 이름으로 찾아보고, 안 되면 붙여넣게 한다. */
    var nv = el('<div class="fld"><label for="nv">네이버 부동산 단지 <span class="opt">선택</span></label>' +
      '<input id="nv" type="url" inputmode="url" autocomplete="off" placeholder="찾는 중…">' +
      '<p class="fld-hint">찾는 중…</p></div>');
    body.appendChild(nv);
    naverInput = nv.querySelector("input");
    var hint = nv.querySelector(".fld-hint");
    var manual = '네이버 부동산에서 <a href="' + esc(naverSearchUrl(chosen.name)) +
      '" target="_blank" rel="noopener">이 단지를 열고</a> 그 주소를 붙여넣으면 네이버 매물도 함께 기록합니다.';
    var mine = asked;
    Store.findNaver(chosen.id, chosen.name).then(function(data){
      if (mine !== asked && !naverInput.isConnected) return;
      naverInput.placeholder = "https://new.land.naver.com/complexes/…";
      if (data && data.naverId && !naverInput.value){
        naverInput.value = naverComplexUrl(data.naverId);
        hint.innerHTML = '자동으로 찾은 네이버 단지입니다. <a href="' + esc(naverComplexUrl(data.naverId)) +
          '" target="_blank" rel="noopener">맞는지 열어 보기</a>';
      } else hint.innerHTML = "자동으로 찾지 못했습니다. " + manual;
    }).catch(function(){
      naverInput.placeholder = "https://new.land.naver.com/complexes/…";
      hint.innerHTML = manual;
    });

    foot.hidden = false;
    var asking = ++asked;
    Store.types(chosen.id).then(function(data){
      if (asking !== asked || !data) return;
      types = data.types;
      paintTypes();
    }).catch(function(e){
      if (asking !== asked) return;
      var row = body.querySelector("#types");
      row.innerHTML = "";
      row.appendChild(el('<p class="card-empty"></p>')).textContent = "불러오지 못했습니다 — " + e.message;
    });
  }

  function paintTypes(){
    var row = body.querySelector("#types");
    if (!row || !types.length) return;
    row.innerHTML = "";
    types.forEach(function(t){
      var b = el('<button class="pick" type="button" aria-pressed="' + !!picked[t.id] + '">' + esc(t.label) +
        '<span class="pick-n">' + ((t.count && t.count[trade]) || 0) + '</span></button>');
      ripple(b, function(){
        picked[t.id] = !picked[t.id];
        b.setAttribute("aria-pressed", String(!!picked[t.id]));
      });
      row.appendChild(b);
    });
  }

  ripple(save, function(){
    if (save.disabled) return;
    var want = types.filter(function(t){ return picked[t.id]; });
    if (!want.length) return flag(null, "평형을 하나 이상 골라 주세요.");
    var nv = naverInput ? naverInput.value.trim() : "";
    if (nv && !/(complex(es)?\/(info\/)?\d+|hscpNo=\d+|^\d+$)/.test(nv)){
      return flag(naverInput, "네이버 부동산 단지 주소를 확인해 주세요.");
    }
    save.disabled = true;
    save.textContent = "등록하는 중…";
    Store.post({ add: {
      complexId: chosen.id, complexName: chosen.name, address: chosen.address, trade: trade, naver: nv,
      types: want.map(function(t){ return { id: t.id, label: t.label, supply: t.supply, exclusive: t.exclusive }; })
    } }).then(function(data){
      if (!data){ save.disabled = false; save.textContent = "등록"; return; }
      closeOverlay();
      if (!data.added.length) toast("이미 등록된 평형입니다.");
      else if (!data.first || !data.first.saved) toast("등록했습니다. 첫 기록은 다음 낮 12시에 남습니다.", true);
      else toastDone("등록하고 첫 호가를 기록했습니다.");
      nav.reload();
    }).catch(function(e){
      save.disabled = false; save.textContent = "등록";
      toast("등록하지 못했습니다 — " + e.message, true);
    });
  });

  stepSearch();
  showOverlay(sheet);
}
