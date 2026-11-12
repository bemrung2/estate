/* The building blocks every screen is made of. */

export function el(html){
  var t = document.createElement("template");
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return ESC[c]; });
}

export function uid(prefix){
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export var ICONS = {
  back: '<polyline points="14 5 7 12 14 19"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  go: '<polyline points="10 5 17 12 10 19"/>',
  rows: '<line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/>',
  cards: '<rect x="4.5" y="4.5" width="15" height="6.2" rx="1.8"/><rect x="4.5" y="13.3" width="15" height="6.2" rx="1.8"/>',
  out: '<path d="M9 5H5v14h14v-4"/><polyline points="13 5 19 5 19 11"/><line x1="19" y1="5" x2="11" y2="13"/>',
  check: '<polyline points="5 12.5 10 17 19 7"/>',
  undo: '<polyline points="9 14 4 9 9 4"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  alert: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="7.6" x2="12" y2="13"/><circle cx="12" cy="16.3" r="0.7" fill="currentColor"/>',
  compass: '<circle cx="12" cy="12" r="9"/><polygon points="15.6 8.4 10.4 10.4 8.4 15.6 13.6 13.6" fill="currentColor" stroke="none"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  tack: '<line x1="8.5" y1="3.5" x2="15.5" y2="3.5"/><path d="M10 3.5l-.8 6.1L5.8 13h12.4l-3.4-3.4-.8-6.1"/><line x1="12" y1="13" x2="12" y2="20.5"/>',
  grip: '<line x1="6.5" y1="9.5" x2="17.5" y2="9.5"/><line x1="6.5" y1="14.5" x2="17.5" y2="14.5"/>',
  trash: '<polyline points="5 7 19 7"/><path d="M8 7V5a1.6 1.6 0 0 1 1.6-1.6h4.8A1.6 1.6 0 0 1 16 5v2"/><path d="M6.6 7l.8 12.2A1.6 1.6 0 0 0 9 20.7h6a1.6 1.6 0 0 0 1.6-1.5L17.4 7"/>',
  plane: '<path d="M2 13l20-7-7 20-3-8-8-3z"/>',
  bed: '<path d="M3 18v-8h11a5 5 0 0 1 5 5v3"/><line x1="3" y1="18" x2="21" y2="18"/><circle cx="7.5" cy="12.5" r="1.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  edit: '<path d="M14.5 5.5l4 4L7 21H3v-4L14.5 5.5z"/><line x1="13" y1="7" x2="17" y2="11"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7" y2="7"/><line x1="17" y1="17" x2="18.7" y2="18.7"/><line x1="5.3" y1="18.7" x2="7" y2="17"/><line x1="17" y1="7" x2="18.7" y2="5.3"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  clip: '<path d="M20 11.5l-8.4 8.4a5 5 0 0 1-7-7l9-9a3.4 3.4 0 0 1 4.8 4.8l-8.9 8.9a1.8 1.8 0 0 1-2.5-2.5l8.1-8.1"/>',
  link: '<path d="M9.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11 6.3"/><path d="M14.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L13 17.7"/>',
  note: '<line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="17" x2="13" y2="17"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-5.5 5.5L8 14l-5 5"/>',
  bag: '<path d="M7 8h10l1 12H6L7 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  star: '<polygon points="12 3.6 14.6 9.2 20.6 10 16.2 14.2 17.4 20.2 12 17.3 6.6 20.2 7.8 14.2 3.4 10 9.4 9.2"/>',
  login: '<path d="M10 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2"/><polyline points="11 9 14 12 11 15"/><line x1="14" y1="12" x2="4" y2="12"/>',
  logout: '<path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><polyline points="17 9 20 12 17 15"/><line x1="20" y1="12" x2="10" y2="12"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.6a3.2 3.2 0 0 1 0 4.8"/><path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19"/>'
};

export function icon(name, cls){
  return '<svg class="icon' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || "") + "</svg>";
}

/* A press spreads from where the finger actually landed, and the action runs
   on click. Acting on pointerdown would re-render under the finger and let the
   trailing click hit whatever replaced it — one tap, two screens. */
export function ripple(node, handler){
  node.classList.add("rip");
  node.addEventListener("pointerdown", function(e){
    if (e.button && e.button !== 0) return;
    var box = node.getBoundingClientRect();
    var size = Math.max(box.width, box.height) * 2.2;
    var ink = document.createElement("span");
    ink.className = "ink";
    ink.style.width = ink.style.height = size + "px";
    ink.style.left = (e.clientX - box.left - size / 2) + "px";
    ink.style.top = (e.clientY - box.top - size / 2) + "px";
    node.appendChild(ink);
    var done = false;
    function off(){
      if (done) return;
      done = true;
      ink.classList.add("out");
      setTimeout(function(){ ink.remove(); }, 320);
    }
    ["pointerup", "pointercancel", "pointerleave"].forEach(function(ev){
      node.addEventListener(ev, off, { once: true });
    });
    setTimeout(off, 1200);
  });
  if (handler) node.addEventListener("click", handler);
  return node;
}

/* kept for nodes that cannot host an ink layer (an <input> overlay, say) */
export function tap(node, handler){
  node.addEventListener("click", handler);
  return node;
}

var toastTimer = null, toastHold = 0;
/* `hold` is for a message that must not be buried by whatever the caller says
   next — a refusal, told after the action that seemed to succeed. */
export function toast(msg, hold){
  var now = Date.now();
  if (!hold && now < toastHold) return;
  toastHold = hold ? now + 2600 : 0;
  show(msg, null, null, 2600, "warn");
}

/* 지운 직후의 몇 초. 그 사이에 누르면 지우기 전으로 돌아간다 —
   "정말 지울까요"를 먼저 묻는 것보다 이쪽이 손이 덜 간다. */
/* 됐다는 말 — 고쳤다, 더했다, 옮겼다. 초록 체크가 앞에 선다. 거절이나 부탁은 toast()로. */
export function toastDone(msg){
  if (Date.now() < toastHold) return;
  toastHold = 0;
  show(msg, null, null, 2600, "done");
}

/* kind는 무엇을 했는지 — "delete"(기본)면 휴지통, "edit"이면 초록 체크가 앞에 선다. */
export function toastUndo(msg, undo, kind){
  toastHold = 0;
  show(msg, "되돌리기", undo, 4000, kind === "edit" ? "edit" : "delete");
}

function show(msg, label, run, ms, kind){
  var t = document.getElementById("toast");
  if (!t) return;
  t.innerHTML = "";
  t.className = "toast " + (kind || "plain");
  if (kind) t.appendChild(el('<span class="toast-ic" aria-hidden="true">' +
    icon(kind === "delete" ? "trash" : kind === "warn" ? "alert" : "check") + '</span>'));
  t.appendChild(el('<span class="toast-msg"></span>')).textContent = msg;
  if (label){
    var b = el('<button class="toast-do" type="button">' + icon("undo") + '<span></span></button>');
    b.querySelector("span").textContent = label;
    b.addEventListener("click", function(){
      t.classList.remove("show");
      clearTimeout(toastTimer);
      if (run) run();
    });
    t.appendChild(b);
    t.appendChild(el('<span class="toast-bar" aria-hidden="true" style="animation-duration:' + ms + 'ms"></span>'));
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("show"); }, ms);
}

/* Only http(s) gets through — a stored "javascript:" would run on tap. */
export function safeUrl(u){
  var s = String(u || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)){
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
    s = "https://" + s;
  }
  return s;
}

export function hostOf(u){
  try{ return new URL(u).hostname.replace(/^www\./, ""); }catch(e){ return u; }
}
