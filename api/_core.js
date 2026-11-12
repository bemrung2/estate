/*
 * The server side's few shared pieces: the settings, the answer shape, and
 * how to reach the database. No dependencies: the repo stays build-free.
 *
 * Anyone who has the address can look. Changing things takes the owner's
 * 카카오 sign-in (api/_auth.js).
 */

function env() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return { url, key, missing };
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
    update: (table, query, fields) => call(table + "?" + query, {
      method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(fields)
    }),
    remove: (table, query) => call(table + "?" + query, { method: "DELETE", headers: { prefer: "return=minimal" } })
  };
}

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

module.exports = { env, json, setupError, db, readBody };
