/* BEMESTATE — where the app starts.
 *
 *   ui/       the parts any screen uses: sheets, icons, the store, routing
 *   estate/   the screens: the watch list, and one 단지 · 평형 over time
 *
 *   "#/"                 the watch list
 *   "#/w/<id>"           one watch, at its newest snapshot
 *   "#/w/<id>/<slot>"    the same, at the snapshot you picked
 *   "#/import/<네이버 단지>/<…>"   네이버 매물 탭에서 읽어 온 것을 받는 자리 (estate/naver.js) */
import { Store } from "./ui/store.js";
import { Theme } from "./ui/theme.js";
import { Router } from "./ui/router.js";
import { renderList, renderWatch, renderImport, wire } from "./estate/screens.js";

var view = null;
var wasOn = "";

/* 목록과 단지 사이를 오갈 때만 한 번 스치듯 밀린다 */
function slide(next){
  if (next === wasOn) return;
  var back = wasOn === "watch" && next === "list";
  var first = !wasOn;
  wasOn = next;
  if (first) return;
  view.classList.remove("slide-in", "slide-back");
  void view.offsetWidth;
  view.classList.add(back ? "slide-back" : "slide-in");
  view.addEventListener("animationend", function off(){
    view.classList.remove("slide-in", "slide-back");
    view.removeEventListener("animationend", off);
  });
}

function route(path, segs){
  if (segs[0] === "import" && segs[1] && segs[2] && Store.state === "ok"){
    slide("list");
    renderImport(view, decodeURIComponent(segs[1]), segs.slice(2).join("/"));
    return;
  }
  if (segs[0] === "w" && segs[1] && Store.state === "ok"){
    var id = decodeURIComponent(segs[1]);
    if (!Store.watch(id)){ Router.set("/"); return; }
    slide("watch");
    renderWatch(view, id, segs[2] ? decodeURIComponent(segs[2]) : "");
    return;
  }
  slide("list");
  renderList(view);
}

(async function start(){
  Theme.apply();
  view = document.getElementById("view");
  wire({
    go: function(p){ Router.go(p); },
    set: function(p){ Router.set(p); },
    reload: async function(){ await Store.load(); Router.fire(); }
  });
  await Store.load();
  Router.start(route);
  /* 돌아왔을 때 새 기록이 있으면 보이게 — 하루 두 번뿐이라 자주 물을 필요는 없다 */
  document.addEventListener("visibilitychange", async function(){
    if (document.hidden || document.documentElement.classList.contains("modal-open")) return;
    await Store.load();
    if (Router.path() === "/") Router.fire();
  });
})();
