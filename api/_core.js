/*
 * The server side: who is signed in, who may edit, and how to reach the
 * database. Turning the documents the page saves into table rows is
 * api/_tables.js's job, not this file's.
 *
 * No dependencies: the repo stays build-free.
 */

const crypto = require("crypto");

const COOKIE = "bemstate_s";
const SESSION_DAYS = 30;

/*
 * Two doors, not one.
 *
 * LOGIN_REQUIRED — reading. Off by default: anyone with the address can look.
 * EDIT_OPEN      — writing. Off by default: a signed-in editor may change
 *                  things, and nobody else.
 *
 * EDITOR_IDS says who those editors are: a comma-separated list of Kakao ids.
 * When it is set it is the whole truth — those people own the plan and may
 * edit it, everyone else may only look, whatever the members table says. When
 * it is empty the table decides, as before (first person in owns it).
 *
 * The sign-in path — /api/auth/*, the members table, the screen — is always
 * here; these only decide who is stopped where.
 */
function flag(name, fallback) {
  const want = String(process.env[name] || "").toLowerCase();
  if (want === "1" || want === "true" || want === "on") return true;
  if (want === "0" || want === "false" || want === "off") return false;
  return fallback;
}
function loginRequired() { return flag("LOGIN_REQUIRED", false); }
function editOpen() { return flag("EDIT_OPEN", false); }

function editorIds() {
  return String(process.env.EDITOR_IDS || "")
    .split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
}
function isEditor(row) {
  if (!row) return false;
  const ids = editorIds();
  if (ids.length) return ids.indexOf(String(row.kakao_id)) >= 0;
  return !!row.can_edit;
}
function isOwner(row) {
  if (!row) return false;
  const ids = editorIds();
  if (ids.length) return ids.indexOf(String(row.kakao_id)) >= 0;
  return !!row.is_owner;
}
/* 명단이 있으면 멤버 화면의 스위치는 아무 일도 하지 않는다 — 그걸 화면에 알린다. */
function membersLocked() { return editorIds().length > 0; }

/* ---------------- environment ---------------- */

function env() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.KAKAO_REST_API_KEY) missing.push("KAKAO_REST_API_KEY");
  if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
  return {
    url, key,
    kakaoKey: process.env.KAKAO_REST_API_KEY || "",
    kakaoSecret: process.env.KAKAO_CLIENT_SECRET || "",
    secret: process.env.SESSION_SECRET || "",
    missing
  };
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function setupError(res, missing) {
  return json(res, 200, {
    ok: false,
    error: "setup",
    message: "환경변수가 아직 없습니다: " + missing.join(", ") + ". Vercel 프로젝트 설정에 넣고 다시 배포해주세요."
  });
}

/* ---------------- signed values ---------------- */

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + mac;
}

function unsign(token, secret) {
  if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const cut = token.lastIndexOf(".");
  const body = token.slice(0, cut);
  const mac = token.slice(cut + 1);
  const want = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const got = Buffer.from(mac);
  const expected = Buffer.from(want);
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  return payload;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const bit = part.trim();
    if (bit.startsWith(name + "=")) return decodeURIComponent(bit.slice(name.length + 1));
  }
  return null;
}

function setSession(res, payload, secret) {
  const token = sign(payload, secret);
  res.setHeader("set-cookie",
    COOKIE + "=" + encodeURIComponent(token) +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + SESSION_DAYS * 24 * 3600);
}

function clearSession(res) {
  res.setHeader("set-cookie", COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

function session(req, secret) {
  return unsign(readCookie(req, COOKIE), secret);
}

/* ---------------- the database ---------------- */

function db(cfg) {
  const headers = {
    apikey: cfg.key,
    authorization: "Bearer " + cfg.key,
    "content-type": "application/json"
  };

  async function call(path, init) {
    const res = await fetch(cfg.url + "/rest/v1/" + path, {
      ...init,
      headers: { ...headers, ...((init && init.headers) || {}) }
    });
    const text = await res.text();
    if (!res.ok) throw new Error("db " + res.status + " " + path + " " + text.slice(0, 300));
    return text ? JSON.parse(text) : null;
  }

  return {
    select: (table, query) => call(table + "?" + (query || "select=*"), { method: "GET" }),
    upsert: (table, rows) => rows.length
      ? call(table, {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows)
        })
      : Promise.resolve(null),
    remove: (table, query) => call(table + "?" + query, { method: "DELETE", headers: { prefer: "return=minimal" } }),
    async rev() {
      const rows = await call("meta?key=eq.rev&select=body", { method: "GET" });
      return (rows && rows.length && Number(rows[0].body.n)) || 0;
    },
    async bumpRev() {
      const next = (await this.rev()) + 1;
      await this.upsert("meta", [{ key: "rev", body: { n: next } }]);
      return next;
    }
  };
}

/* ---------------- members ---------------- */

/* With EDITOR_IDS set, signing in writes down what that list says. Without it,
   the first person to sign in owns the plan and the rest start as lookers. */
async function touchMember(store, profile) {
  const named = editorIds().indexOf(String(profile.id)) >= 0;
  const listed = editorIds().length > 0;
  const existing = await store.select("members", "select=*&kakao_id=eq." + encodeURIComponent(profile.id));
  if (existing && existing.length) {
    const row = existing[0];
    const next = {
      kakao_id: row.kakao_id,
      name: profile.name || row.name,
      avatar: profile.avatar || row.avatar,
      can_edit: listed ? named : row.can_edit,
      is_owner: listed ? named : row.is_owner,
      joined_at: row.joined_at,
      seen_at: new Date().toISOString()
    };
    await store.upsert("members", [next]);
    return next;
  }
  const all = await store.select("members", "select=kakao_id&limit=1");
  const first = !all || !all.length;
  const row = {
    kakao_id: profile.id,
    name: profile.name || "",
    avatar: profile.avatar || "",
    can_edit: listed ? named : first,
    is_owner: listed ? named : first,
    seen_at: new Date().toISOString()
  };
  await store.upsert("members", [row]);
  return row;
}

async function member(store, kakaoId) {
  const rows = await store.select("members", "select=*&kakao_id=eq." + encodeURIComponent(kakaoId));
  return rows && rows.length ? rows[0] : null;
}


/* ---------------- requests ---------------- */
async function readBody(req, limit) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > (limit || 1 << 20)) throw new Error("too big");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function origin(req) {
  /* Behind Vercel the proxy says; locally the socket does. Guessing https for
     a plain connection would send Kakao to a callback that cannot answer. */
  const proto = req.headers["x-forwarded-proto"] ||
    (req.socket && req.socket.encrypted ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return proto + "://" + host;
}

module.exports = {
  COOKIE,
  env, json, setupError, loginRequired, editOpen, editorIds, isEditor, isOwner, membersLocked,
  sign, unsign, readCookie, setSession, clearSession, session,
  db, touchMember, member, readBody, origin
};
