/**
 * OAuth2/OIDC SSO middleware for Lamino.
 * Enforces authentication via login.orcest.ai.
 * Verifies JWT tokens and provides per-user personalization.
 */

const SSO_ISSUER = process.env.SSO_ISSUER || "https://login.orcest.ai";
const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID || "lamino";
const SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET;
const SSO_CALLBACK_URL =
  process.env.SSO_CALLBACK_URL || "https://llm.orcest.ai/auth/callback";
const ORCEST_SSO_TOKEN_COOKIE = "lamino_sso_token";

// Token verification cache: Map<token, { user, expiresAt }>
const TOKEN_CACHE = new Map();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Evict expired entries from the token cache.
 * Called periodically to prevent unbounded growth.
 */
function evictExpiredTokens() {
  const now = Date.now();
  for (const [key, entry] of TOKEN_CACHE) {
    if (entry.expiresAt <= now) {
      TOKEN_CACHE.delete(key);
    }
  }
}

// Run eviction every 60 seconds
setInterval(evictExpiredTokens, 60 * 1000).unref();

/**
 * Verify a token against the SSO issuer's verification endpoint.
 * Results are cached for 5 minutes to reduce latency.
 * @param {string} token - The access token to verify
 * @returns {Promise<{sub: string, name: string, role: string, email: string}|null>}
 */
async function verifyTokenWithCache(token) {
  const now = Date.now();

  // Check cache first
  const cached = TOKEN_CACHE.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  // Verify with SSO issuer
  try {
    const res = await fetch(`${SSO_ISSUER}/api/token/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      TOKEN_CACHE.delete(token);
      return null;
    }

    const data = await res.json();
    if (!data.valid) {
      TOKEN_CACHE.delete(token);
      return null;
    }

    const user = {
      sub: data.sub || data.user_id || data.id,
      name: data.name || data.preferred_username || data.email || "User",
      role: data.role || data.realm_access?.roles?.[0] || "default",
      email: data.email || data.sub,
    };

    // Cache the verified token
    TOKEN_CACHE.set(token, {
      user,
      expiresAt: now + TOKEN_CACHE_TTL_MS,
    });

    return user;
  } catch (e) {
    console.error("[OrcestSSO] Token verify error:", e.message);
    return null;
  }
}

/**
 * Build the OAuth2 authorization redirect URL.
 * @param {string} returnTo - The path to return to after login
 * @returns {string}
 */
function getAuthRedirectUrl(returnTo = "/") {
  const state = Buffer.from(JSON.stringify({ returnTo })).toString("base64url");
  const params = new URLSearchParams({
    client_id: SSO_CLIENT_ID,
    redirect_uri: SSO_CALLBACK_URL,
    response_type: "code",
    scope: "openid profile email",
    state,
  });
  return `${SSO_ISSUER}/oauth2/authorize?${params.toString()}`;
}

/**
 * Middleware: Verify SSO token from cookie or Authorization header.
 * On success, sets res.locals.ssoUser = { sub, name, role, email }.
 * On failure, redirects to SSO login (browser) or returns 401 JSON (API).
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function requireOrcestSSO(req, res, next) {
  // Extract token: cookie first, then Authorization header
  const token =
    (req.cookies && req.cookies[ORCEST_SSO_TOKEN_COOKIE]) ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return _handleUnauthenticated(req, res);
  }

  const user = await verifyTokenWithCache(token);
  if (!user) {
    return _handleUnauthenticated(req, res);
  }

  // Set user info for downstream handlers
  res.locals.ssoUser = user;
  req.orcestSSOUser = user; // Also set on req for backward compat
  next();
}

/**
 * Handle unauthenticated requests: redirect browsers, return 401 for APIs.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
function _handleUnauthenticated(req, res) {
  const path = req.originalUrl || req.url || "/";
  const redirectUrl = getAuthRedirectUrl(path);

  const isApiRequest =
    req.xhr ||
    req.headers["accept"]?.includes("application/json") ||
    req.path?.startsWith("/api/");

  if (isApiRequest) {
    return res.status(401).json({
      error: "auth_required",
      redirect_url: redirectUrl,
      message: "SSO authentication required. Please log in via Orcest SSO.",
    });
  }

  return res.redirect(redirectUrl);
}

/**
 * OAuth2 callback handler.
 * Exchanges the authorization code for an access token,
 * sets an httponly cookie, and redirects to the original page.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function ssoAuthCallback(req, res) {
  if (!SSO_CLIENT_SECRET) {
    console.error("[OrcestSSO] SSO_CLIENT_SECRET is not set. Cannot exchange code.");
    return res.redirect("/");
  }

  const { code, state } = req.query;
  if (!code) {
    return res.redirect("/");
  }

  try {
    // Decode returnTo from state parameter
    let returnTo = "/";
    if (state) {
      try {
        const decoded = JSON.parse(
          Buffer.from(state, "base64url").toString()
        );
        returnTo = decoded.returnTo || "/";
      } catch (_) {
        // Ignore state parse errors
      }
    }

    // Exchange authorization code for access token
    const tokenRes = await fetch(`${SSO_ISSUER}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: SSO_CALLBACK_URL,
        client_id: SSO_CLIENT_ID,
        client_secret: SSO_CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[OrcestSSO] Token exchange failed:", errText);
      return res.redirect(`${SSO_ISSUER}?error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("[OrcestSSO] No access_token in token response");
      return res.redirect(`${SSO_ISSUER}?error=no_token`);
    }

    // Set httponly cookie with the SSO token
    res.cookie(ORCEST_SSO_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
    });

    return res.redirect(returnTo);
  } catch (e) {
    console.error("[OrcestSSO] Auth callback error:", e);
    return res.redirect(`${SSO_ISSUER}?error=auth_failed`);
  }
}

/**
 * Logout handler.
 * Clears the SSO cookie and redirects to the SSO provider's logout endpoint.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
function ssoLogout(req, res) {
  // Invalidate any cached token
  const token = req.cookies && req.cookies[ORCEST_SSO_TOKEN_COOKIE];
  if (token) {
    TOKEN_CACHE.delete(token);
  }

  res.clearCookie(ORCEST_SSO_TOKEN_COOKIE, { path: "/" });

  const logoutUrl = `${SSO_ISSUER}/logout`;
  return res.redirect(logoutUrl);
}

module.exports = {
  requireOrcestSSO,
  ssoAuthCallback,
  ssoLogout,
  getAuthRedirectUrl,
  ORCEST_SSO_TOKEN_COOKIE,
  SSO_ISSUER,
  SSO_CLIENT_ID,
};
