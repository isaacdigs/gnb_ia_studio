const crypto = require("node:crypto");
const { issueToken } = require("./auth-token");

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function secureEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { ...headers, Allow: "POST" }, body: JSON.stringify({ authenticated: false }) };
  }

  const configuredPassword = process.env.STUDIO_PASSWORD;
  if (!configuredPassword) {
    return { statusCode: 503, headers, body: JSON.stringify({ authenticated: false, configured: false }) };
  }

  let password = "";
  try {
    password = JSON.parse(event.body || "{}").password || "";
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ authenticated: false }) };
  }

  const authenticated = secureEqual(password, configuredPassword);
  return {
    statusCode: authenticated ? 200 : 401,
    headers,
    body: JSON.stringify(authenticated ? { authenticated, token: issueToken(configuredPassword) } : { authenticated }),
  };
};
