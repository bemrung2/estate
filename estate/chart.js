/* Two drawings: the small line on a list card, and the 호가 흐름 chart you can
   run a finger along. One axis (만원); colour comes from the tokens. */
import { el } from "../ui/dom.js";
import { won, dayShort } from "./format.js";

/* ---------- the small one ---------- */
export function sparkline(values){
  var W = 104, H = 34, pad = 5;
  var have = values.filter(function(v){ return v != null; });
  if (have.length < 2) return "";
  var lo = Math.min.apply(null, have), hi = Math.max.apply(null, have);
  var step = (W - 8) / (values.length - 1);
  var pts = [];
  values.forEach(function(v, i){
    if (v == null) return;
    pts.push([4 + step * i, hi === lo ? H / 2 : pad + (H - pad * 2) * (1 - (v - lo) / (hi - lo))]);
  });
  var end = pts[pts.length - 1];
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
    '<polyline points="' + pts.map(function(p){ return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>' +
    '<circle cx="' + end[0].toFixed(1) + '" cy="' + end[1].toFixed(1) + '" r="3.5"/></svg>';
}

/* ---------- 호가 흐름 ---------- */
var DAY = 86400000;
function time(iso){ return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }

/*
 * rows   [{ slot, label, min, med, max, count }] oldest first — one per record
 * deals  [{ date, price, floor }] 실거래
 * at     the record shown below the chart; tapping a day asks for it (onPick(i))
 *
 * 그날 호가가 걸쳐 있던 폭(최저–최고)을 옅은 띠로, 최저와 중간을 선으로, 실거래를 점으로
 * 같은 눈금 위에 둔다. 가로는 날짜다 — 기록이 빠진 날은 그만큼 벌어진다.
 */
export function flowChart(rows, deals, at){
  var W = 360, H = 196, L = 8, R = 8, T = 16, B = 26;
  var wrap = el('<div class="chart-wrap"></div>');
  var live = rows.map(function(r, i){ return r.min == null ? null : { i: i, t: time(r.slot), r: r }; }).filter(Boolean);
  if (!live.length){
    wrap.appendChild(el('<p class="card-empty">가격이 있는 기록이 아직 없습니다.</p>'));
    return wrap;
  }
  var t1 = live[live.length - 1].t;
  /* 기록이 며칠뿐이어도 최근 실거래와 견줄 수 있게 앞쪽에 자리를 내준다 — 기록한 기간의
     두 배까지(적어도 두 주, 많아야 두 달). 그보다 넓히면 정작 호가 선이 구석에 몰린다. */
  var back = t1 - Math.min(60, Math.max(14, Math.round((t1 - live[0].t) / DAY) * 2)) * DAY;
  var shownDeals = (deals || []).filter(function(d){ return !d.canceled && time(d.date) >= back && time(d.date) <= t1; });
  var t0 = live[0].t;
  shownDeals.forEach(function(d){ t0 = Math.min(t0, time(d.date)); });
  if (t0 === t1) t0 = t1 - DAY;

  var lo = Infinity, hi = -Infinity;
  live.forEach(function(p){ lo = Math.min(lo, p.r.min); hi = Math.max(hi, p.r.max); });
  shownDeals.forEach(function(d){ lo = Math.min(lo, d.price); hi = Math.max(hi, d.price); });
  if (hi === lo){ hi += 500; lo -= 500; }
  /* 값이 그림의 위아래 끝에 닿지 않게 숨 쉴 자리를 두고, 눈금은 읽기 좋은 값에 맞춘다 */
  var room = (hi - lo) * 0.3;
  var step = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000]
    .filter(function(v){ return (hi - lo + room * 2) / v <= 4; })[0] || 200000;
  lo = Math.floor((lo - room) / step) * step;
  hi = Math.ceil((hi + room) / step) * step;
  var ticks = [];
  for (var v = hi; v >= lo; v -= step) ticks.push(v);
  function x(t){ return L + 6 + (W - L - R - 12) * (t - t0) / (t1 - t0); }
  function y(v){ return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); }
  function line(key){
    return live.map(function(p){ return x(p.t).toFixed(1) + "," + y(p.r[key]).toFixed(1); }).join(" ");
  }

  var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="호가 흐름: ' +
    won(lo) + '에서 ' + won(hi) + ' 사이">';
  ticks.forEach(function(v){
    svg += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
      '<text class="tick" x="' + L + '" y="' + (y(v) - 4) + '">' + won(v) + '</text>';
  });
  svg += '<text class="tick" x="' + L + '" y="' + (H - 7) + '">' + dayShort(new Date(t0).toISOString()) + '</text>' +
    '<text class="tick" x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end">' + dayShort(new Date(t1).toISOString()) + '</text>' +
    '<line class="cross" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" hidden/>';
  if (live.length > 1){
    svg += '<polygon class="band" points="' + line("max") + " " +
      live.slice().reverse().map(function(p){ return x(p.t).toFixed(1) + "," + y(p.r.min).toFixed(1); }).join(" ") + '"/>' +
      '<polyline class="line med" points="' + line("med") + '"/>' +
      '<polyline class="line" points="' + line("min") + '"/>';
  } else {
    /* 기록이 하루뿐이면 그날의 폭을 세로 막대로 */
    var p0 = live[0];
    svg += '<line class="range" x1="' + x(p0.t) + '" x2="' + x(p0.t) + '" y1="' + y(p0.r.max) + '" y2="' + y(p0.r.min) + '"/>';
  }
  shownDeals.forEach(function(d){
    svg += '<circle class="deal" cx="' + x(time(d.date)).toFixed(1) + '" cy="' + y(d.price).toFixed(1) + '" r="4"/>';
  });
  svg += '<circle class="sel" r="5.5" hidden/><circle class="dot" r="4.5" hidden/></svg>';
  wrap.innerHTML = svg;

  var node = wrap.querySelector("svg");
  var cross = node.querySelector(".cross"), dot = node.querySelector(".dot");
  var tip = el('<div class="chart-tip" hidden></div>');
  wrap.appendChild(tip);

  /* 손가락이 가리킬 수 있는 것들: 기록한 날들과 실거래들 */
  var marks = live.map(function(p){ return { x: x(p.t), y: y(p.r.min), row: p }; })
    .concat(shownDeals.map(function(d){ return { x: x(time(d.date)), y: y(d.price), deal: d }; }));

  function show(m){
    if (!m){ cross.setAttribute("hidden", ""); dot.setAttribute("hidden", ""); tip.hidden = true; return; }
    cross.removeAttribute("hidden");
    cross.setAttribute("x1", m.x); cross.setAttribute("x2", m.x);
    if (m.row){ dot.removeAttribute("hidden"); dot.setAttribute("cx", m.x); dot.setAttribute("cy", m.y); }
    else dot.setAttribute("hidden", "");
    tip.hidden = false;
    tip.innerHTML = "";
    function put(tag, text){ tip.appendChild(document.createElement(tag)).textContent = text; }
    if (m.row){
      put("span", m.row.r.label + " · 매물 " + m.row.r.count + "건");
      put("b", "최저 " + won(m.row.r.min));
      put("span", "중간 " + won(m.row.r.med) + " · 최고 " + won(m.row.r.max));
    } else {
      put("span", "실거래 · " + dayShort(m.deal.date) + (m.deal.floor ? " · " + m.deal.floor + "층" : ""));
      put("b", won(m.deal.price));
    }
    var box = wrap.getBoundingClientRect();
    var px = m.x / W * box.width;
    tip.style.left = Math.max(0, Math.min(box.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + "px";
    tip.style.top = (m.y / H * box.height > box.height / 2 ? 0 : box.height - tip.offsetHeight - 30) + "px";
  }
  function nearest(e){
    var box = wrap.getBoundingClientRect();
    var px = (e.clientX - box.left) / box.width * W, py = (e.clientY - box.top) / box.height * H;
    var best = null, far = Infinity;
    marks.forEach(function(m){
      /* 가로가 먼저다. 같은 날에 기록과 실거래가 겹치면 손가락에 가까운 쪽 */
      var d = Math.abs(m.x - px) * 4 + Math.abs(m.y - py);
      if (d < far){ far = d; best = m; }
    });
    return best;
  }
  /* 풍선은 누르고 있는 동안에만 뜬다 — 누른 채 옆으로 끌면 그 날을 따라간다 */
  var held = null;
  wrap.addEventListener("pointerdown", function(e){
    if (e.button && e.button !== 0) return;
    held = e.pointerId;
    try{ wrap.setPointerCapture(held); }catch(err){ /* 이미 놓았다 */ }
    show(nearest(e));
  });
  wrap.addEventListener("pointermove", function(e){ if (e.pointerId === held) show(nearest(e)); });
  function letGo(e){ if (e.pointerId === held){ held = null; show(null); } }
  wrap.addEventListener("pointerup", letGo);
  wrap.addEventListener("pointercancel", letGo);

  /* 아래 목록이 어느 날의 것인지 — 그날의 최저가에 고리를 두른다 */
  var sel = node.querySelector(".sel");
  wrap.select = function(i){
    var m = marks.filter(function(k){ return k.row && k.row.i === i; })[0];
    if (!m) return sel.setAttribute("hidden", "");
    sel.removeAttribute("hidden");
    sel.setAttribute("cx", m.x); sel.setAttribute("cy", m.y);
  };
  wrap.select(at);
  return wrap;
}

/* 무엇이 무엇인지 — 색만으로 말하지 않도록 모양도 다르다 */
export function flowLegend(hasDeals){
  return el('<div class="legend">' +
    '<span><i class="lg band"></i>호가 범위</span>' +
    '<span><i class="lg min"></i>최저</span>' +
    '<span><i class="lg med"></i>중간</span>' +
    (hasDeals ? '<span><i class="lg deal"></i>실거래</span>' : '') + '</div>');
}

/* ---------- 실거래 ---------- */
/*
 * deals  [{ date, price, floor }] 그 기간의 거래 (해제된 것은 빼고 준다)
 * from · to  기간의 양 끝 ("2025-11-11")
 *
 * 거래 하나가 점 하나. 달마다의 평균을 선으로 이어 흐름을 보인다 — 거래가 없는 달은 건너뛴다.
 */
export function dealChart(deals, from, to){
  var W = 360, H = 170, L = 8, R = 8, T = 16, B = 26;
  var wrap = el('<div class="chart-wrap"></div>');
  if (!deals.length) return wrap;
  var t0 = time(from), t1 = time(to);
  var lo = Infinity, hi = -Infinity;
  deals.forEach(function(d){ lo = Math.min(lo, d.price); hi = Math.max(hi, d.price); });
  if (hi === lo){ hi += 500; lo -= 500; }
  function x(t){ return L + 6 + (W - L - R - 12) * (t - t0) / (t1 - t0 || 1); }
  function y(v){ return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); }

  var byMonth = {};
  deals.forEach(function(d){ (byMonth[d.date.slice(0, 7)] = byMonth[d.date.slice(0, 7)] || []).push(d.price); });
  var avg = Object.keys(byMonth).sort().map(function(m){
    var list = byMonth[m];
    return { t: time(m + "-15"), v: list.reduce(function(a, b){ return a + b; }, 0) / list.length };
  });

  var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="실거래 ' + deals.length +
    '건: ' + won(lo) + '에서 ' + won(hi) + ' 사이">';
  [hi, (hi + lo) / 2, lo].forEach(function(v, k){
    svg += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
    if (k !== 1) svg += '<text class="tick" x="' + L + '" y="' + (y(v) - 4) + '">' + won(Math.round(v)) + '</text>';
  });
  svg += '<text class="tick" x="' + L + '" y="' + (H - 7) + '">' + from.slice(2, 7).replace("-", ".") + '</text>' +
    '<text class="tick" x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end">' + to.slice(2, 7).replace("-", ".") + '</text>' +
    '<line class="cross" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" hidden/>';
  if (avg.length > 1) svg += '<polyline class="line deal-avg" points="' +
    avg.map(function(p){ return x(p.t).toFixed(1) + "," + y(p.v).toFixed(1); }).join(" ") + '"/>';
  var marks = deals.map(function(d){ return { x: x(time(d.date)), y: y(d.price), d: d }; });
  marks.forEach(function(m){
    svg += '<circle class="deal pt" cx="' + m.x.toFixed(1) + '" cy="' + m.y.toFixed(1) + '" r="3.2"/>';
  });
  svg += '<circle class="deal" r="5" hidden/></svg>';
  wrap.innerHTML = svg;

  var node = wrap.querySelector("svg");
  var cross = node.querySelector(".cross"), dot = node.querySelector("circle[hidden]");
  var tip = el('<div class="chart-tip" hidden></div>');
  wrap.appendChild(tip);
  function show(m){
    if (!m){ cross.setAttribute("hidden", ""); dot.setAttribute("hidden", ""); tip.hidden = true; return; }
    cross.removeAttribute("hidden"); dot.removeAttribute("hidden");
    cross.setAttribute("x1", m.x); cross.setAttribute("x2", m.x);
    dot.setAttribute("cx", m.x); dot.setAttribute("cy", m.y);
    tip.hidden = false;
    tip.innerHTML = "";
    tip.appendChild(document.createElement("span")).textContent =
      m.d.date.slice(2).replace(/-/g, ".") + (m.d.floor ? " · " + m.d.floor + "층" : "");
    tip.appendChild(document.createElement("b")).textContent = won(m.d.price);
    var box = wrap.getBoundingClientRect();
    var px = m.x / W * box.width;
    tip.style.left = Math.max(0, Math.min(box.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + "px";
    tip.style.top = (m.y / H * box.height > box.height / 2 ? 0 : box.height - tip.offsetHeight - 30) + "px";
  }
  wrap.addEventListener("pointermove", function(e){
    var box = wrap.getBoundingClientRect();
    var px = (e.clientX - box.left) / box.width * W, py = (e.clientY - box.top) / box.height * H;
    var best = null, far = Infinity;
    marks.forEach(function(m){
      var d = Math.abs(m.x - px) * 3 + Math.abs(m.y - py);
      if (d < far){ far = d; best = m; }
    });
    show(best);
  });
  wrap.addEventListener("pointerleave", function(){ show(null); });
  return wrap;
}
