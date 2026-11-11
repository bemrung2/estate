/* The chrome around the screens: the name, and the line at the foot. */
import { el } from "./dom.js";

export var BUILD = "2026.11.11 · r4";

/* 이름은 BEMESTATE. 앞은 글자색 그대로, 뒤는 색으로 — index.html의 기다리는
   화면에도 같은 글자가 적혀 있다. */
export function brandMark(){
  return '<h1 class="brand"><span class="brand-a">BEM</span><span class="brand-b">ESTATE</span></h1>';
}

export function pageFooter(){
  return el('<p class="build-stamp mono">build ' + BUILD + '</p>');
}
