const test = require("node:test");
const assert = require("node:assert/strict");

const { issueToken, verifyToken } = require("../netlify/functions/auth-token");

test("issues a signed token that expires after its configured lifetime", () => {
  const secret = "shared-test-secret";
  const token = issueToken(secret, { now: 1_000, ttlMs: 500 });

  assert.equal(verifyToken(token, secret, { now: 1_499 }), true);
  assert.equal(verifyToken(token, secret, { now: 1_500 }), false);
  assert.equal(verifyToken(token, "wrong-secret", { now: 1_100 }), false);
});
