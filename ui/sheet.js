/* Sheets, dialogs and the form controls they are made of. */
import { el, esc, icon, ripple, safeUrl, toast, toastUndo, toastDone } from "./dom.js";
import { Store } from "./store.js";

/* 고치는 창은 고칠 수 있는 사람에게만 열린다. 열어놓고 저장할 때 막으면
   적어둔 것이 사라지므로, 열기 전에 묻는다 — 로그인하지 않았다면 그 길로
   로그인 화면으로 간다(Store.deny). */
function mayEdit(){
  if (Store.canEdit()) return true;
  Store.deny();
  return false;
}

/* A weekday name is calendar knowledge; it belongs with the controls. */
var DOW = ["일", "월", "화", "수", "목", "금", "토"];
function dowOf(iso){ return DOW[new Date(iso + "T00:00:00").getDay()]; }

var overlay = null;
function host(){
  return overlay || (overlay = document.getElementById("overlay"));
}
/* 창은 서서히 뜨고 서서히 걷힌다. 뜨는 쪽은 CSS가 맡고(붙는 순간 움직인다),
   걷히는 쪽은 여기서 "떠나는 중"이라고 표시한 뒤 움직임이 끝나면 뗀다.
   떠나는 창은 손가락을 받지 않는다 — 그 사이에 새로 뜬 창은 건드리지 않는다. */
var LEAVE_MS = 170;
function open(){
  return Array.prototype.filter.call(host().children, function(n){ return !n._leaving; });
}
/* 창이 떠 있는 동안 뒤의 화면은 구르지 않는다. 알림도 창의 단추를 가리지 않게 올라선다. */
function lock(){ document.documentElement.classList.toggle("modal-open", open().length > 0); }
function leave(node){
  if (!node || node._leaving) return;
  node._leaving = true;
  node.classList.add("leaving");
  lock();
  setTimeout(function(){ if (node.parentNode) node.parentNode.removeChild(node); }, LEAVE_MS);
}
export function closeOverlay(){ Array.prototype.slice.call(host().children).forEach(leave); }
export function showOverlay(node){ host().appendChild(node); lock(); }
/* 창 위에 창을 띄울 때는 그 하나만 닫는다 — 뒤에 열려 있던 것까지 치우면
   고치던 내용이 사라진다. */
export function closeTop(node){ leave(node); }

/* Esc는 맨 위의 창 하나를 닫는다 — 그 창이 닫히는 제 방식대로(적던 것이 있으면 묻는다). */
document.addEventListener("keydown", function(e){
  if (e.key !== "Escape") return;
  var top = open().pop();
  if (!top) return;
  e.preventDefault();
  if (top._shut) top._shut(); else leave(top);
});

/* 비어 있거나 틀린 칸은 그 칸이 말한다 — 테두리가 붉어지고 한 번 흔들린다.
   다시 적기 시작하면 풀린다. */
export function flag(input, said){
  if (said) toast(said);
  if (!input) return;
  var box = input.closest ? (input.closest(".pickbox, .timebox") || input) : input;
  box.classList.remove("bad");
  void box.offsetWidth;
  box.classList.add("bad");
  if (input.focus && input.type !== "hidden") input.focus();
  function clear(){ box.classList.remove("bad"); input.removeEventListener("input", clear); input.removeEventListener("change", clear); }
  input.addEventListener("input", clear);
  input.addEventListener("change", clear);
}

/* 여러 줄 칸은 적은 만큼 자란다. 두 줄 높이에서 잘려 보이면 무엇을 적었는지 모른다. */
export function grow(area){
  function fit(){
    area.style.height = "auto";
    area.style.height = Math.min(220, area.scrollHeight + 2) + "px";
  }
  area.addEventListener("input", fit);
  requestAnimationFrame(fit);
  return area;
}
function growAll(root){
  Array.prototype.forEach.call(root.querySelectorAll("textarea"), function(a){
    if (!a._grows){ a._grows = true; grow(a); }
  });
}

/* 지우기 전에 한 번 묻는다. 창 위에 뜨는 작은 창이라, 아니라고 하면 그것만 닫힌다. */
/* 고치려는데 로그인하지 않았을 때 */
export function openLoginDialog(){
  var scrim = el('<div class="scrim mid"><div class="dialog ask login" role="alertdialog" aria-modal="true">' +
    '<h3>편집하려면 로그인해 주세요</h3>' +
    '<p class="dialog-body">등록 · 수정 · 삭제는 주인 계정만 할 수 있습니다. 보는 것은 누구나 할 수 있습니다.</p>' +
    '<a class="kakao" href="api/auth?login"><svg class="kakao-mark" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="currentColor" d="M12 3.5C6.8 3.5 2.6 6.8 2.6 10.9c0 2.6 1.7 4.9 4.3 6.2l-1 3.7c-.1.3.3.6.6.4l4.3-2.9c.4 0 .8.1 1.2.1 5.2 0 9.4-3.3 9.4-7.5S17.2 3.5 12 3.5z"/></svg>카카오로 로그인</a>' +
    '<div class="dialog-actions"><span class="spacer"></span><button class="btn-text" data-a="no">닫기</button></div></div></div>');
  function no(){ closeTop(scrim); }
  scrim.querySelector('[data-a="no"]').addEventListener("click", no);
  scrim.addEventListener("click", function(e){ if (e.target === scrim) no(); });
  showOverlay(scrim);
}

export function openAskDialog(opts, onYes){
  var scrim = el('<div class="scrim mid"><div class="dialog ask" role="alertdialog" aria-modal="true">' +
    '<h3>' + esc(opts.title || "삭제하시겠습니까?") + '</h3>' +
    (opts.body ? '<p class="dialog-body">' + esc(opts.body) + '</p>' : '') +
    '<div class="dialog-actions"><span class="spacer"></span>' +
      '<button class="btn-text" data-a="no">취소</button>' +
      '<button class="btn-text danger" data-a="yes">' + esc(opts.okLabel || "삭제") + '</button>' +
    '</div></div></div>');
  function no(){ closeTop(scrim); }
  scrim.querySelector('[data-a="no"]').addEventListener("click", no);
  scrim.addEventListener("click", function(e){ if (e.target === scrim) no(); });
  scrim.querySelector('[data-a="yes"]').addEventListener("click", function(){
    closeTop(scrim);
    onYes();
  });
  showOverlay(scrim);
}

/* 지우기 → 묻고 → 모든 창을 닫고 → 지운 뒤 되돌리기를 내민다. 어디서 지우든 이 길이다. */
export function askThenDelete(what, onDelete){
  openAskDialog({ title: "삭제하시겠습니까?", body: what ? "'" + what + "'" + objectMark(what) + " 삭제합니다." : "" }, function(){
    closeOverlay();
    var undo = onDelete();
    if (undo) toastUndo("삭제했습니다.", undo); else toast("삭제했습니다.");
  });
}
/* '을'과 '를'은 마지막 글자의 받침이 정한다. 한글로 끝나지 않으면 읽는 소리를
   알 수 없으니 둘 다 적는다. */
function objectMark(word){
  var c = String(word).trim().slice(-1).charCodeAt(0) - 0xAC00;
  if (!(c >= 0 && c < 11172)) return "을(를)";
  return c % 28 ? "을" : "를";
}
/* 고친 것도 몇 초간 되돌릴 수 있다 */
export function savedToast(isEdit, undo){
  if (isEdit && undo) toastUndo("수정했습니다.", undo, "edit");
  else toastDone(isEdit ? "수정했습니다." : "추가했습니다.");
}

export function sheetShell(title, sub){
  var s = el(
    '<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="sheet-grip"></div>' +
      '<div class="sheet-head"><div style="flex:1;min-width:0">' +
        '<p class="sheet-title">' + esc(title) + '</p>' +
        (sub ? '<p class="sheet-sub">' + esc(sub) + '</p>' : '') +
      '</div><button class="icon-btn" data-x aria-label="닫기">' + icon("x") + '</button></div>' +
      '<div class="sheet-body"></div>' +
      '<div class="sheet-foot"></div>' +
    '</div></div>'
  );
  /* 적던 것이 있으면 닫기 전에 한 번 묻는다. 바깥을 스친 손가락 하나에 다 적은
     것이 사라지면 안 된다. 적은 것이 없으면 그냥 닫힌다. */
  var dirty = false;
  function touched(){ dirty = true; }
  s.addEventListener("input", touched);
  s.addEventListener("change", touched);
  s._clean = function(){ dirty = false; };   /* 방금 저장했다 — 남은 것이 없다 */
  s._shut = function(){
    if (!dirty) return closeOverlay();
    openAskDialog({ title: "닫으시겠습니까?", body: "작성 중인 내용은 저장되지 않습니다.", okLabel: "닫기" },
      closeOverlay);
  };
  ripple(s.querySelector("[data-x]"), s._shut);
  s.addEventListener("click", function(e){ if (e.target === s) s._shut(); });
  dragToClose(s);
  /* 칸은 나중에 채워진다 — 올라간 뒤에 여러 줄 칸을 찾아 자라게 한다 */
  requestAnimationFrame(function(){ growAll(s); });
  return s;
}

/* 손잡이를 아래로 끌어내리면 닫힌다. 손잡이와 제목 줄에서만 잡힌다 — 내용은 굴러야 한다. */
function dragToClose(scrim){
  var sheet = scrim.querySelector(".sheet");
  var from = null, dy = 0;
  function down(e){
    if (e.target.closest("button, input, textarea, a")) return;
    from = e.clientY; dy = 0;
    sheet.style.transition = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function move(e){
    if (from === null) return;
    dy = Math.max(0, e.clientY - from);
    sheet.style.transform = "translateY(" + dy + "px)";
  }
  function up(){
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (from === null) return;
    from = null;
    sheet.style.transition = "transform 220ms cubic-bezier(0.2, 0, 0, 1)";
    sheet.style.transform = "";
    if (dy > 90) scrim._shut();
  }
  [scrim.querySelector(".sheet-grip"), scrim.querySelector(".sheet-head")].forEach(function(n){
    n.style.touchAction = "none";
    n.addEventListener("pointerdown", down);
  });
}

/* Generic record form — used by every 정보 section and 쇼핑 가게. */
export function openFormSheet(opts, rec, onSave, onDelete){
  if (!mayEdit()) return;
  var sheet = sheetShell(opts.title);
  var body = sheet.querySelector(".sheet-body");
  var foot = sheet.querySelector(".sheet-foot");
  var inputs = {};

  opts.fields.forEach(function(f){
    var v = rec ? (rec[f.key] || "") : "";
    var control = f.area
      ? '<textarea id="f-' + f.key + '" placeholder="' + esc(f.placeholder || "") + '">' + esc(v) + '</textarea>'
      : '<input id="f-' + f.key + '" type="' + (f.time ? "time" : "text") + '" placeholder="' +
        esc(f.placeholder || "") + '" value="' + esc(v) + '">';
    var fld = el('<div class="fld"><label for="f-' + f.key + '">' + esc(f.label) + '</label>' + control + '</div>');
    body.appendChild(fld);
    inputs[f.key] = fld.querySelector("#f-" + f.key);
  });

  if (onDelete){
    var del = el('<button class="btn btn-danger" type="button">삭제</button>');
    ripple(del, function(){ askThenDelete(rec && (rec[opts.fields[0].key] || ""), onDelete); });
    foot.appendChild(del);
  }
  var save = el('<button class="btn btn-primary" type="button">저장</button>');
  ripple(save, function(){
    var out = {};
    for (var i = 0; i < opts.fields.length; i++){
      var f = opts.fields[i];
      var val = inputs[f.key].value.trim();
      if (f.required && !val) return flag(inputs[f.key], f.label + objectMark(f.label) + " 적어 주세요.");
      if (f.url){
        var u = safeUrl(val);
        if (!u) return flag(inputs[f.key], "링크를 확인해 주세요.");
        val = u;
      }
      out[f.key] = val;
    }
    closeOverlay();
    savedToast(!!rec, onSave(out));
  });
  foot.appendChild(save);
  /* 한 줄 칸에서 엔터는 저장이다 */
  body.addEventListener("keydown", function(e){
    if (e.key === "Enter" && e.target.tagName === "INPUT" && !e.isComposing) save.click();
  });

  showOverlay(sheet);
  /* 새로 적을 때만 첫 칸을 잡는다. 고치러 들어왔을 때 자판이 먼저 올라오면
     고칠 곳을 가린다. */
  if (!rec) setTimeout(function(){ inputs[opts.fields[0].key].focus(); }, 60);
}

export function openTextDialog(opts, onSave, onDelete, onCancel){
  if (!mayEdit()) return;
  var field = opts.multiline
    ? '<textarea id="dlg-v" placeholder="' + esc(opts.placeholder || "") + '">' + esc(opts.value || "") + '</textarea>'
    : '<input id="dlg-v" type="text" placeholder="' + esc(opts.placeholder || "") + '" value="' + esc(opts.value || "") + '">';
  var scrim = el('<div class="scrim mid"><div class="dialog" role="dialog" aria-modal="true">' +
    '<h3>' + esc(opts.title) + '</h3><div class="fld">' + field +
    (opts.hint ? '<p class="fld-hint">' + esc(opts.hint) + '</p>' : '') + '</div>' +
    '<div class="dialog-actions">' +
      (onDelete ? '<button class="btn-text danger" data-a="del">삭제</button>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn-text" data-a="no">취소</button>' +
      '<button class="btn-text go" data-a="ok">' + esc(opts.okLabel || "저장") + '</button>' +
    '</div></div></div>');
  function give(){ closeTop(scrim); if (onCancel) onCancel(); }
  scrim._shut = give;
  scrim.addEventListener("click", function(e){ if (e.target === scrim) give(); });
  var input = scrim.querySelector("#dlg-v");
  scrim.querySelector('[data-a="no"]').addEventListener("click", give);
  if (onDelete) scrim.querySelector('[data-a="del"]').addEventListener("click", function(){
    askThenDelete(opts.what || opts.value, onDelete);
  });
  scrim.querySelector('[data-a="ok"]').addEventListener("click", function(){
    var v = input.value.trim();
    if (!v) return flag(input);
    closeOverlay();
    var undo = onSave(v);
    /* 있던 것을 바꿨을 때만 되돌리기를 내민다 — 새로 적은 것은 지우면 된다 */
    if (opts.value && undo) savedToast(true, undo);
  });
  input.addEventListener("keydown", function(e){
    if (e.key === "Enter" && !opts.multiline && !e.isComposing) scrim.querySelector('[data-a="ok"]').click();
  });
  if (opts.multiline) grow(input);
  showOverlay(scrim);
  setTimeout(function(){ input.focus(); if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length); }, 60);
}

/* Something that cannot be undone asks you to write it out. A tap can happen
   by accident; typing 삭제하기 cannot. */
export function openConfirmDialog(opts, onYes){
  if (!mayEdit()) return;
  var scrim = el('<div class="scrim mid"><div class="dialog" role="dialog" aria-modal="true">' +
    '<h3>' + esc(opts.title) + '</h3>' +
    '<p class="dialog-body">' + esc(opts.body) + '</p>' +
    '<div class="fld"><label for="cfm-v">' + esc(opts.label || opts.phrase) + '</label>' +
    '<input id="cfm-v" type="text" autocomplete="off" autocapitalize="off" ' +
    'spellcheck="false" placeholder="' + esc(opts.phrase) + '"></div>' +
    '<div class="dialog-actions">' +
      '<span class="spacer"></span>' +
      '<button class="btn-text" data-a="no">취소</button>' +
      '<button class="btn-text danger" data-a="ok" disabled>' + esc(opts.okLabel || "삭제") + '</button>' +
    '</div></div></div>');
  var input = scrim.querySelector("#cfm-v");
  var ok = scrim.querySelector('[data-a="ok"]');
  function check(){ ok.disabled = input.value.trim() !== opts.phrase; }
  function done(){
    if (ok.disabled) return flag(input);
    closeOverlay();
    onYes();
  }
  input.addEventListener("input", check);
  input.addEventListener("keydown", function(e){ if (e.key === "Enter") done(); });
  scrim.querySelector('[data-a="no"]').addEventListener("click", closeOverlay);
  ok.addEventListener("click", done);
  scrim.addEventListener("click", function(e){ if (e.target === scrim) closeOverlay(); });
  showOverlay(scrim);
  setTimeout(function(){ input.focus(); }, 60);
}

export function pickerField(o){
  if (o.type === "time") return timeField(o);

  function show(v){ return v ? v.replace(/-/g, ".") + " (" + dowOf(v) + ")" : "날짜 선택"; }
  var wrap = el(
    '<div class="' + (o.col ? "fld-col" : "fld") + '">' +
      '<label for="' + o.id + '">' + esc(o.label) + '</label>' +
      '<div class="pickbox' + (o.value ? "" : " blank") + '">' +
        '<span class="pickval">' + esc(show(o.value)) + '</span>' +
        '<input id="' + o.id + '" type="date" value="' + esc(o.value || "") + '">' +
      '</div>' +
    '</div>'
  );
  var input = wrap.querySelector("input");
  var box = wrap.querySelector(".pickbox");
  var val = wrap.querySelector(".pickval");
  function sync(){
    val.textContent = show(input.value);
    box.classList.toggle("blank", !input.value);
  }
  input.addEventListener("input", sync);
  input.addEventListener("change", sync);
  return wrap;
}

/* ---------- 시각 ----------
   시와 분을 휠로 돌려 고른다.
   `<input type="time">`에 기대지 않는 이유는 두 가지다: 폰의 시계 휠은 step을 무시해
   1분씩 돌아가고, 종료 시각에서 "시작보다 이른 시각"을 숨길 방법도 없다. 둘 다 고를 수
   있는 것만 내놓으면 끝나는 일이라, 휠을 직접 돌린다.
   값은 같은 id의 숨은 칸에 "HH:MM"으로 들어가므로 읽는 쪽은 예전 그대로다. */
var MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
var HOURS = [];
for (var _h = 0; _h < 24; _h++) HOURS.push(String(_h).padStart(2, "0"));
var WHEEL_ITEM = 38;   /* .wheel-item 한 칸의 높이 — CSS와 맞춰 둔다 */

function parts(v){
  return /^\d\d:\d\d$/.test(String(v || "")) ? [v.slice(0, 2), v.slice(3, 5)] : ["", ""];
}
function onFive(mm){
  if (!mm) return "";
  var i = MINUTES.indexOf(mm);
  return i >= 0 ? mm : MINUTES[Math.min(11, Math.round(+mm / 5))];
}

export function timeField(o){
  var p = parts(o.value);
  var hh = p[0], mm = onFive(p[1]);
  var wrap = el(
    '<div class="' + (o.col ? "fld-col" : "fld") + '">' +
      '<label for="' + o.id + '-open">' + esc(o.label) + '</label>' +
      '<button class="timebox' + (hh && mm ? "" : " blank") + '" type="button" id="' + o.id + '-open">' +
        '<span class="timeval mono">' + (hh && mm ? hh + ":" + mm : "--:--") + '</span>' +
      '</button>' +
      '<input id="' + o.id + '" type="hidden" value="' + esc(hh && mm ? hh + ":" + mm : "") + '">' +
    '</div>'
  );
  var box = wrap.querySelector(".timebox");
  var val = wrap.querySelector(".timeval");
  var hidden = wrap.querySelector("input");

  ripple(box, function(){
    openTimeWheel({
      title: o.label,
      value: hidden.value,
      min: o.min ? o.min() : ""
    }, function(next){
      hidden.value = next;
      val.textContent = next || "--:--";
      box.classList.toggle("blank", !next);
      box.classList.remove("bad");
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  return wrap;
}

/* 하나의 휠. 고른 자리가 가운데 와서 멈춘다. */
function wheel(list, on, onPick){
  var w = el('<div class="wheel"></div>');
  function paint(){
    w.innerHTML = "";
    w.appendChild(el('<div class="wheel-pad"></div>'));
    list.forEach(function(v){
      var it = el('<div class="wheel-item' + (v === on ? " on" : "") + '">' + esc(v) + '</div>');
      it.addEventListener("click", function(){ set(v, true); });
      w.appendChild(it);
    });
    w.appendChild(el('<div class="wheel-pad"></div>'));
  }
  function set(v, tell){
    on = v;
    var i = list.indexOf(v);
    if (i < 0) return;
    w.querySelectorAll(".wheel-item").forEach(function(x, n){ x.classList.toggle("on", n === i); });
    w.scrollTop = i * WHEEL_ITEM;
    if (tell && onPick) onPick(v);
  }
  var settle = null;
  w.addEventListener("scroll", function(){
    clearTimeout(settle);
    settle = setTimeout(function(){
      var i = Math.max(0, Math.min(list.length - 1, Math.round(w.scrollTop / WHEEL_ITEM)));
      if (list[i] === on) return;
      on = list[i];
      w.querySelectorAll(".wheel-item").forEach(function(x, n){ x.classList.toggle("on", n === i); });
      if (onPick) onPick(on);
    }, 90);
  });
  paint();
  return {
    node: w,
    get value(){ return on; },
    set: set,
    reload: function(next, keep){
      list = next;
      if (list.indexOf(keep) < 0) keep = list[0];
      on = keep;
      paint();
      set(keep, false);
    }
  };
}

function openTimeWheel(opts, onDone){
  var lower = parts(opts.min);
  var lowH = lower[0], lowM = onFive(lower[1]);
  /* 시작이 14:05면 종료에는 14시부터만, 그 14시 안에서는 05분부터만 보인다. */
  function hours(){ return lowH ? HOURS.filter(function(h){ return h >= lowH; }) : HOURS.slice(); }
  function minutes(h){ return lowH && h === lowH ? MINUTES.filter(function(m){ return m >= lowM; }) : MINUTES.slice(); }

  var now = parts(opts.value);
  var hh = now[0] || lowH || "12";
  var mm = onFive(now[1]) || (hh === lowH ? lowM : "00");
  if (hours().indexOf(hh) < 0) hh = hours()[0];
  if (minutes(hh).indexOf(mm) < 0) mm = minutes(hh)[0];

  var scrim = el('<div class="scrim mid"><div class="dialog" role="dialog" aria-modal="true">' +
    '<h3>' + esc(opts.title || "시각") + '</h3>' +
    '<div class="wheels"><span class="wheel-bar"></span></div>' +
    '<div class="dialog-actions">' +
      '<button class="btn-text" data-a="clear">비우기</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn-text" data-a="no">취소</button>' +
      '<button class="btn-text go" data-a="ok">확인</button>' +
    '</div></div></div>');

  var box = scrim.querySelector(".wheels");
  var mWheel = wheel(minutes(hh), mm, function(v){ mm = v; });
  var hWheel = wheel(hours(), hh, function(v){
    hh = v;
    var next = minutes(v);
    if (next.indexOf(mm) < 0) mm = next[0];
    mWheel.reload(next, mm);
  });
  box.appendChild(hWheel.node);
  box.appendChild(el('<span class="wheel-sep">:</span>'));
  box.appendChild(mWheel.node);

  function shut(){ closeTop(scrim); }
  scrim.querySelector('[data-a="no"]').addEventListener("click", shut);
  scrim.querySelector('[data-a="clear"]').addEventListener("click", function(){ shut(); onDone(""); });
  scrim.querySelector('[data-a="ok"]').addEventListener("click", function(){
    shut();
    onDone(hWheel.value + ":" + mWheel.value);
  });
  scrim.addEventListener("click", function(e){ if (e.target === scrim) shut(); });
  showOverlay(scrim);
  /* 자리를 잡으려면 화면에 올라간 뒤라야 한다 */
  requestAnimationFrame(function(){ hWheel.set(hh, false); mWheel.set(mm, false); });
}

export function pickGroup(row, options, get, set){
  row.innerHTML = "";
  options.forEach(function(o){
    var b = el('<button class="pick" type="button" aria-pressed="' + (get() === o.key) + '">' + esc(o.label) + '</button>');
    ripple(b, function(){
      set(o.key);
      row.querySelectorAll(".pick").forEach(function(x, i){
        x.setAttribute("aria-pressed", String(options[i].key === get()));
      });
      row.dispatchEvent(new Event("change", { bubbles: true }));
    });
    row.appendChild(b);
  });
  /* 옆으로 구르는 줄이면 고른 것이 보이는 자리에 오게 한다 */
  requestAnimationFrame(function(){
    var on = row.querySelector('.pick[aria-pressed="true"]');
    if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  });
}
