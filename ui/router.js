/* The address is the screen. A reload lands back where you were, the back
   gesture walks the screens you came through, and a link can point at one.

   What the paths mean is src/plan/nav.js's business; this only carries them. */

var handler = null;
var last = "";

/* Links made when the plan was one experiment among several still work:
   "#/travel/t/x/sched/0" is the same screen as "#/t/x/sched/0". */
function strip(path){ return (path || "/").replace(/^\/travel(?=\/|$)/, "") || "/"; }

function current(){
  return strip((location.hash || "").replace(/^#/, ""));
}

export var Router = {
  /* onRoute(path, segments) runs on every address change, ours included */
  start(onRoute){
    handler = onRoute;
    window.addEventListener("hashchange", function(){
      if (current() === last) return;
      Router.fire();
    });
    window.addEventListener("popstate", function(){ Router.fire(); });
    Router.fire();
  },

  fire(){
    var path = current();
    last = path;
    remember(path);
    if (handler) handler(path, path.split("/").filter(Boolean));
  },

  path(){ return current(); },

  /* go() is a step you can come back from; set() corrects the address for the
     screen already shown, without becoming its own step */
  go(path){ write(path, false); },
  set(path){ write(path, true); },

  /* where this browser was last, for when there is no address to read */
  remembered(){
    try{ return strip(localStorage.getItem("estate.route") || ""); }catch(e){ return ""; }
  }
};

function remember(path){
  try{ localStorage.setItem("estate.route", path); }catch(e){ /* private mode */ }
}

function write(path, replace){
  var hash = "#" + path;
  var same = location.hash === hash;
  last = path;
  remember(path);
  if (!same){
    try{
      if (replace) history.replaceState(null, "", hash);
      else history.pushState(null, "", hash);
    }catch(e){
      /* a frame may refuse history writes; the hash alone still routes */
      location.hash = hash;
    }
  }
  /* neither pushState nor replaceState raises an event, so the screen that
     the new address names has to be asked for here */
  if (handler) handler(path, path.split("/").filter(Boolean));
}
