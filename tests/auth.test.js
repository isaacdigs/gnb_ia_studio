const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyToken } = require("../netlify/functions/auth-token");
const { handler } = require("../netlify/functions/auth");

test("successful password authentication returns a signed session token", async () => {
  const previous = process.env.STUDIO_PASSWORD;
  process.env.STUDIO_PASSWORD = "shared-test-password";
  try {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ password: "shared-test-password" }),
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.authenticated, true);
    assert.equal(verifyToken(body.token, "shared-test-password"), true);
  } finally {
    if (previous === undefined) delete process.env.STUDIO_PASSWORD;
    else process.env.STUDIO_PASSWORD = previous;
  }
});
