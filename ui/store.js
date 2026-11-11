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
  sources: [],
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
      this.sources = data.sources || [];
      this.watches = data.watches || [];
      this.series = data.series || {};
    }catch(e){
      this.state = "down";
      this.message = "";
    }
  },

  watch(id){ return this.watches.filter(function(w){ return w.id === id; })[0] || null; },
  history(id){ return ask("api/watch?id=" + encodeURIComponent(id)); },
  snapshot(id, slot){ return ask("api/watch?id=" + encodeURIComponent(id) + "&slot=" + encodeURIComponent(slot)); },
  search(source, q){ return ask("api/search?source=" + source + "&q=" + encodeURIComponent(q)); },
  types(source, complexId, trade){
    return ask("api/search?source=" + source + "&complex=" + encodeURIComponent(complexId) + "&trade=" + trade);
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
