const { verifyToken } = require("./auth-token");

const COUNTRIES = new Set([
  "Bangladesh", "New Zealand", "Srilanka", "Nepal", "Ukraine", "Uzbekistan_RU",
  "Uzbekistan", "Bulgaria", "Serbia", "Latvia", "Croatia", "Slovakia", "Denmark",
  "Finland", "Norway", "Lithuania", "Estonia", "Iran (RTL)",
]);
const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function response(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) };
}

function bearerToken(headers = {}) {
  const value = headers.authorization || headers.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function validTree(tree) {
  return Array.isArray(tree) && tree.every((node) => node && typeof node.id === "string" && typeof node.label === "string" && Array.isArray(node.children));
}

function createCountryIaHandler({ getStore, connectLambda, verifyToken: verify = verifyToken, getSecret = () => process.env.STUDIO_PASSWORD, now = () => new Date().toISOString() } = {}) {
  const blobs = !getStore || !connectLambda ? require("@netlify/blobs") : null;
  const resolveStore = getStore || blobs.getStore;
  const resolveLambdaConnection = connectLambda || blobs.connectLambda;

  return async (event) => {
    if (!["GET", "PUT"].includes(event.httpMethod)) return response(405, { error: "Method not allowed" }, { Allow: "GET, PUT" });

    const secret = getSecret();
    if (!secret || !verify(bearerToken(event.headers), secret)) return response(401, { error: "Unauthorized" });

    const country = event.queryStringParameters?.country;
    if (!COUNTRIES.has(country)) return response(400, { error: "Unknown country" });

    resolveLambdaConnection(event);
    const store = resolveStore("gnb-country-ia");
    const key = `countries/${country}`;
    if (event.httpMethod === "GET") return response(200, { country, record: await store.get(key, { type: "json" }) });

    if ((event.body || "").length > 1_000_000) return response(413, { error: "IA is too large" });
    try {
      const { tree } = JSON.parse(event.body || "{}");
      if (!validTree(tree)) return response(400, { error: "Invalid IA tree" });
      const record = { tree, savedAt: now() };
      await store.setJSON(key, record);
      return response(200, { country, record });
    } catch {
      return response(400, { error: "Invalid request body" });
    }
  };
}

exports.createCountryIaHandler = createCountryIaHandler;
exports.handler = createCountryIaHandler();
