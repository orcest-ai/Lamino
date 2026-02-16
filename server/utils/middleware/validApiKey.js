const { ApiKey } = require("../../models/apiKeys");
const { SystemSettings } = require("../../models/systemSettings");

function requiredScopeForRequest(request = null) {
  const method = String(request?.method || "GET").toUpperCase();
  const path = String(request?.path || "").toLowerCase();

  if (path.startsWith("/v1/admin")) return method === "GET" ? "admin:read" : "admin:write";
  if (path.startsWith("/v1/system")) return "system:read";
  if (path.startsWith("/v1/users")) return method === "GET" ? "users:read" : "users:write";
  if (path.startsWith("/v1/workspace") || path.startsWith("/v1/workspaces")) {
    if (path.includes("/chat") || path.includes("/stream-chat")) return "workspace:chat";
    return method === "GET" ? "workspace:read" : "workspace:write";
  }
  if (path.startsWith("/v1/workspace-thread"))
    return path.includes("/stream-chat") ? "workspace:chat" : "workspace:write";
  if (path.startsWith("/v1/document") || path.startsWith("/v1/documents"))
    return method === "GET" ? "documents:read" : "documents:write";
  if (path.startsWith("/v1/embed")) return method === "GET" ? "embed:read" : "embed:write";
  if (path.startsWith("/v1/openai")) return "workspace:chat";
  if (path.startsWith("/v1/auth")) return "auth:read";
  return null;
}

async function validApiKey(request, response, next) {
  const multiUserMode = await SystemSettings.isMultiUserMode();
  response.locals.multiUserMode = multiUserMode;

  const auth = request.header("Authorization");
  const bearerKey = auth ? auth.split(" ")[1] : null;
  if (!bearerKey) {
    response.status(403).json({
      error: "No valid api key found.",
    });
    return;
  }

  const apiKey = await ApiKey.get({ secret: bearerKey });
  if (!apiKey) {
    response.status(403).json({
      error: "No valid api key found.",
    });
    return;
  }

  if (!ApiKey.isUsable(apiKey)) {
    response.status(403).json({
      error: ApiKey.isRevoked(apiKey)
        ? "API key has been revoked."
        : "API key has expired.",
    });
    return;
  }

  const requiredScope = requiredScopeForRequest(request);
  if (requiredScope && !ApiKey.hasScope(apiKey, requiredScope)) {
    response.status(403).json({
      error: `API key is missing required scope: ${requiredScope}.`,
    });
    return;
  }

  response.locals.apiKey = {
    ...apiKey,
    scopes: ApiKey.parseScopes(apiKey),
    requiredScope,
  };

  next();
}

module.exports = {
  validApiKey,
  requiredScopeForRequest,
};
