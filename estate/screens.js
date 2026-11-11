/* The screens: the watch list, one 단지 · 평형 over time, and the sheet that
   adds a new one. */
import { el, esc, icon, ripple, toast, toastDone } from "../ui/dom.js";
import { Store } from "../ui/store.js";
import { themeButton } from "../ui/theme.js";
import { brandMark, accountFooter } from "../ui/shell.js";
import { sheetShell, showOverlay, closeOverlay, askThenDelete, pickGroup, flag } from "../ui/sheet.js";
import { won, delta, slotLabel, slotShort, floorLabel } from "./format.js";
import { sparkline, lineChart } from "./chart.js";

var nav = { go: function(){}, set: function(){}, reload: function(){} };
export function wire(n){ nav = n; }

var TRADE = { trade: "매매", charter: "전세" };

/* +3 · −2 · 그대로 */
function chg(now, before, unit){
  if (now == null || before == null) return "";
  var d = now - before;
  if (!d) return '<span class="chg">변동 없음</span>';
  return '<span class="chg ' + (d > 0 ? "up" : "down") + '">' + (d > 0 ? "▲ " : "▼ ") +
    (unit === "count" ? Math.abs(d) + "건" : won(Math.abs(d))) + '</span>';
}

function place(address){
  return address ? '<span class="sub-place">' + icon("pin", "sub-pin") + esc(address) + '</span>' : "";
}

/* ---------- the list ---------- */
export function renderList(view){
  var pad = el('<div class="pad"></div>');
  var head = el('<div class="page-head"><div class="page-title">' + brandMark() + '</div></div>');
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
      '<p>단지와 평형을 등록하면 매일 00시와 12시에 그때의 호가 목록을 기록합니다.</p>' +
      '<button class="btn btn-primary" type="button">' + icon("plus") + '관심 단지 추가</button></div>');
    ripple(blank.querySelector(".btn"), openAdd);
    pad.appendChild(blank);
  } else {
    Store.watches.forEach(function(w){ list.appendChild(watchCard(w)); });
    var add = el('<button class="addcard" type="button">' + icon("plus") + '관심 단지 추가</button>');
    ripple(add, openAdd);
    list.appendChild(add);
    pad.appendChild(list);
    pad.appendChild(el('<p class="store-note">매일 00시 · 12시에 기록합니다 · 출처 ' +
      esc(Store.sources.map(function(s){ return s.name; }).join(" · ")) + '</p>'));
  }
  pad.appendChild(accountFooter());
  swap(view, pad);
}

function swap(view, node){
  view.innerHTML = "";
  view.appendChild(node);
  window.scrollTo(0, 0);
}

function watchCard(w){
  var series = Store.series[w.id] || [];
  var last = series[series.length - 1];
  var prev = series[series.length - 2];
  var card = el('<div class="trip-card"><button class="trip-open" type="button">' +
    '<div class="watch-top"><div class="watch-id">' +
      '<span class="watch-name">' + esc(w.complex_name) + '</span>' + place(w.address) +
    '</div><span class="watch-type">' + esc(w.room_label) + '</span></div>' +
    '<div class="watch-mid"><div class="watch-price"><span class="lbl">' + TRADE[w.trade] + ' 최저 호가</span>' +
      (last && last.min_price != null
        ? '<b>' + won(last.min_price) + '</b>'
        : '<b class="none">' + (last ? "매물 없음" : "아직 기록이 없습니다") + '</b>') +
    '</div>' + sparkline(series.map(function(s){ return s.min_price; })) + '</div>' +
    (last ? '<div class="watch-foot"><span>매물 <b>' + last.count + '</b>건</span>' +
      (prev ? chg(last.min_price, prev.min_price) : "") +
      '<span class="watch-when">' + slotShort(last.slot) + '</span></div>' : "") +
    '</button></div>');
  ripple(card.querySelector(".trip-open"), function(){ nav.go("/w/" + encodeURIComponent(w.id)); });
  return card;
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
      '<span class="watch-trade">' + TRADE[w.trade] + '</span></div></div>');
  ripple(hero.querySelector(".hero-back"), function(){ nav.go("/"); });
  page.appendChild(hero);
  var body = el('<div><div class="card"><span class="bar bar-s"></span><span class="bar bar-m"></span>' +
    '<span class="bar bar-l"></span></div></div>');
  page.appendChild(body);
  swap(view, page);

  Store.history(id).then(function(data){
    if (mine !== shown || !data) return;
    var history = data.history || [];
    body.innerHTML = "";
    if (!history.length){
      body.appendChild(el('<div class="card dashed"><p class="card-empty">아직 기록이 없습니다. ' +
        '다음 00시 또는 12시에 첫 기록이 남습니다.</p></div>'));
      body.appendChild(removeFoot(w));
      return;
    }
    var at = history.length - 1;
    history.forEach(function(s, i){ if (s.slot === slot) at = i; });
    paintWatch(body, hero, w, history, at, mine);
  }).catch(function(e){
    if (mine !== shown) return;
    body.innerHTML = "";
    body.appendChild(el('<div class="card dashed"><p class="card-empty">기록을 불러오지 못했습니다 — ' +
      esc(e.message) + '</p></div>'));
  });
}

function paintWatch(body, hero, w, history, at, mine){
  var snap = history[at], before = history[at - 1];
  var old = hero.querySelector(".now");
  if (old) old.remove();
  hero.appendChild(el('<div class="now">' +
    '<div class="now-label">' + TRADE[w.trade] + ' 최저 호가<span class="now-when">' + slotLabel(snap.slot) + '</span></div>' +
    '<div class="now-big"><b>' + won(snap.min_price) + '</b>' + (before ? chg(snap.min_price, before.min_price) : "") + '</div>' +
    '<div class="now-stats">' +
      '<div><span class="lbl">중간</span><b>' + won(snap.med_price) + '</b></div>' +
      '<div><span class="lbl">최고</span><b>' + won(snap.max_price) + '</b></div>' +
      '<div><span class="lbl">매물</span><b>' + snap.count + '건</b></div>' +
    '</div></div>'));

  body.innerHTML = "";
  function pick(i){
    nav.set("/w/" + encodeURIComponent(w.id) + (i === history.length - 1 ? "" : "/" + history[i].slot));
  }

  /* 추이. 점 하나로는 선이 되지 않으니 두 번째 기록부터 그린다 */
  if (history.length > 1){
    var chart = el('<div class="card chart-card"><div class="card-head"><h3>최저 호가 추이' +
      '<span class="card-n">' + history.length + '회</span></h3></div></div>');
    chart.appendChild(lineChart(history.map(function(s){
      return { label: slotLabel(s.slot), short: slotShort(s.slot), value: s.min_price };
    }), at, pick));
    body.appendChild(chart);
  }

  /* 어느 기록을 볼지 — 최근 것이 앞에 */
  var row = el('<div class="chiprow slotrow"></div>');
  for (var i = history.length - 1; i >= 0; i--){
    (function(i){
      var b = el('<button class="chip" type="button" aria-pressed="' + (i === at) + '">' +
        slotShort(history[i].slot) + '</button>');
      ripple(b, function(){ pick(i); });
      row.appendChild(b);
    })(i);
  }
  body.appendChild(row);

  var list = el('<div class="card" style="margin-top:12px"><div class="card-head"><h3>호가 목록' +
    '<span class="card-n">' + snap.count + '건</span></h3></div>' +
    '<p class="card-empty">불러오는 중…</p></div>');
  body.appendChild(list);
  body.appendChild(removeFoot(w));

  Store.snapshot(w.id, snap.slot).then(function(data){
    if (mine !== shown || !data || !list.parentNode) return;
    list.querySelector(".card-empty").remove();
    var now = (data.snapshot && data.snapshot.listings) || [];
    var was = data.previous ? data.previous.listings || [] : null;
    var wasBy = {};
    (was || []).forEach(function(l){ wasBy[l.id] = l; });
    var nowBy = {};
    now.forEach(function(l){ nowBy[l.id] = l; });

    if (!now.length) list.appendChild(el('<p class="card-empty">이때는 올라온 매물이 없었습니다.</p>'));
    now.forEach(function(l){
      var mark = "";
      if (was){
        var o = wasBy[l.id];
        if (!o) mark = '<span class="badge new">신규</span>';
        else if (o.price !== l.price) mark = '<span class="chg ' + (l.price > o.price ? "up" : "down") + '">' +
          delta(l.price - o.price) + '</span>';
      }
      list.appendChild(askRow(l, mark));
    });

    var gone = (was || []).filter(function(l){ return !nowBy[l.id]; });
    if (gone.length){
      var card = el('<div class="card dashed gone"><div class="card-head"><h3>직전 기록 이후 빠진 매물' +
        '<span class="card-n">' + gone.length + '건</span></h3></div></div>');
      gone.forEach(function(l){ card.appendChild(askRow(l, "")); });
      list.parentNode.insertBefore(card, list.nextSibling);
    }
  }).catch(function(e){
    if (mine !== shown) return;
    var p = list.querySelector(".card-empty");
    if (p) p.textContent = "목록을 불러오지 못했습니다 — " + e.message;
  });
}

function askRow(l, mark){
  var where = [l.dong, floorLabel(l.floor)].filter(Boolean).join(" · ");
  return el('<div class="ask"><span class="ask-price">' + won(l.price) + '</span>' +
    '<span class="ask-body"><b>' + esc(where || "동 · 층 미상") + '</b>' +
      (l.title ? '<small>' + esc(l.title) + '</small>' : '') + '</span>' +
    '<span class="ask-mark">' + mark +
      (l.n > 1 ? '<span class="badge">중개 ' + l.n + '곳</span>' : '') + '</span></div>');
}

function removeFoot(w){
  var foot = el('<div class="dangerfoot"><button class="linkbtn danger" type="button">' +
    icon("trash") + '관심 해제</button></div>');
  ripple(foot.querySelector("button"), function(){
    if (!Store.canEdit()) return Store.deny();
    askThenDelete(w.complex_name + " " + w.room_label, function(){
      Store.post({ remove: w.id }).then(function(){ return nav.reload(); })
        .catch(function(e){ toast("해제하지 못했습니다 — " + e.message, true); });
      nav.go("/");
      return null;
    });
  });
  return foot;
}

/* ---------- adding a watch ---------- */
function openAdd(){
  if (!Store.canEdit()) return Store.deny();
  var sheet = sheetShell("관심 단지 추가", "출처 · " + Store.sources.map(function(s){ return s.name; }).join(" · "));
  var body = sheet.querySelector(".sheet-body");
  var foot = sheet.querySelector(".sheet-foot");
  var save = el('<button class="btn btn-primary" type="button">등록</button>');
  foot.appendChild(save);
  foot.hidden = true;

  var chosen = null, trade = "trade", types = [], picked = {};
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
      function(){ return trade; }, function(k){ trade = k; loadTypes(); });
    body.appendChild(tr);

    var tf = el('<div class="fld"><label>평형 <span class="opt">여럿 고를 수 있음</span></label>' +
      '<div class="pickrow" id="types"></div><p class="fld-hint">숫자는 지금 올라와 있는 매물 수입니다.</p></div>');
    body.appendChild(tf);
    foot.hidden = false;
    loadTypes();
  }

  function loadTypes(){
    var row = body.querySelector("#types");
    var mine = ++asked;
    picked = {};
    row.innerHTML = '<p class="card-empty">평형을 불러오는 중…</p>';
    Store.types(chosen.id, trade).then(function(data){
      if (mine !== asked || !data) return;
      types = data.types;
      row.innerHTML = "";
      if (!types.length) row.appendChild(el('<p class="card-empty">평형 정보를 찾지 못했습니다.</p>'));
      types.forEach(function(t){
        var b = el('<button class="pick" type="button" aria-pressed="false">' + esc(t.label) +
          '<span class="pick-n">' + t.count + '</span></button>');
        ripple(b, function(){
          picked[t.id] = !picked[t.id];
          b.setAttribute("aria-pressed", String(!!picked[t.id]));
          row.classList.remove("bad");
        });
        row.appendChild(b);
      });
    }).catch(function(e){
      if (mine !== asked) return;
      row.innerHTML = "";
      row.appendChild(el('<p class="card-empty"></p>')).textContent = "불러오지 못했습니다 — " + e.message;
    });
  }

  ripple(save, function(){
    if (save.disabled) return;
    var want = types.filter(function(t){ return picked[t.id]; });
    if (!want.length) return flag(null, "평형을 하나 이상 골라 주세요.");
    save.disabled = true;
    save.textContent = "등록하는 중…";
    Store.post({ add: {
      source: Store.sources[0].key, complexId: chosen.id, complexName: chosen.name,
      address: chosen.address, trade: trade,
      types: want.map(function(t){ return { id: t.id, label: t.label }; })
    } }).then(function(data){
      if (!data){ save.disabled = false; save.textContent = "등록"; return; }
      closeOverlay();
      if (!data.added.length) toast("이미 등록된 평형입니다.");
      else if (data.first && data.first.failed && data.first.failed.length){
        toast("등록했습니다. 첫 기록은 다음 정각에 남습니다.", true);
      } else toastDone("등록하고 첫 호가를 기록했습니다.");
      nav.reload();
    }).catch(function(e){
      save.disabled = false; save.textContent = "등록";
      toast("등록하지 못했습니다 — " + e.message, true);
    });
  });

  stepSearch();
  showOverlay(sheet);
}
