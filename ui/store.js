/* What the server last said: who you are, what you may do, and the watch
 * list with its recent numbers. The screens read this; nothing here knows
 * what a 단지 is beyond passing it along. */
import { toast } from "./dom.js";

async function ask(path, init){
  var res = await fetch(path, Object.assign({ cache: "no-store" }, init || {}));
  var data = null;
  try{ data = await res.json(); }catch(e){ /* 본문이 없을 수도 */ }
  if (res.status === 403){ Store.deny(); return null; }
  if (!data) throw new Error("연결을 확인해 주세요.");
  if (!data.ok) throw new Error(data.message || data.error || ("오류 " + res.status));
  return data;
}

export var Store = {
  /* "wait" · "ok" · "setup"(서버 설정이 덜 됨) · "down"(서버가 없거나 닿지 않음) */
  state: "wait",
  message: "",
  me: null,
  canWrite: false,
  canSignIn: false,
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
      this.me = data.me || null;
      this.canWrite = !!data.canWrite;
      this.canSignIn = !!data.canSignIn;
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
  search(q){ return ask("api/search?q=" + encodeURIComponent(q)); },
  types(complexId, trade){ return ask("api/search?complex=" + encodeURIComponent(complexId) + "&trade=" + trade); },
  post(body){
    return ask("api/watch", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
  },

  canEdit(){ return this.canWrite; },
  /* 고치려는 사람에게 할 말은 둘 중 하나다: 로그인하지 않았으면 로그인 화면으로,
     로그인했는데 권한이 없으면 그 사실을. */
  deny(){
    if (!this.me && this.canSignIn) return this.signIn();
    toast(this.me ? "편집 권한이 없습니다. 주인에게 요청해 주세요." : "지금은 고칠 수 없습니다.", true);
  },
  signIn(){
    if (this._leaving) return;
    this._leaving = true;
    location.href = "api/auth/login?next=" + encodeURIComponent(location.hash || "");
  }
};
