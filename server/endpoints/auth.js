/**
 * Orcest AI SSO Auth endpoints
 * Handles OAuth2 callback, logout, and user info via the canonical SSO middleware.
 */

const {
  ssoAuthCallback,
  ssoLogout,
  requireOrcestSSO,
  ORCEST_SSO_TOKEN_COOKIE,
} = require("../utils/middleware/orcestSSO");

/**
 * Auth endpoints mounted directly on the Express app (not behind /api prefix).
 * These handle the OAuth2 flow which must be accessible without prior auth.
 * @param {import("express").Express} app
 */
function authEndpoints(app) {
  if (!app) return;

  // OAuth2 authorization code callback
  app.get("/auth/callback", ssoAuthCallback);

  // SSO logout - clears cookie and redirects to SSO provider logout
  app.get("/auth/logout", ssoLogout);
}

/**
 * Auth API endpoints mounted on the API router (behind /api prefix).
 * These require a valid SSO session.
 * @param {import("express").Router} router
 */
function authApiEndpoints(router) {
  if (!router) return;

  // Return the current SSO user info
  router.get("/auth/me", (req, res) => {
    // The global orcestSSOMiddleware runs before this route,
    // so req.orcestSSOUser / res.locals.ssoUser should be populated.
    const user = res.locals.ssoUser || req.orcestSSOUser;
    if (!user) return res.status(401).json({ user: null });
    res.json({
      user: {
        email: user.email || user.sub,
        name: user.name || user.email || user.sub || "User",
        sub: user.sub,
        role: user.role || "default",
      },
    });
  });
}

module.exports = { authEndpoints, authApiEndpoints };
