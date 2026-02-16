const prisma = require("../utils/prisma");

const ApiKey = {
  tablename: "api_keys",
  writable: ["name", "scopes", "expiresAt", "revokedAt"],
  defaultScope: "*",

  makeSecret: () => {
    const uuidAPIKey = require("uuid-apikey");
    return uuidAPIKey.create().apiKey;
  },

  normalizeScopes: function (scopes = []) {
    if (typeof scopes === "string")
      return [
        ...new Set(
          scopes
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean)
        ),
      ];
    if (!Array.isArray(scopes)) return [this.defaultScope];
    const normalized = scopes.map((scope) => String(scope).trim()).filter(Boolean);
    return normalized.length > 0 ? [...new Set(normalized)] : [this.defaultScope];
  },

  parseScopes: function (apiKey = {}) {
    const parsed = this.normalizeScopes(apiKey?.scopes || this.defaultScope);
    return parsed;
  },

  hasScope: function (apiKey = {}, expectedScope = null) {
    if (!expectedScope) return true;
    const scopes = this.parseScopes(apiKey);
    return scopes.includes(expectedScope) || scopes.includes("*");
  },

  isRevoked: function (apiKey = {}) {
    return !!apiKey?.revokedAt;
  },

  isExpired: function (apiKey = {}) {
    if (!apiKey?.expiresAt) return false;
    const expiresAtMs = new Date(apiKey.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) return true;
    return expiresAtMs <= Date.now();
  },

  isUsable: function (apiKey = {}) {
    return !this.isRevoked(apiKey) && !this.isExpired(apiKey);
  },

  parseNullableDate: function (field = "date", value = null) {
    if (value === null || value === undefined || value === "")
      return { date: null, error: null };
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()))
      return {
        date: null,
        error: `Invalid ${field} datetime.`,
      };
    return { date: parsed, error: null };
  },

  create: async function (payload = {}) {
    const normalizedPayload =
      payload && typeof payload === "object"
        ? payload
        : { createdBy: Number(payload) };
    const createdBy = normalizedPayload?.createdBy || null;
    const name = normalizedPayload?.name || null;
    const scopes = normalizedPayload?.scopes || [this.defaultScope];
    const expiresAt = normalizedPayload?.expiresAt || null;
    const parsedExpiry = this.parseNullableDate("expiresAt", expiresAt);
    if (parsedExpiry.error) return { apiKey: null, error: parsedExpiry.error };
    try {
      const apiKey = await prisma.api_keys.create({
        data: {
          secret: this.makeSecret(),
          createdBy,
          name: name ? String(name).slice(0, 255) : null,
          scopes: this.normalizeScopes(scopes).join(","),
          expiresAt: parsedExpiry.date,
        },
      });

      return { apiKey, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE API KEY.", error.message);
      return { apiKey: null, error: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const apiKey = await prisma.api_keys.findFirst({ where: clause });
      return apiKey;
    } catch (error) {
      console.error("FAILED TO GET API KEY.", error.message);
      return null;
    }
  },

  update: async function (id = null, data = {}) {
    if (!id) return { apiKey: null, error: "No key id provided for update." };
    const updates = {};
    for (const [key, value] of Object.entries(data)) {
      if (!this.writable.includes(key)) continue;
      switch (key) {
        case "name":
          updates.name = value ? String(value).slice(0, 255) : null;
          break;
        case "scopes":
          updates.scopes = this.normalizeScopes(value).join(",");
          break;
        case "expiresAt":
          const parsedExpiry = this.parseNullableDate("expiresAt", value);
          if (parsedExpiry.error) return { apiKey: null, error: parsedExpiry.error };
          updates.expiresAt = parsedExpiry.date;
          break;
        case "revokedAt":
          const parsedRevoked = this.parseNullableDate("revokedAt", value);
          if (parsedRevoked.error) return { apiKey: null, error: parsedRevoked.error };
          updates.revokedAt = parsedRevoked.date;
          break;
        default:
          break;
      }
    }

    if (Object.keys(updates).length === 0)
      return { apiKey: null, error: "No valid updates provided." };

    try {
      const apiKey = await prisma.api_keys.update({
        where: { id: Number(id) },
        data: updates,
      });
      return { apiKey, error: null };
    } catch (error) {
      console.error("FAILED TO UPDATE API KEY.", error.message);
      return { apiKey: null, error: error.message };
    }
  },

  count: async function (clause = {}) {
    try {
      const count = await prisma.api_keys.count({ where: clause });
      return count;
    } catch (error) {
      console.error("FAILED TO COUNT API KEYS.", error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.api_keys.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error("FAILED TO DELETE API KEY.", error.message);
      return false;
    }
  },

  where: async function (clause = {}, limit) {
    try {
      const apiKeys = await prisma.api_keys.findMany({
        where: clause,
        take: limit,
      });
      return apiKeys;
    } catch (error) {
      console.error("FAILED TO GET API KEYS.", error.message);
      return [];
    }
  },

  whereWithUser: async function (clause = {}, limit) {
    try {
      const { User } = require("./user");
      const apiKeys = await this.where(clause, limit);

      for (const apiKey of apiKeys) {
        apiKey.scopes = this.parseScopes(apiKey);
        apiKey.isExpired = this.isExpired(apiKey);
        apiKey.isRevoked = this.isRevoked(apiKey);
        apiKey.isUsable = this.isUsable(apiKey);
        if (!apiKey.createdBy) continue;
        const user = await User.get({ id: apiKey.createdBy });
        if (!user) continue;

        apiKey.createdBy = {
          id: user.id,
          username: user.username,
          role: user.role,
        };
      }

      return apiKeys;
    } catch (error) {
      console.error("FAILED TO GET API KEYS WITH USER.", error.message);
      return [];
    }
  },
};

module.exports = { ApiKey };
