/* The screens: the watch list, one 단지 · 평형 over time, and the sheet that
   adds a new one. */
import { el, esc, icon, ripple, toast, toastDone, toastUndo } from "../ui/dom.js";
import { Store } from "../ui/store.js";
import { themeButton } from "../ui/theme.js";
import { brandMark, pageFooter } from "../ui/shell.js";
import { sheetShell, showOverlay, closeOverlay, askThenDelete, pickGroup, flag, openTextDialog, openLoginDialog } from "../ui/sheet.js";
import { won, delta, slotLabel, slotShort, dayShort, clock, floorLabel, PLATFORM,
         listingUrl, hogangnonoUrl, naverComplexUrl, naverSearchUrl } from "./format.js";
import { sparkline, flowChart, flowLegend, dealChart } from "./chart.js";

var nav = { go: function(){}, set: function(){}, reload: function(){} };
export function wire(n){
  nav = { go: n.go, set: n.set, reload: function(){ openWatch = null; return n.reload(); } };   /* 고친 뒤에는 새로 짓는다 */
}

var TRADE = { trade: "매매", charter: "전세" };

function chg(now, before){
  if (now == null || before == null) return "";
  var d = now - before;
  if (!d) return '<span class="chg">변동 없음</span>';
  return '<span class="chg ' + (d > 0 ? "up" : "down") + '">' + delta(d) + '</span>';
}

/*
 * 지금 호가가 최근 1년의 가장 비싼 실거래와 얼마나 떨어져 있는가.
 * 호가는 직방과 네이버가 모두 들어온 가장 최근 날의 최저가로 본다 (네이버에 이어지지 않은
 * 단지는 직방만). → { d, slot, peak } · 견줄 것이 없으면 null
 */
function peakGap(w, series, peak){
  if (!peak) return null;
  for (var i = series.length - 1; i >= 0; i--){
    var s = series[i], src = s.sources || {};
    if (s.min_price == null || src.zigbang !== "ok" || (w.naver_id && src.naver !== "ok")) continue;
    return { d: s.min_price - peak.price, slot: s.slot, peak: peak };
  }
  return null;
}
/* 높으면 빨강, 낮으면 파랑 */
function gapMark(g){
  if (!g.d) return '<b class="chg">같음</b>';
  return '<b class="chg ' + (g.d > 0 ? "up" : "down") + '">' + delta(g.d) + '</b>';
}

function place(address){
  return address ? '<span class="sub-place">' + icon("pin", "sub-pin") + esc(address) + '</span>' : "";
}

function outlink(label, url){
  return '<a class="outlink" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + icon("out") + '</a>';
}

/* ---------- the list ---------- */
/* 카드를 세우는 차례. "mine"은 길게 눌러 끌어 정한 순서다. 고른 것은 이 브라우저가 기억한다.
   같은 것을 한 번 더 누르면 방향이 뒤집힌다. */
var SORTS = [
  { key: "mine", label: "내 순서" },
  { key: "place", label: "주소순", dir: 1 },
  { key: "added", label: "등록순", dir: -1 },
  { key: "peak", label: "실거래 최고가순", dir: -1 },
  { key: "ask", label: "최저 호가순", dir: -1 }
];
function sortNow(){
  try{ var v = JSON.parse(localStorage.getItem("estate.sort") || "null"); if (v && v.key) return v; }catch(e){ /* 기억 못 해도 된다 */ }
  return { key: "mine", dir: 1 };
}
function setSort(v){ try{ localStorage.setItem("estate.sort", JSON.stringify(v)); }catch(e){ /* 사생활 보호 모드 */ } }
function lastAsk(w){
  var series = Store.series[w.id] || [], last = series[series.length - 1];
  return last && last.min_price != null ? last.min_price : null;
}
function sorted(watches){
  var how = sortNow();
  if (how.key === "mine") return watches;
  var val = {
    place: function(w){ return [w.address || "", w.complex_name || ""].join(" "); },
    added: function(w){ return w.created_at || ""; },
    peak: function(w){ return w.high_1y ? w.high_1y.price : null; },
    ask: lastAsk
  }[how.key];
  if (!val) return watches;
  return watches.map(function(w, i){ return { w: w, v: val(w), i: i }; }).sort(function(a, b){
    /* 값이 없는 것은 어느 방향이든 맨 뒤 */
    if (a.v == null || b.v == null) return (a.v == null) - (b.v == null) || a.i - b.i;
    var c = typeof a.v === "string" ? a.v.localeCompare(b.v, "ko") : a.v - b.v;
    /* 같은 단지의 평형들은 작은 것부터 */
    return c * how.dir || (Number(a.w.supply_m2) || 0) - (Number(b.w.supply_m2) || 0) || a.i - b.i;
  }).map(function(x){ return x.w; });
}
function sortBar(view){
  var how = sortNow();
  var bar = el('<div class="pickrow scroll sortbar" role="group" aria-label="정렬"></div>');
  SORTS.forEach(function(o){
    var on = o.key === how.key;
    var b = el('<button class="pick" type="button" aria-pressed="' + on + '">' + o.label +
      (on && o.dir ? '<span class="sort-dir">' + (how.dir > 0 ? "↑" : "↓") + '</span>' : '') + '</button>');
    ripple(b, function(){
      setSort(on && o.dir ? { key: o.key, dir: -how.dir } : { key: o.key, dir: o.dir || 1 });
      var x = bar.scrollLeft;
      renderList(view);
      var again = view.querySelector(".sortbar");
      if (again) again.scrollLeft = x;
    });
    bar.appendChild(b);
  });
  return bar;
}

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
  if (Store.state === "ok"){
    /* 주인이 로그인했으면 나가는 단추, 아니면 들어오는 단추. 로그인이 아직 차려지지 않았으면
       누르는 길에 무엇을 넣어야 하는지 알려준다 (api/auth.js). */
    var sign = el('<button class="icon-btn" type="button" aria-label="' + (Store.auth && Store.me ? "로그아웃" : "카카오 로그인") + '">' +
      icon(Store.auth && Store.me ? "logout" : "login") + '</button>');
    ripple(sign, function(){ if (Store.auth && Store.me) location.href = "api/auth?logout"; else openLoginDialog(); });
    head.appendChild(sign);
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
      '<p>단지와 평형을 등록하면 매일 오전 9시 30분에 그날의 호가 목록을 기록합니다.</p>' +
      '<button class="btn btn-primary" type="button">' + icon("plus") + '관심 단지 추가</button></div>');
    ripple(blank.querySelector(".btn"), openAdd);
    pad.appendChild(blank);
  } else {
    var shownWatches = sorted(Store.watches);
    var mineOrder = sortNow().key === "mine";
    if (Store.watches.length > 1) pad.appendChild(sortBar(view));
    if (dense()){
      /* 간단히 보기: 단지 하나가 카드 하나, 그 안에 평형이 한 줄씩 */
      var groups = [], byComplex = {};
      shownWatches.forEach(function(w){
        if (!byComplex[w.complex_id]) groups.push(byComplex[w.complex_id] = []);
        byComplex[w.complex_id].push(w);
      });
      groups.forEach(function(g){
        var box = el('<div class="trip-card dense-card"><div class="dense-head">' +
          '<span class="watch-name">' + esc(g[0].complex_name) + '</span>' + place(g[0].address) + '</div></div>');
        g.forEach(function(w){ box.appendChild(watchRow(w, view)); });
        if (mineOrder) dragToReorder(list, box, g.map(function(w){ return w.id; }), view);
        list.appendChild(box);
      });
    } else shownWatches.forEach(function(w){
      var card = watchCard(w, view);
      if (mineOrder) dragToReorder(list, card, [w.id], view);
      list.appendChild(card);
    });
    var add = el('<button class="addcard" type="button">' + icon("plus") + '관심 단지 추가</button>');
    ripple(add, openAdd);
    list.appendChild(add);
    pad.appendChild(list);
    pad.appendChild(el('<p class="store-note">매일 오전 9시 30분에 기록합니다</p>'));
    if (Store.canEdit()){
      /* 아침 수집을 기다리지 않고 지금 직방에서 받아 오늘 기록에 넣는다 */
      var foot = el('<div class="dangerfoot"><button class="linkbtn" type="button">' + icon("clock") +
        '지금 직방 호가 가져오기</button></div>');
      var nowBtn = foot.querySelector("button");
      ripple(nowBtn, function(){
        if (nowBtn.disabled) return;
        nowBtn.disabled = true;
        toast("직방에서 받아오는 중…");
        Store.post({ collect: true }).then(function(r){
          var bad = (r.failed || []).filter(function(f){ return f.source === "직방"; });
          if (bad.length) toast("일부를 받지 못했습니다 — " + bad[0].complex + ": " + bad[0].error, true);
          else toastDone("오늘(" + dayShort(r.slot) + ") 기록에 " + r.saved + "개 평형의 직방 호가를 넣었습니다.");
          nav.reload();
        }).catch(function(e){
          nowBtn.disabled = false;
          toast("가져오지 못했습니다 — " + e.message, true);
        });
      });
      pad.appendChild(foot);
    }
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
  if (!Store.canEdit()) return;          /* 못 고치는 사람에게는 밀어도 나올 것이 없다 */
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

/*
 * 카드를 길게 누르면 들려서, 위아래로 끌어 순서를 바꾼다. 손을 떼면 그 순서가 저장된다.
 * item이 list 안에서 자리를 옮기고, ids는 그 카드가 품은 관심들이다 (간단히 보기에서는
 * 단지 하나가 여러 평형을 품는다).
 */
var HOLD_MS = 420;
function dragToReorder(list, item, ids, view){
  if (!Store.canEdit()) return;
  item._ids = ids;
  var timer = null, id = null, x0 = 0, y0 = 0, lifted = false, slots = [], from = 0, to = 0, step = 0;
  function items(){ return Array.prototype.filter.call(list.children, function(n){ return n._ids; }); }
  function stop(){ clearTimeout(timer); timer = null; }
  function drop(){
    stop();
    if (!lifted){ id = null; return; }
    lifted = false; id = null;
    slots.forEach(function(sl){ sl.node.style.transition = "none"; sl.node.style.transform = ""; });
    if (to !== from) list.insertBefore(item, to > from ? slots[to].node.nextSibling : slots[to].node);
    item.classList.remove("lifted");
    list.classList.remove("sorting");
    void list.offsetWidth;
    slots.forEach(function(sl){ sl.node.style.transition = ""; });
    if (to === from) return;
    var order = [];
    items().forEach(function(n){ order = order.concat(n._ids); });
    var undo = Store.reorder(order, function(){ renderList(view); });
    toastUndo("순서를 바꿨습니다.", undo, "edit");
  }
  item.addEventListener("pointerdown", function(e){
    if ((e.button && e.button !== 0) || items().length < 2) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY;
    stop();
    timer = setTimeout(function(){
      timer = null;
      if (item.querySelector(".swiped") || item.classList.contains("swiped")) return;
      if (opened) opened();
      /* 들리는 순간의 자리들을 적어 둔다 */
      slots = items().map(function(n){
        var r = n.getBoundingClientRect();
        return { node: n, top: r.top, mid: r.top + r.height / 2 };
      });
      from = to = slots.map(function(sl){ return sl.node; }).indexOf(item);
      var me = item.getBoundingClientRect();
      var next = slots[from + 1] || null, prev = slots[from - 1] || null;
      step = next ? next.top - me.top : me.top - prev.top - (prev.node.getBoundingClientRect().height - me.height);
      lifted = true;
      item.classList.add("lifted");
      list.classList.add("sorting");
      try{ item.setPointerCapture(id); }catch(err){ /* 이미 놓았다 */ }
      if (navigator.vibrate) navigator.vibrate(12);
    }, HOLD_MS);
  });
  item.addEventListener("pointermove", function(e){
    if (e.pointerId !== id) return;
    if (!lifted){
      if (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10) stop();      /* 밀거나 넘기는 중이다 */
      return;
    }
    var dy = e.clientY - y0;
    item.style.transform = "translateY(" + dy + "px) scale(1.02)";
    /* 끄는 동안에는 자리를 실제로 옮기지 않는다 (옮기면 손가락이 카드를 놓친다) —
       이웃들이 비켜서는 것만 보여주고, 놓을 때 한 번에 옮긴다. */
    var mid = slots[from].mid + dy;
    to = from;
    slots.forEach(function(sl, i){
      if (i < from && mid < sl.mid) to = Math.min(to, i);
      if (i > from && mid > sl.mid) to = Math.max(to, i);
    });
    slots.forEach(function(sl, i){
      if (i === from) return;
      var shift = i > from && i <= to ? -step : i < from && i >= to ? step : 0;
      sl.node.style.transform = shift ? "translateY(" + shift + "px)" : "";
    });
  });
  item.addEventListener("pointerup", drop);
  item.addEventListener("pointercancel", drop);
  /* 들린 동안에는 화면이 따라 구르지 않게, 그리고 놓는 손이 카드를 여는 누름이 되지 않게 */
  item.addEventListener("touchmove", function(e){ if (lifted) e.preventDefault(); }, { passive: false });
  item.addEventListener("contextmenu", function(e){ if (lifted || timer) e.preventDefault(); });
  item.addEventListener("click", function(e){
    if (!item._held) return;
    item._held = false; e.preventDefault(); e.stopPropagation();
  }, true);
  item.addEventListener("pointerup", function(){
    if (!item.classList.contains("lifted")) return;
    item._held = true;
    setTimeout(function(){ item._held = false; }, 400);
  }, true);
}

function watchCard(w, view){
  var series = Store.series[w.id] || [];
  var last = series[series.length - 1];
  var prev = series[series.length - 2];
  var deal = w.last_deal;
  var pg = peakGap(w, series, w.high_1y);
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
    (deal ? '<div class="watch-price deal"><span class="lbl">직전 실거래 · ' + dayShort(deal.date) + '</span>' +
      '<b>' + won(deal.price) + '</b></div>' : '') + '</div>' +
    (pg ? '<div class="watch-gap ' + (pg.d > 0 ? "up" : pg.d < 0 ? "down" : "") + '"><span>1년 최고 실거래 ' +
      won(pg.peak.price) + ' 대비</span>' + gapMark(pg) + '<small>' + dayShort(pg.slot) + ' 호가</small></div>' : '') +
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

/* 지금 열려 있는 단지 화면. 같은 단지에서 날짜만 바꿀 때는 화면을 새로 짓지 않고
   이것을 고쳐 그린다. */
var openWatch = null;

function paintAt(o, slot, mine){
  var at = o.history.length - 1;
  o.history.forEach(function(s, i){ if (s.slot === slot) at = i; });
  if (slot !== "now") return paintWatch(o.body, o.hero, o.full, o.history, at, mine, null);
  /* 현재: 기록을 먼저 그려 두고, 지금 올라와 있는 것을 받아 오면 바꿔 그린다 */
  paintWatch(o.body, o.hero, o.full, o.history, at, mine, "wait");
  return Store.live(o.full.id).then(function(live){
    if (mine !== shown || !live) return;
    paintWatch(o.body, o.hero, o.full, o.history, at, mine, live);
  }).catch(function(e){
    if (mine !== shown) return;
    toast("지금 호가를 받아오지 못했습니다 — " + e.message, true);
    paintWatch(o.body, o.hero, o.full, o.history, at, mine, null);
  });
}

export function renderWatch(view, id, slot){
  var w = Store.watch(id);
  var mine = ++shown;
  if (openWatch && openWatch.id === id && view.contains(openWatch.body)){
    return paintAt(openWatch, slot, mine);
  }
  openWatch = null;
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
  if (!w.naver_id){
    var link = el('<button class="outlink" type="button">네이버 연결' + icon("plus") + '</button>');
    ripple(link, function(){ openNaverLink(w); });
    hero.querySelector(".links").appendChild(link);
  }
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
        '다음 오전 9시 30분에 첫 기록이 남습니다.</p></div>'));
      body.appendChild(dealsCard(full));
      body.appendChild(removeFoot(w));
      return;
    }
    openWatch = { id: id, body: body, hero: hero, full: full, history: history };
    return paintAt(openWatch, slot, mine);
  }).catch(function(e){
    if (mine !== shown) return;
    body.innerHTML = "";
    body.appendChild(el('<div class="card dashed"><p class="card-empty">기록을 불러오지 못했습니다 — ' +
      esc(e.message) + '</p></div>'));
  });
}

/* 이 관심이 보는 전용 면적들: "60" · 묶음이면 "59.82 · 59.97" */
function areasOf(w){
  var many = (w.room_types || []).map(function(t){ return t.exclusive; }).filter(Boolean);
  var uniq = many.filter(function(v, i){ return many.indexOf(v) === i; });
  return uniq.length ? uniq.join(" · ") : String(w.exclusive_m2);
}

function liveDeals(w){ return (w.deals || []).filter(function(d){ return !d.canceled; }); }

/* live: null(기록을 본다) · "wait"(지금 것을 받는 중) · { snapshot, previous }(지금 것) */
function paintWatch(body, hero, w, history, at, mine, live){
  var now = live && live !== "wait" ? live.snapshot : null;
  var snap = now || history[at], before = now ? history[history.length - 1] : history[at - 1];
  var deal = liveDeals(w)[0];
  var yearAgo = isoDay(new Date(Date.now() - 365 * 86400000));
  var pg = peakGap(w, history, liveDeals(w).filter(function(d){ return d.date >= yearAgo; })
    .reduce(function(m, d){ return !m || d.price > m.price ? d : m; }, null));
  var old = hero.querySelector(".now");
  /* 실거래와 최저 호가를 견주는 표: 직전 거래와 1년 최고 거래, 한 줄씩 같은 모양으로 */
  var ymd = function(iso){ return iso.slice(2).replace(/-/g, "."); };
  var lines = [];
  if (deal) lines.push({ label: "직전", deal: deal, d: snap.min_price != null ? snap.min_price - deal.price : null, slot: snap.slot });
  if (pg) lines.push({ label: "1년 최고", deal: pg.peak, d: pg.d, slot: pg.slot });
  var cmp = !lines.length ? "" : '<div class="cmp"><div class="cmp-head"><span>실거래</span><span>최저 호가 대비</span></div>' +
    lines.map(function(l){
      /* 견준 호가가 지금 보는 날의 것이 아니면 그 날짜를 작게 적는다 */
      var other = l.slot !== snap.slot ? '<small>' + dayShort(l.slot) + '</small>' : '';
      return '<div class="cmp-row"><span class="lbl">' + l.label + '</span><b>' + won(l.deal.price) + '</b>' +
        '<span class="when">' + ymd(l.deal.date) + '</span>' +
        '<span class="gap">' + other + (l.d == null ? '<b class="chg">—</b>' : gapMark({ d: l.d })) + '</span></div>';
    }).join("") + '</div>';
  var fresh = el('<div class="now">' +
    '<div class="now-label">' + TRADE[w.trade] + ' 최저 호가<span class="now-when">' +
      (now ? "현재 · " + clock(now.taken_at) + " 기준" : slotLabel(snap.slot)) + '</span></div>' +
    '<div class="now-big"><b>' + won(snap.min_price) + '</b>' + (before ? chg(snap.min_price, before.min_price) : "") + '</div>' +
    '<div class="now-stats">' +
      '<div><span class="lbl">중간</span><b>' + won(snap.med_price) + '</b></div>' +
      '<div><span class="lbl">최고</span><b>' + won(snap.max_price) + '</b></div>' +
      '<div><span class="lbl">매물</span><b>' + snap.count + '건</b></div>' +
    '</div>' +
    cmp +
    '</div>');
  /* 제자리에서 바꿔 끼운다 — 뺐다 넣으면 그 사이 화면 길이가 줄어 스크롤이 튄다 */
  if (old) old.replaceWith(fresh); else hero.appendChild(fresh);

  function pick(i){
    nav.set("/w/" + encodeURIComponent(w.id) +
      (i === "now" ? "/now" : i === history.length - 1 ? "" : "/" + history[i].slot));
  }

  /* 호가 흐름 — 그날그날 호가가 걸쳐 있던 폭과 실거래를 한 그림에 */
  var chart = el('<div class="card chart-card"><div class="card-head"><h3>호가 흐름' +
    '<span class="card-n">' + history.length + '일</span></h3></div></div>');
  chart.appendChild(flowChart(history.map(function(s){
    return { slot: s.slot, label: slotLabel(s.slot), min: s.min_price, med: s.med_price, max: s.max_price, count: s.count };
  }), w.deals, live ? history.length - 1 : at));
  chart.appendChild(flowLegend(liveDeals(w).length > 0));

  var list = el('<div class="card" style="margin-top:12px"><div class="card-head"><h3>' +
    (live ? "지금 호가 목록" : "호가 목록") +
    (live === "wait" ? '' : '<span class="card-n">' + snap.count + '건</span>') + '</h3></div>' +
    '<p class="card-empty">' + (live === "wait" ? "지금 올라와 있는 매물을 받아오는 중…" : "불러오는 중…") + '</p></div>');

  /* 처음에는 화면을 짓고, 날짜만 바꿀 때는 달라지는 곳만 갈아 끼운다 —
     실거래 카드와 날짜 줄은 제자리에 그대로 있다. */
  var parts = body._parts;
  /* 새 목록을 옛 목록 자리에 놓는다. 빠진 매물 카드(gone)도 함께 바꾼다 */
  function showList(gone){
    if (parts.list !== list){ parts.list.replaceWith(list); parts.list = list; }
    if (parts.gone) parts.gone.remove();
    parts.gone = gone || null;
    if (gone) list.parentNode.insertBefore(gone, list.nextSibling);
  }
  if (!parts){
    body.innerHTML = "";
    body.appendChild(chart);
    /* 어느 날을 볼지 — 최근 것이 앞에 */
    var row = el('<div class="chiprow slotrow"></div>');
    var chips = {};
    chips.now = el('<button class="chip live" type="button"><i></i>현재</button>');
    ripple(chips.now, function(){ pick("now"); });
    row.appendChild(chips.now);
    for (var i = history.length - 1; i >= 0; i--){
      (function(i){
        chips[i] = el('<button class="chip" type="button">' + slotShort(history[i].slot) + '</button>');
        ripple(chips[i], function(){ pick(i); });
        row.appendChild(chips[i]);
      })(i);
    }
    body.appendChild(row);
    body.appendChild(list);
    body.appendChild(dealsCard(w));
    body.appendChild(removeFoot(w));
    parts = body._parts = { chart: chart, chips: chips, list: list, gone: null };
  } else {
    /* 그림은 그대로 두고, 어느 날을 보는지만 옮겨 표시한다 */
    var drawn = parts.chart.querySelector(".chart-wrap");
    if (drawn && drawn.select) drawn.select(live ? history.length - 1 : at);
    /* 옛 목록은 새 것이 올 때까지 흐리게 남겨 둔다 — 화면이 줄었다 늘며 튀지 않게 */
    if (live === "wait") showList(null); else parts.list.classList.add("stale");
  }
  Object.keys(parts.chips).forEach(function(k){
    parts.chips[k].setAttribute("aria-pressed", String(k === "now" ? !!live : !live && Number(k) === at));
  });

  if (live === "wait") return;
  (now ? Promise.resolve(live) : Store.snapshot(w.id, snap.slot)).then(function(data){
    if (mine !== shown || !data) return;
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
    /* 그날 가장 낮은 호가 — 같은 값이 여럿이면 모두 */
    var low = rows.reduce(function(m, l){ return l.price > 0 && (m == null || l.price < m) ? l.price : m; }, null);
    var many = rows.length > 1;
    rows.forEach(function(l){
      var mark = "", o = wasBy[key(l)];
      if (was && hadSrc[l.src || "zigbang"]){
        if (!o) mark = '<span class="badge new">신규</span>';
        else if (o.price !== l.price) mark = '<span class="chg ' + (l.price > o.price ? "up" : "down") + '">' +
          delta(l.price - o.price) + '</span>';
      }
      list.appendChild(askRow(l, mark, false, w, many && l.price === low));
    });

    var sources = (data.snapshot && data.snapshot.sources) || {};
    var failed = Object.keys(sources).filter(function(k){ return sources[k] === "fail"; });
    if (failed.length) list.appendChild(el('<p class="src-note">' +
      failed.map(function(k){ return PLATFORM[k] || k; }).join(" · ") + ' 매물은 ' + (now ? "지금" : "이날") + ' 받지 못했습니다.</p>'));

    /* 네이버 매물은 내 컴퓨터의 크롬 확장이 날마다 넣는다 (extension/) */
    if (w.naver_id && sources.naver !== "ok" && !now) list.appendChild(el(
      '<p class="src-note">네이버 매물은 이날 들어오지 않았습니다 — 크롬 확장이 돌았는지 확인해 주세요.</p>'));

    var gone = (was || []).filter(function(l){ return !nowBy[key(l)] && nowSrc[l.src || "zigbang"]; });
    var card = null;
    if (gone.length){
      card = el('<div class="card dashed gone"><div class="card-head"><h3>' + (now ? "마지막 기록 이후 빠진 매물" : "직전 기록 이후 빠진 매물") +
        '<span class="card-n">' + gone.length + '건</span></h3></div></div>');
      gone.forEach(function(l){ card.appendChild(askRow(l, "", true)); });
    }
    showList(card || null);
  }).catch(function(e){
    if (mine !== shown) return;
    var p = list.querySelector(".card-empty");
    if (p) p.textContent = "목록을 불러오지 못했습니다 — " + e.message;
    showList(null);
  });
}

/* 매물 한 줄. 누르면 그 매물을 올린 곳의 화면이 새 창으로 열린다 —
   빠진 매물은 갈 곳이 없으니 줄만 남는다. */
function askRow(l, mark, dead, w, low){
  var src = l.src || "zigbang";
  var where = [l.dong, floorLabel(l.floor)].filter(Boolean).join(" · ");
  var url = dead ? "" : listingUrl(l, w);
  var inner = '<span class="ask-price">' + won(l.price) + (low ? '<i class="lowtag">최저</i>' : '') + '</span>' +
    '<span class="ask-body"><b>' + esc(where || "동 · 층 미상") +
      '<span class="badge src ' + src + '">' + esc(PLATFORM[src] || src) + '</span></b>' +
      (l.title ? '<small>' + esc(l.title) + '</small>' : '') + '</span>' +
    '<span class="ask-mark">' + mark +
      (l.n > 1 ? '<span class="badge">중개 ' + l.n + '곳</span>' : '') + '</span>';
  return el(url
    ? '<a class="askrow' + (low ? " low" : "") + '" href="' + esc(url) + '" target="_blank" rel="noopener">' + inner + '</a>'
    : '<div class="askrow">' + inner + '</div>');
}

/* 실거래를 볼 기간. 고른 것은 화면을 옮겨도 그대로다 */
var PERIODS = [
  { key: "5y", label: "최근 5년", said: "최근 5년", months: 60 },
  { key: "3y", label: "최근 3년", said: "최근 3년", months: 36 },
  { key: "1y", label: "최근 1년", said: "최근 1년", months: 12 },
  { key: "3m", label: "최근 3개월", said: "최근 3개월", months: 3 }
];
var period = "5y";
var LIST_FIRST = 10;

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
    var floorPrice = live.length > 1 ? Math.min.apply(null, live.map(function(d){ return d.price; })) : null;
    var topPrice = live.length > 1 ? Math.max.apply(null, live.map(function(d){ return d.price; })) : null;
    if (topPrice === floorPrice) topPrice = null;          /* 모두 같은 값이면 최고라 부를 것이 없다 */
    var isLow = function(d){ return !d.canceled && d.price === floorPrice; };
    var isHigh = function(d){ return !d.canceled && d.price === topPrice; };
    /* 기간의 최고 · 최저는 목록 맨 위에 따로 꺼내 둔다 — 접힌 곳에 있어도 보이게 */
    var first = LIST_FIRST;
    [[isHigh, "최고", " high"], [isLow, "최저", ""]].forEach(function(k){
      var d = live.filter(k[0])[0];
      if (!d) return;
      body.appendChild(el('<div class="deal-row low pinned' + k[2] + '"><b>' + won(d.price) + '</b>' +
        '<i class="lowtag">' + p.said + ' ' + k[1] + '</i>' +
        '<span>' + esc(floorLabel(d.floor) || "층 미상") + '</span>' +
        '<span class="when">' + d.date.slice(2).replace(/-/g, ".") + '</span></div>'));
    });
    var shownRows = more ? inRange : inRange.slice(0, first);
    var month = "";
    shownRows.forEach(function(d){
      var m = d.date.slice(0, 7);
      if (m !== month){
        month = m;
        var n = inRange.filter(function(x){ return x.date.slice(0, 7) === m; }).length;
        body.appendChild(el('<div class="deal-month">' + m.replace("-", ".") + '<span>' + n + '건</span></div>'));
      }
      body.appendChild(el('<div class="deal-row' + (d.canceled ? " off" : "") + (isLow(d) ? " low" : isHigh(d) ? " low high" : "") + '"><b>' + won(d.price) + '</b>' +
        (isLow(d) ? '<i class="lowtag">' + p.said + ' 최저</i>' : isHigh(d) ? '<i class="lowtag">' + p.said + ' 최고</i>' : '') +
        '<span>' + esc(floorLabel(d.floor) || "층 미상") + (d.canceled ? " · 해제" : "") + '</span>' +
        '<span class="when">' + Number(d.date.slice(8, 10)) + '일</span></div>'));
    });
    if (!more && inRange.length > first){
      var b = el('<button class="btn btn-quiet deal-more" type="button">' + inRange.length + '건 중 ' + first +
        '건을 보는 중 · 나머지 ' + (inRange.length - first) + '건 모두 보기</button>');
      ripple(b, function(){ paint(true); });
      body.appendChild(b);
    }
    note();
  }
  function note(){
    body.appendChild(el('<p class="src-note">국토교통부 실거래가 공개시스템 · 전용 ' + esc(areasOf(w)) + '㎡' +
      (w.deals_complete === false ? ' · 5년치를 거슬러 받는 중입니다 — 다시 열면 더 채워집니다' : '') + '</p>'));
  }
  paint(false);
  return card;
}

function removeFoot(w){
  var foot = el('<div class="dangerfoot"></div>');
  if (!Store.canEdit()) return foot;
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
  if (!Store.canEdit()) return Store.deny();
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

/* ---------- adding a watch ---------- */
function openAdd(){
  if (!Store.canEdit()) return Store.deny();
  var sheet = sheetShell("관심 단지 추가");
  var body = sheet.querySelector(".sheet-body");
  var foot = sheet.querySelector(".sheet-foot");
  var save = el('<button class="btn btn-primary" type="button">등록</button>');
  foot.appendChild(save);
  foot.hidden = true;

  var chosen = null, trade = "trade", types = [], picked = {}, naverInput = null, merge = false;
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

    var tf = el('<div class="fld"><label>평형 <span class="opt">여럿 고를 수 있음</span>' +
      '<button class="mergebtn" type="button" role="switch" aria-checked="' + merge + '"><i></i>같은 평형 묶기</button></label>' +
      '<div class="pickrow" id="types"><p class="card-empty">평형을 불러오는 중…</p></div>' +
      '<p class="fld-hint">숫자는 지금 직방에 올라와 있는 매물 수입니다.</p></div>');
    /* 59A · 59B처럼 전용 면적이 같은 평형들을 하나로 묶어 본다 */
    var sw = tf.querySelector(".mergebtn");
    sw.addEventListener("click", function(e){
      e.preventDefault();
      merge = !merge; picked = {};
      sw.setAttribute("aria-checked", String(merge));
      paintTypes();
    });
    body.appendChild(tf);

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

  /* 고를 수 있는 것들. 묶기를 켜면 전용 면적(정수)이 같은 평형들이 하나가 된다. */
  function options(){
    if (!merge) return types.map(function(t){ return { key: t.id, label: t.label, count: t.count, id: t.id, supply: t.supply, exclusive: t.exclusive }; });
    /* 전용 면적 순으로 세워, 묶음의 가장 작은 것과 1㎡ 안에 드는 것까지 한 묶음.
       전용 면적을 모르는 평형은 혼자 남는다. */
    var groups = [], open = null;
    types.filter(function(t){ return t.exclusive; })
      .sort(function(a, b){ return a.exclusive - b.exclusive; })
      .forEach(function(t){
        if (open && t.exclusive - open[0].exclusive <= 1) open.push(t);
        else groups.push(open = [t]);
      });
    /* 전용 면적을 모르는 평형(직방에 매물이 없으면 면적이 오지 않는다)은 평수가 같은 묶음에
       넣는다 — 25A는 25B가 든 묶음으로. 그런 묶음이 없으면 같은 평수끼리 묶는다. */
    var pyOf = function(t){ return Number((String(t.label).match(/(\d+)[A-Za-z0-9]*평/) || [])[1]) || 0; };
    types.forEach(function(t){
      if (t.exclusive) return;
      var py = pyOf(t);
      var home = py ? groups.filter(function(g){ return g.some(function(x){ return pyOf(x) === py; }); })[0] : null;
      if (home) home.push(t); else groups.push([t]);
    });
    /* 묶은 뒤에도 원래 차례(작은 평형부터)로 — 묶음은 그 안의 가장 작은 평형 자리에 선다 */
    groups.forEach(function(g){ g.sort(function(a, b){ return types.indexOf(a) - types.indexOf(b); }); });
    groups.sort(function(a, b){ return types.indexOf(a[0]) - types.indexOf(b[0]); });
    var span = function(list){
      var lo = Math.min.apply(null, list), hi = Math.max.apply(null, list);
      return lo === hi ? String(lo) : lo + "~" + hi;
    };
    return groups.map(function(g){
      var first = g[0];
      if (g.length < 2) return { key: first.id, label: first.label, count: first.count, id: first.id, supply: first.supply, exclusive: first.exclusive };
      /* 이름은 다른 평형들과 같은 꼴로: "61~62㎡ · 18~19평" */
      var py = g.map(function(t){ return Number((String(t.label).match(/(\d+)[A-Za-z0-9]*평/) || [])[1]) || 0; }).filter(Boolean);
      var m2 = g.map(function(t){ return Math.floor(t.supply) || Number((String(t.label).match(/^(\d+)/) || [])[1]) || 0; }).filter(Boolean);
      var count = {};
      g.forEach(function(t){ Object.keys(t.count || {}).forEach(function(k){ count[k] = (count[k] || 0) + t.count[k]; }); });
      return {
        key: g.map(function(t){ return t.id; }).join("_"), count: count, n: g.length,
        label: [m2.length ? span(m2) + "㎡" : "", py.length ? span(py) + "평" : ""].filter(Boolean).join(" · ") ||
          first.label,
        id: first.id, supply: first.supply, exclusive: (g.filter(function(t){ return t.exclusive; })[0] || first).exclusive,
        members: g.map(function(t){ return { id: t.id, supply: t.supply, exclusive: t.exclusive }; })
      };
    });
  }

  function paintTypes(){
    var row = body.querySelector("#types");
    if (!row || !types.length) return;
    row.innerHTML = "";
    options().forEach(function(t){
      var b = el('<button class="pick" type="button" aria-pressed="' + !!picked[t.key] + '">' + esc(t.label) +
        (t.n ? '<span class="pick-g">' + t.n + '개 평형</span>' : '') +
        '<span class="pick-n">' + ((t.count && t.count[trade]) || 0) + '</span></button>');
      ripple(b, function(){
        picked[t.key] = !picked[t.key];
        b.setAttribute("aria-pressed", String(!!picked[t.key]));
      });
      row.appendChild(b);
    });
  }

  ripple(save, function(){
    if (save.disabled) return;
    var want = options().filter(function(t){ return picked[t.key]; });
    if (!want.length) return flag(null, "평형을 하나 이상 골라 주세요.");
    var nv = naverInput ? naverInput.value.trim() : "";
    if (nv && !/(complex(es)?\/(info\/)?\d+|hscpNo=\d+|^\d+$)/.test(nv)){
      return flag(naverInput, "네이버 부동산 단지 주소를 확인해 주세요.");
    }
    save.disabled = true;
    save.textContent = "등록하는 중…";
    Store.post({ add: {
      complexId: chosen.id, complexName: chosen.name, address: chosen.address, trade: trade, naver: nv,
      types: want.map(function(t){ return { id: t.id, label: t.label, supply: t.supply, exclusive: t.exclusive, members: t.members }; })
    } }).then(function(data){
      if (!data){ save.disabled = false; save.textContent = "등록"; return; }
      closeOverlay();
      if (!data.added.length) toast("이미 등록된 평형입니다.");
      else if (!data.first || !data.first.saved) toast("등록했습니다. 첫 기록은 다음 오전 9시 30분에 남습니다.", true);
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
