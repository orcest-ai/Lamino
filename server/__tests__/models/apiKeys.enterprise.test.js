jest.mock("../../utils/prisma", () => ({
  api_keys: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
}));

const { ApiKey } = require("../../models/apiKeys");
const {
  requiredScopeForRequest,
} = require("../../utils/middleware/validApiKey");

describe("Enterprise API key helpers", () => {
  it("normalizes, de-duplicates, and parses scopes", () => {
    expect(ApiKey.normalizeScopes("admin:read, admin:read, workspace:chat")).toEqual([
      "admin:read",
      "workspace:chat",
    ]);
    expect(ApiKey.parseScopes({ scopes: null })).toEqual(["*"]);
  });

  it("respects wildcard and exact scope matching", () => {
    expect(ApiKey.hasScope({ scopes: "*" }, "admin:write")).toBe(true);
    expect(
      ApiKey.hasScope({ scopes: "workspace:chat,documents:read" }, "documents:read")
    ).toBe(true);
    expect(
      ApiKey.hasScope({ scopes: "workspace:chat,documents:read" }, "admin:write")
    ).toBe(false);
  });

  it("detects expired and revoked keys as unusable", () => {
    const expired = { expiresAt: new Date(Date.now() - 1000).toISOString() };
    const revoked = { revokedAt: new Date().toISOString() };
    const active = { expiresAt: new Date(Date.now() + 60_000).toISOString() };

    expect(ApiKey.isExpired(expired)).toBe(true);
    expect(ApiKey.isRevoked(revoked)).toBe(true);
    expect(ApiKey.isUsable(expired)).toBe(false);
    expect(ApiKey.isUsable(revoked)).toBe(false);
    expect(ApiKey.isUsable(active)).toBe(true);
  });
});

describe("API scope resolution from request path", () => {
  it("maps admin write routes to admin:write", () => {
    const scope = requiredScopeForRequest({
      method: "POST",
      path: "/v1/admin/users/new",
    });
    expect(scope).toBe("admin:write");
  });

  it("maps workspace chat routes to workspace:chat", () => {
    const scope = requiredScopeForRequest({
      method: "POST",
      path: "/v1/workspace/my-ws/stream-chat",
    });
    expect(scope).toBe("workspace:chat");
  });
});
