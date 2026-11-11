import { el, icon, ripple } from "./dom.js";

export var Theme = {
  get(){
    try{ return localStorage.getItem("estate.theme") || ""; }
    catch(e){ return ""; }
  },
  systemDark(){ return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; },
  isDark(){ var t = this.get(); return t ? t === "dark" : this.systemDark(); },
  apply(){ var t = this.get(); if (t) document.documentElement.setAttribute("data-theme", t); },
  toggle(){
    var next = this.isDark() ? "light" : "dark";
    try{ localStorage.setItem("estate.theme", next); }catch(e){ /* private mode */ }
    document.documentElement.setAttribute("data-theme", next);
    return next;
  }
};

export function themeButton(onChange){
  var dark = Theme.isDark();
  var b = el('<button class="icon-btn" type="button" aria-label="' +
    (dark ? "밝은 화면으로" : "어두운 화면으로") + '">' + icon(dark ? "sun" : "moon") + '</button>');
  ripple(b, function(){
    Theme.toggle();
    if (onChange) onChange();
  });
  return b;
}
