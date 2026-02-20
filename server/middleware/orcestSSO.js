/**
 * Orcest AI SSO Middleware
 * Enforces SSO login via login.orcest.ai before allowing access to Lamino.
 * Enable with: ORCEST_SSO_ENABLED=true, SSO_ISSUER, SSO_CLIENT_ID, SSO_CLIENT_SECRET
 */

const SSO_ISSUER = process.env.SSO_ISSUER || "https://login.orcest.ai";
const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID || "lamino";
const SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET;
const SSO_CALLBACK_URL =
  process.env.SSO_CALLBACK_URL || "https://llm.orcest.ai/auth/callback";
const ORCEST_SSO_ENABLED = process.env.ORCEST_SSO_ENABLED === "true";
const ORCEST_SSO_TOKEN_COOKIE = "orcest_sso_token";

// Paths that bypass SSO check
const SSO_BYPASS_PATHS = [
  "/auth/callback",
  "/auth/logout",
  "/api/health",
  "/api/system/check",
  "/api/ping",
  "/api/onboarding",
  "/api/setup-complete",
  "/robots.txt",
  "/manifest.json",
  "/favicon.png",
];

const SSO_BYPASS_PREFIXES = ["/api/health", "/api/onboarding", "/api/system/"];

function shouldBypassSSO(path) {
  if (!ORCEST_SSO_ENABLED || !SSO_CLIENT_SECRET) return true;
  if (SSO_BYPASS_PATHS.some((p) => path === p || path.startsWith(p + "?")))
    return true;
  return SSO_BYPASS_PREFIXES.some((p) => path.startsWith(p));
}

function isStaticAsset(path) {
  return (
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".svg") ||
    path.endsWith(".ico") ||
    path.endsWith(".woff2") ||
    path.endsWith(".woff")
  );
}

async function verifyToken(token) {
  try {
    const res = await fetch(`${SSO_ISSUER}/api/token/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.valid ? data : null;
  } catch (e) {
    console.error("[OrcestSSO] Token verify error:", e.message);
    return null;
  }
}

function getAuthRedirectUrl(returnTo = "/") {
  const params = new URLSearchParams({
    client_id: SSO_CLIENT_ID,
    redirect_uri: SSO_CALLBACK_URL,
    response_type: "code",
    scope: "openid profile email",
    state: Buffer.from(JSON.stringify({ returnTo })).toString("base64url"),
  });
  return `${SSO_ISSUER}/oauth2/authorize?${params.toString()}`;
}

module.exports = function orcestSSOMiddleware(req, res, next) {
  if (!ORCEST_SSO_ENABLED || !SSO_CLIENT_SECRET) {
    return next();
  }

  const path = req.path || req.url?.split("?")[0] || "/";
  if (shouldBypassSSO(path) || isStaticAsset(path)) {
    return next();
  }

  const token =
    (req.cookies && req.cookies[ORCEST_SSO_TOKEN_COOKIE]) ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    req.query?.token;

  if (!token) {
    const redirectUrl = getAuthRedirectUrl(path);
    if (req.xhr || req.headers["accept"]?.includes("application/json")) {
      return res.status(401).json({
        error: "auth_required",
        redirect_url: redirectUrl,
        message: "SSO authentication required",
      });
    }
    return res.redirect(redirectUrl);
  }

  verifyToken(token)
    .then((user) => {
      if (user) {
        req.orcestSSOUser = user;
        return next();
      }
      const redirectUrl = getAuthRedirectUrl(path);
      if (req.xhr || req.headers["accept"]?.includes("application/json")) {
        return res.status(401).json({
          error: "auth_required",
          redirect_url: redirectUrl,
        });
      }
      res.redirect(redirectUrl);
    })
    .catch((err) => {
      console.error("[OrcestSSO] Error:", err);
      next();
    });
};

module.exports.getAuthRedirectUrl = getAuthRedirectUrl;
module.exports.ORCEST_SSO_ENABLED = ORCEST_SSO_ENABLED;
module.exports.ORCEST_SSO_TOKEN_COOKIE = ORCEST_SSO_TOKEN_COOKIE;
