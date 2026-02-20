/**
 * Orcest AI SSO Auth callback endpoint
 * Exchanges OAuth code for token and sets session cookie
 */

const SSO_ISSUER = process.env.SSO_ISSUER || "https://login.orcest.ai";
const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID || "lamino";
const SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET;
const SSO_CALLBACK_URL =
  process.env.SSO_CALLBACK_URL || "https://llm.orcest.ai/auth/callback";
const ORCEST_SSO_TOKEN_COOKIE = "orcest_sso_token";

function authEndpoints(app) {
  if (!app) return;

  app.get("/auth/callback", async (request, response) => {
    if (!SSO_CLIENT_SECRET) {
      return response.redirect("/");
    }

    const { code, state } = request.query;
    if (!code) {
      return response.redirect("/");
    }

    try {
      const returnTo = state
        ? JSON.parse(Buffer.from(state, "base64url").toString())?.returnTo || "/"
        : "/";

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
        console.error("[OrcestSSO] Token exchange failed:", await tokenRes.text());
        return response.redirect(`${SSO_ISSUER}?error=token_exchange_failed`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        return response.redirect(`${SSO_ISSUER}?error=no_token`);
      }

      response.cookie(ORCEST_SSO_TOKEN_COOKIE, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });
      return response.redirect(returnTo);
    } catch (e) {
      console.error("[OrcestSSO] Auth callback error:", e);
      return response.redirect(`${SSO_ISSUER}?error=auth_failed`);
    }
  });

  app.get("/auth/logout", (_, response) => {
    response.clearCookie(ORCEST_SSO_TOKEN_COOKIE);
    const ssoLogout = process.env.SSO_ISSUER
      ? `${process.env.SSO_ISSUER}/logout`
      : "https://login.orcest.ai/logout";
    return response.redirect(ssoLogout);
  });
}

module.exports = { authEndpoints };
