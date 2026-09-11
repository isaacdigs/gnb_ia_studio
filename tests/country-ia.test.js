const test = require("node:test");
const assert = require("node:assert/strict");

const { createCountryIaHandler } = require("../netlify/functions/country-ia");

function event(method, { country = "Bangladesh", body, token = "valid-token" } = {}) {
  return {
    httpMethod: method,
    queryStringParameters: { country },
    headers: { authorization: `Bearer ${token}` },
    body: body === undefined ? null : JSON.stringify(body),
  };
}

test("returns the shared saved IA for an authenticated country request", async () => {
  const records = new Map([["countries/Bangladesh", { tree: [{ id: "about", label: "About LG Business", children: [] }], savedAt: "2026-09-11T00:00:00.000Z" }]]);
  const handler = createCountryIaHandler({
    getStore: () => ({ get: async (key) => records.get(key) || null }),
    connectLambda: () => {},
    verifyToken: () => true,
    getSecret: () => "shared-test-secret",
  });

  const response = await handler(event("GET"));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    country: "Bangladesh",
    record: records.get("countries/Bangladesh"),
  });
});

test("persists a shared IA with a server-issued saved timestamp", async () => {
  const records = new Map();
  const handler = createCountryIaHandler({
    getStore: () => ({
      get: async (key) => records.get(key) || null,
      setJSON: async (key, value) => records.set(key, value),
    }),
    connectLambda: () => {},
    verifyToken: () => true,
    getSecret: () => "shared-test-secret",
    now: () => "2026-09-11T12:00:00.000Z",
  });
  const tree = [{ id: "about", label: "About LG Business", enabled: true, children: [] }];

  const response = await handler(event("PUT", { body: { tree } }));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    country: "Bangladesh",
    record: { tree, savedAt: "2026-09-11T12:00:00.000Z" },
  });
  assert.deepEqual(records.get("countries/Bangladesh"), { tree, savedAt: "2026-09-11T12:00:00.000Z" });
});

test("rejects missing or invalid access tokens before reading shared IA", async () => {
  const handler = createCountryIaHandler({
    getStore: () => { throw new Error("store must not be accessed"); },
    verifyToken: () => false,
    getSecret: () => "shared-test-secret",
  });

  const response = await handler(event("GET", { token: "expired" }));

  assert.equal(response.statusCode, 401);
});

test("connects the Lambda event to Netlify Blobs before opening the country store", async () => {
  const calls = [];
  const handler = createCountryIaHandler({
    connectLambda: () => calls.push("connect"),
    getStore: () => {
      calls.push("store");
      return { get: async () => null };
    },
    verifyToken: () => true,
    getSecret: () => "shared-test-secret",
  });

  const response = await handler(event("GET"));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, ["connect", "store"]);
});
