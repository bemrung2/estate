/* What the server last said: the watch list with its recent numbers. The screens read this; nothing here knows
 * what a 단지 is beyond passing it along. */
import { toast } from "./dom.js";

async function ask(path, init){
  var res = await fetch(path, Object.assign({ cache: "no-store" }, init || {}));
  var data = null;
  try{ data = await res.json(); }catch(e){ /* 본문이 없을 수도 */ }
  if (!data) throw new Error("연결을 확인해 주세요.");
  if (!data.ok) throw new Error(data.message || data.error || ("오류 " + res.status));
  return data;
}

export var Store = {
  /* "wait" · "ok" · "setup"(서버 설정이 덜 됨) · "down"(서버가 없거나 닿지 않음) */
  state: "wait",
  message: "",
  deals: false,       /* 실거래가가 켜져 있는가 (MOLIT_SERVICE_KEY) */
  watches: [],
  series: {},

  async load(){
    try{
      var res = await fetch("api/watch", { cache: "no-store" });
      var data = await res.json();
      if (!data.ok){
        this.state = data.error === "setup" ? "setup" : "down";
        this.message = data.message || "";
        return;
      }
      this.state = "ok";
      this.deals = !!data.deals;
      var hidden = this._hidden;
      this.watches = (data.watches || []).filter(function(w){ return !hidden[w.id]; });
      this.series = data.series || {};
    }catch(e){
      this.state = "down";
      this.message = "";
    }
  },

  /* 삭제는 되돌릴 수 있는 몇 초가 지난 뒤에야 서버로 간다. 그동안은 화면에서만 사라져
     있고, 되돌리면 아무 일도 없었던 것이 된다 — 기록까지 지워지는 일이라 그렇게 한다. */
  _hidden: {},
  _gone: {},
  removeSoon(w, ms, onDone){
    var self = this;
    this._hidden[w.id] = true;
    var at = this.watches.indexOf(w);
    this.watches = this.watches.filter(function(x){ return x.id !== w.id; });
    function send(){
      if (!self._gone[w.id]) return;
      delete self._gone[w.id];
      window.removeEventListener("pagehide", send);
      fetch("api/watch", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ remove: w.id }), keepalive: true
      }).then(function(res){
        delete self._hidden[w.id];
        if (!res.ok) throw new Error("오류 " + res.status);
      }).catch(function(e){
        delete self._hidden[w.id];
        toast("삭제하지 못했습니다 — " + e.message, true);
        if (onDone) onDone();
      });
    }
    this._gone[w.id] = setTimeout(send, ms);
    window.addEventListener("pagehide", send);      /* 창을 닫아도 삭제는 간다 */
    /* 되돌리기 */
    return function(){
      if (!self._gone[w.id]) return;
      clearTimeout(self._gone[w.id]);
      delete self._gone[w.id];
      delete self._hidden[w.id];
      window.removeEventListener("pagehide", send);
      self.watches.splice(Math.max(0, Math.min(at, self.watches.length)), 0, w);
      if (onDone) onDone();
    };
  },

  watch(id){ return this.watches.filter(function(w){ return w.id === id; })[0] || null; },
  history(id){ return ask("api/watch?id=" + encodeURIComponent(id)); },
  snapshot(id, slot){ return ask("api/watch?id=" + encodeURIComponent(id) + "&slot=" + encodeURIComponent(slot)); },
  live(id){ return ask("api/watch?id=" + encodeURIComponent(id) + "&slot=now"); },
  search(q){ return ask("api/search?q=" + encodeURIComponent(q)); },
  types(complexId){ return ask("api/search?complex=" + encodeURIComponent(complexId)); },
  findNaver(complexId, name){
    return ask("api/search?naverOf=" + encodeURIComponent(complexId) + "&name=" + encodeURIComponent(name));
  },
  post(body){
    return ask("api/watch", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
  },

  /* 로그인이 없다 — 주소를 아는 사람은 누구나 고친다. 창(ui/sheet.js)이 묻는
     말이라 자리는 남겨 둔다. */
  canEdit(){ return true; },
  deny(){ toast("지금은 고칠 수 없습니다.", true); }
};
