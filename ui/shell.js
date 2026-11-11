/* The chrome around the plan: the door you come in through, and the row at
   the foot of the list that says who you are. */
import { el, esc, icon, ripple, toast, toastDone } from "./dom.js";
import { Store } from "./store.js";
import { sheetShell, showOverlay } from "./sheet.js";

export var BUILD = "2026.11.11 · r1";

/* 이름은 BEMSTATE. 앞은 글자색 그대로, 뒤는 색으로 — index.html의 기다리는
   화면에도 같은 글자가 적혀 있다. */
export function brandMark(){
  return '<h1 class="brand"><span class="brand-a">BEM</span><span class="brand-b">STATE</span></h1>';
}

/* ---------- the door ---------- */
function kakaoMark(){
  return '<svg class="kakao-mark" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 3.6c-4.7 0-8.5 2.96-8.5 6.6 0 2.33 1.56 4.37 3.9 5.54l-.93 3.43a.3.3 0 0 0 .45.33l4.1-2.7c.32.03.65.04.98.04 4.7 0 8.5-2.95 8.5-6.6S16.7 3.6 12 3.6z"/>' +
    '</svg>';
}

export function paintSignIn(view){
  var wrap = el(
    '<div class="signin">' +
      '<div class="signin-art" aria-hidden="true">' +
        '<span class="orb orb-a"></span><span class="orb orb-b"></span><span class="orb orb-c"></span>' +
      '</div>' +
      '<div class="signin-main">' +
        brandMark() +
        '<button class="kakao rip" type="button">' + kakaoMark() + '카카오로 로그인</button>' +
      '</div>' +
    '</div>'
  );
  ripple(wrap.querySelector(".kakao"), function(){
    location.href = "api/auth/login?next=" + encodeURIComponent(location.hash || "");
  });
  view.innerHTML = "";
  view.appendChild(wrap);
  window.scrollTo(0, 0);
}

/* ---------- the foot of the list ---------- */
export function accountFooter(){
  var frag = document.createDocumentFragment();
  /* 보는 건 로그인 없이 된다. 고치려면 로그인해야 하므로, 들어갈 문은
     여기 한 줄로 열어둔다. */
  if (!Store.me && Store.canSignIn){
    var inRow = el('<div class="account-row"></div>');
    var go = el('<button class="linkbtn" type="button">' + kakaoMark() + '카카오로 로그인</button>');
    ripple(go, function(){ Store.signIn(); });
    inRow.appendChild(go);
    frag.appendChild(inRow);
  }
  if (Store.me){
    var row = el('<div class="account-row"></div>');
    if (Store.me.isOwner){
      var who = el('<button class="linkbtn" type="button">' + icon("people") + '멤버</button>');
      ripple(who, openMembers);
      row.appendChild(who);
    }
    var out = el('<button class="linkbtn" type="button">' + icon("logout") +
      esc(Store.me.name || "나") + ' · 로그아웃</button>');
    ripple(out, function(){ location.href = "api/auth/logout"; });
    row.appendChild(out);
    frag.appendChild(row);
  }
  frag.appendChild(el('<p class="build-stamp mono">build ' + BUILD + '</p>'));
  return frag;
}

/* ---------- who may edit ---------- */
function openMembers(){
  var sheet = sheetShell("멤버");
  var body = sheet.querySelector(".sheet-body");
  sheet.querySelector(".sheet-foot").remove();
  body.appendChild(el('<p class="card-empty">불러오는 중…</p>'));

  fetch("api/members", { cache: "no-store" }).then(function(res){ return res.json(); }).then(function(data){
    body.innerHTML = "";
    if (!data || !data.ok || !data.members.length){
      body.appendChild(el('<p class="card-empty">아직 아무도 로그인하지 않았습니다.</p>'));
      return;
    }
    if (data.locked){
      body.appendChild(el('<p class="card-empty">편집 권한은 서버 설정(EDITOR_IDS)에서 정합니다.</p>'));
    }
    data.members.forEach(function(m){
      var row = el('<div class="rowline"><span class="rowbody"><b>' + esc(m.name || m.id) +
        (m.isOwner ? ' <span class="badge tag">주인</span>' : '') +
        (m.you && !m.isOwner ? ' <span class="badge">나</span>' : '') + '</b>' +
        '<small>' + (m.canEdit ? "편집 가능" : "보기만") + '</small></span></div>');
      if (!m.isOwner && !data.locked){
        var tog = el('<button class="check" type="button" aria-pressed="' + m.canEdit +
          '" aria-label="편집 허용">' + icon("check") + '</button>');
        ripple(tog, function(){
          var next = !m.canEdit;
          fetch("api/members", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: m.id, canEdit: next })
          }).then(function(res){ return res.json(); }).then(function(out){
            if (!out || !out.ok){ toast("바꾸지 못했습니다."); return; }
            m.canEdit = next;
            tog.setAttribute("aria-pressed", String(next));
            row.querySelector("small").textContent = next ? "편집 가능" : "보기만";
            toastDone((m.name || "이 사람") + (next ? "님의 편집을 열었습니다." : "님은 보기만 가능합니다."));
          }).catch(function(){ toast("바꾸지 못했습니다."); });
        });
        row.insertBefore(tog, row.firstChild);
      }
      body.appendChild(row);
    });
  }).catch(function(){
    body.innerHTML = "";
    body.appendChild(el('<p class="card-empty">멤버를 불러오지 못했습니다.</p>'));
  });

  showOverlay(sheet);
}
