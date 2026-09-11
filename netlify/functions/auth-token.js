const crypto = require("node:crypto");

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function issueToken(secret, { now = Date.now(), ttlMs = 8 * 60 * 60 * 1000 } = {}) {
  const payload = encode(JSON.stringify({ exp: now + ttlMs }));
  return `${payload}.${sign(payload, secret)}`;
}

function verifyToken(token, secret, { now = Date.now() } = {}) {
  if (!token || !secret) return false;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload, secret);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  try {
    return Number(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp) > now;
  } catch {
    return false;
  }
}

module.exports = { issueToken, verifyToken };
