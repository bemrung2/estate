/* Two drawings of one series: the small one on a list card, and the one you
   can run a finger along. One series, one axis; colour comes from the tokens. */
import { el } from "../ui/dom.js";
import { won } from "./format.js";

/* 값이 없는 기록(매물 0건)은 선을 잇지 않고 건너뛴다 */
function points(values, w, h, padX, padTop, padBottom){
  var have = values.filter(function(v){ return v != null; });
  if (!have.length) return { pts: [], lo: 0, hi: 0 };
  var lo = Math.min.apply(null, have), hi = Math.max.apply(null, have);
  var span = hi - lo || 1;
  var step = values.length > 1 ? (w - padX * 2) / (values.length - 1) : 0;
  var pts = values.map(function(v, i){
    if (v == null) return null;
    return {
      x: values.length > 1 ? padX + step * i : w / 2,
      y: hi === lo ? (padTop + (h - padBottom)) / 2 : padTop + (h - padTop - padBottom) * (1 - (v - lo) / span)
    };
  });
  return { pts: pts, lo: lo, hi: hi };
}

function path(pts){
  return pts.filter(Boolean).map(function(p){ return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
}

export function sparkline(values){
  var W = 104, H = 34;
  var g = points(values, W, H, 4, 5, 5);
  var live = g.pts.filter(Boolean);
  if (live.length < 2) return "";
  var end = live[live.length - 1];
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
    '<polyline points="' + path(g.pts) + '"/>' +
    '<circle cx="' + end.x.toFixed(1) + '" cy="' + end.y.toFixed(1) + '" r="3.5"/></svg>';
}

/* rows: [{ label, short, value }] oldest first. `at` is the one shown below
   the chart; tapping a point asks for that one (onPick(i)). */
export function lineChart(rows, at, onPick){
  var W = 360, H = 150, L = 6, R = 6, T = 14, B = 24;
  var g = points(rows.map(function(r){ return r.value; }), W, H, 10, T, B);
  var wrap = el('<div class="chart-wrap"></div>');
  if (!g.pts.filter(Boolean).length){
    wrap.appendChild(el('<p class="card-empty">가격이 있는 기록이 아직 없습니다.</p>'));
    return wrap;
  }
  var yTop = T, yBot = H - B;
  var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최저 호가 추이: ' +
    won(g.lo) + '에서 ' + won(g.hi) + ' 사이">' +
    '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yTop + '" y2="' + yTop + '"/>' +
    '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yBot + '" y2="' + yBot + '"/>' +
    '<text class="tick" x="' + L + '" y="' + (yTop - 4) + '">' + won(g.hi) + '</text>' +
    (g.hi !== g.lo ? '<text class="tick" x="' + L + '" y="' + (yBot - 4) + '">' + won(g.lo) + '</text>' : '') +
    '<text class="tick" x="' + L + '" y="' + (H - 6) + '">' + rows[0].short + '</text>' +
    '<text class="tick" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + rows[rows.length - 1].short + '</text>' +
    '<line class="cross" x1="0" x2="0" y1="' + yTop + '" y2="' + yBot + '" hidden/>' +
    '<polyline class="line" points="' + path(g.pts) + '"/>' +
    '<circle class="dot" r="4.5" hidden/></svg>';
  wrap.innerHTML = svg;
  var node = wrap.querySelector("svg");
  var cross = node.querySelector(".cross"), dot = node.querySelector(".dot");
  var tip = el('<div class="chart-tip" hidden></div>');
  wrap.appendChild(tip);

  function show(i){
    var p = g.pts[i];
    if (!p){ cross.setAttribute("hidden", ""); dot.setAttribute("hidden", ""); tip.hidden = true; return; }
    cross.removeAttribute("hidden"); dot.removeAttribute("hidden");
    cross.setAttribute("x1", p.x); cross.setAttribute("x2", p.x);
    dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y);
    tip.hidden = false;
    tip.innerHTML = "";
    tip.appendChild(document.createElement("b")).textContent = won(rows[i].value);
    tip.appendChild(document.createTextNode(rows[i].label));
    var box = wrap.getBoundingClientRect();
    var x = p.x / W * box.width;
    var half = tip.offsetWidth / 2;
    tip.style.left = Math.max(0, Math.min(box.width - tip.offsetWidth, x - half)) + "px";
    tip.style.top = (p.y / H * box.height > 62 ? 0 : box.height - tip.offsetHeight - 26) + "px";
  }
  function nearest(e){
    var box = wrap.getBoundingClientRect();
    var x = (e.clientX - box.left) / box.width * W;
    var best = -1, far = Infinity;
    g.pts.forEach(function(p, i){
      if (p && Math.abs(p.x - x) < far){ far = Math.abs(p.x - x); best = i; }
    });
    return best;
  }
  /* 손을 떼면 아래에 보이는 그 기록으로 돌아온다 */
  function rest(){ show(at); }
  wrap.addEventListener("pointermove", function(e){ show(nearest(e)); });
  wrap.addEventListener("pointerleave", rest);
  wrap.addEventListener("click", function(e){
    var i = nearest(e);
    if (i >= 0 && i !== at && onPick) onPick(i);
  });
  requestAnimationFrame(rest);
  return wrap;
}
