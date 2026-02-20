/**
 * Orcest AI SSO Global Middleware
 * Enforces SSO login via login.orcest.ai before allowing access to Lamino.
 * Enable with: ORCEST_SSO_ENABLED=true, SSO_ISSUER, SSO_CLIENT_ID, SSO_CLIENT_SECRET
 *
 * Delegates token verification to the canonical SSO middleware in
 * server/utils/middleware/orcestSSO.js for consistent cookie handling
 * and token caching.
 */

const {
  requireOrcestSSO,
  getAuthRedirectUrl,
  ORCEST_SSO_TOKEN_COOKIE,
  SSO_ISSUER,
} = require("../utils/middleware/orcestSSO");

const SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET;
const ORCEST_SSO_ENABLED = process.env.ORCEST_SSO_ENABLED === "true";

// Paths that bypass SSO check (auth flow and health endpoints)
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

const SSO_BYPASS_PREFIXES = ["/api/health", "/api/onboarding"];

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

/**
 * Global SSO middleware applied to all routes.
 * Bypasses SSO for static assets, health checks, and the auth callback/logout routes.
 * For all other routes, delegates to requireOrcestSSO for token verification.
 */
module.exports = function orcestSSOMiddleware(req, res, next) {
  if (!ORCEST_SSO_ENABLED || !SSO_CLIENT_SECRET) {
    return next();
  }

  const path = req.path || req.url?.split("?")[0] || "/";
  if (shouldBypassSSO(path) || isStaticAsset(path)) {
    return next();
  }

  // Delegate to the canonical requireOrcestSSO middleware
  // which handles cookie/header extraction, cached verification,
  // and proper 401/redirect responses.
  return requireOrcestSSO(req, res, next);
};

module.exports.getAuthRedirectUrl = getAuthRedirectUrl;
module.exports.ORCEST_SSO_ENABLED = ORCEST_SSO_ENABLED;
module.exports.ORCEST_SSO_TOKEN_COOKIE = ORCEST_SSO_TOKEN_COOKIE;
