const $ = (id) => document.getElementById(id);
const DEFAULTS = { site: "", at: "09:40", last: null, log: [] };

function say(text) { $("said").textContent = text; }

async function paint() {
  const s = await chrome.storage.local.get(DEFAULTS);
  if (document.activeElement !== $("site")) $("site").value = s.site;
  $("at").value = s.at;
  $("log").innerHTML = "";
  s.log.forEach((l) => {
    const li = document.createElement("li");
    li.className = l.ok ? "ok" : "bad";
    li.textContent = l.text;
    $("log").appendChild(li);
  });
  $("when").textContent = s.last ? "마지막으로 가져온 때 · " + new Date(s.last.at).toLocaleString("ko-KR") : "아직 가져온 적이 없습니다.";
}

/* 적은 주소를 "https://host" 꼴로. 아니면 "" */
function origin(text) {
  try {
    const u = new URL(/^https?:\/\//.test(text.trim()) ? text.trim() : "https://" + text.trim());
    return u.origin;
  } catch (e) { return ""; }
}

async function save() {
  const site = origin($("site").value);
  if (!site) { say("BEMESTATE 주소를 확인해 주세요."); return false; }
  await chrome.storage.local.set({ site, at: $("at").value || DEFAULTS.at });
  await chrome.runtime.sendMessage("schedule");
  $("site").value = site;
  say("저장했습니다. 날마다 " + ($("at").value || DEFAULTS.at) + "에 가져옵니다.");
  return true;
}

$("save").addEventListener("click", save);
$("now").addEventListener("click", async () => {
  if (!(await save())) return;
  $("now").disabled = true;
  say("가져오는 중… 단지마다 작은 창이 잠깐 열렸다 닫힙니다.");
  await chrome.runtime.sendMessage("collect");
  $("now").disabled = false;
  say("끝났습니다.");
  paint();
});
chrome.storage.onChanged.addListener(paint);
paint();
