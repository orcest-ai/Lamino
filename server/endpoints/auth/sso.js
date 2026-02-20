const { Router } = require("express");
const {
  ssoAuthCallback,
  ssoLogout,
  requireOrcestSSO,
  getAuthRedirectUrl,
  ORCEST_SSO_TOKEN_COOKIE,
  SSO_ISSUER,
  SSO_CLIENT_ID,
} = require("../../utils/middleware/orcestSSO");

/**
 * SSO auth endpoints for Lamino.
 * Provides OAuth2 callback, logout, user info, and SSO status endpoints.
 *
 * Routes:
 *   GET /auth/callback   - OAuth2 authorization code callback
 *   GET /auth/logout      - Clear SSO session and redirect to SSO logout
 *   GET /api/sso/me       - Return current SSO user info (requires valid SSO token)
 *   GET /api/sso/status   - Return SSO configuration status (public)
 *   GET /api/sso/login    - Redirect to SSO login page
 *
 * @param {import("express").Router} router - The API router (mounted at /api)
 */
function ssoAuthEndpoints(router) {
  if (!router) return;

  // OAuth2 authorization code callback
  // Note: This is also mounted on the main app in authEndpoints (endpoints/auth.js)
  // for backward compatibility. This registration ensures it works via the API router too.
  router.get("/auth/callback", ssoAuthCallback);

  // SSO logout
  router.get("/auth/logout", ssoLogout);

  // Return current SSO user info (protected by requireOrcestSSO)
  router.get("/sso/me", requireOrcestSSO, (req, res) => {
    const user = res.locals.ssoUser;
    if (!user) {
      return res.status(401).json({ user: null });
    }
    res.json({
      user: {
        sub: user.sub,
        name: user.name,
        role: user.role,
        email: user.email,
      },
    });
  });

  // SSO status endpoint (public - for frontend to know if SSO is configured)
  router.get("/sso/status", (_req, res) => {
    const enabled =
      process.env.ORCEST_SSO_ENABLED === "true" &&
      !!process.env.SSO_CLIENT_SECRET;

    res.json({
      ssoEnabled: enabled,
      issuer: enabled ? SSO_ISSUER : null,
      clientId: enabled ? SSO_CLIENT_ID : null,
      loginUrl: enabled ? getAuthRedirectUrl("/") : null,
    });
  });

  // Redirect to SSO login (convenience endpoint)
  router.get("/sso/login", (req, res) => {
    const returnTo = req.query.returnTo || "/";
    const redirectUrl = getAuthRedirectUrl(returnTo);
    return res.redirect(redirectUrl);
  });
}

module.exports = { ssoAuthEndpoints };
