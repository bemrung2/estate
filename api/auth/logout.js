const lib = require("../_core.js");

module.exports = async function handler(req, res) {
  lib.clearSession(res);
  if ((req.headers.accept || "").indexOf("application/json") >= 0) {
    return lib.json(res, 200, { ok: true });
  }
  res.statusCode = 302;
  res.setHeader("location", "/");
  res.end();
};
