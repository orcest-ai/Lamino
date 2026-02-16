const mockCreate = jest.fn();
const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockCount = jest.fn();
const mockDeleteMany = jest.fn();
const mockFindMany = jest.fn();

jest.mock("../../utils/prisma", () => ({
  api_keys: {
    create: (...args) => mockCreate(...args),
    findFirst: (...args) => mockFindFirst(...args),
    update: (...args) => mockUpdate(...args),
    count: (...args) => mockCount(...args),
    deleteMany: (...args) => mockDeleteMany(...args),
    findMany: (...args) => mockFindMany(...args),
  },
}));

const { ApiKey } = require("../../models/apiKeys");
const {
  requiredScopeForRequest,
} = require("../../utils/middleware/validApiKey");

describe("Enterprise API key helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
    const malformed = { expiresAt: "not-a-date" };

    expect(ApiKey.isExpired(expired)).toBe(true);
    expect(ApiKey.isExpired(malformed)).toBe(true);
    expect(ApiKey.isRevoked(revoked)).toBe(true);
    expect(ApiKey.isUsable(expired)).toBe(false);
    expect(ApiKey.isUsable(malformed)).toBe(false);
    expect(ApiKey.isUsable(revoked)).toBe(false);
    expect(ApiKey.isUsable(active)).toBe(true);
  });

  it("rejects malformed expiresAt payloads before writes", async () => {
    const created = await ApiKey.create({
      createdBy: 1,
      scopes: ["admin:read"],
      expiresAt: "not-a-date",
    });
    expect(created).toEqual({
      apiKey: null,
      error: "Invalid expiresAt datetime.",
    });
    expect(mockCreate).not.toHaveBeenCalled();

    const updatedExpiry = await ApiKey.update(1, { expiresAt: "bad-expiry" });
    expect(updatedExpiry).toEqual({
      apiKey: null,
      error: "Invalid expiresAt datetime.",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects malformed revokedAt update payloads before writes", async () => {
    const updated = await ApiKey.update(1, { revokedAt: "bad-revoked-at" });
    expect(updated).toEqual({
      apiKey: null,
      error: "Invalid revokedAt datetime.",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
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

  it("maps team detail reads under admin path to admin:read", () => {
    const scope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/admin/teams/15/access-map",
    });
    expect(scope).toBe("admin:read");
  });

  it("maps team writes under admin path to admin:write", () => {
    const scope = requiredScopeForRequest({
      method: "POST",
      path: "/v1/admin/teams/15/update-members",
    });
    expect(scope).toBe("admin:write");
  });

  it("maps usage monitoring reads under admin path to admin:read", () => {
    const scope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/admin/usage/overview",
    });
    expect(scope).toBe("admin:read");
  });

  it("maps prompt template reads under admin path to admin:read", () => {
    const scope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/admin/prompt-templates",
    });
    expect(scope).toBe("admin:read");
  });

  it("maps usage policy reads under admin path to admin:read", () => {
    const scope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/admin/usage-policies",
    });
    expect(scope).toBe("admin:read");
  });

  it("maps prompt version/apply and effective policy admin routes by method", () => {
    const promptVersionsRead = requiredScopeForRequest({
      method: "GET",
      path: "/v1/admin/prompt-templates/12/versions",
    });
    const promptVersionsWrite = requiredScopeForRequest({
      method: "POST",
      path: "/v1/admin/prompt-templates/12/versions/new",
    });
    const promptApproveWrite = requiredScopeForRequest({
      method: "POST",
      path: "/v1/admin/prompt-templates/12/versions/9/approve",
    });
    const promptApplyWrite = requiredScopeForRequest({
      method: "POST",
      path: "/v1/admin/prompt-templates/12/apply-to-workspace",
    });
    const effectiveRead = requiredScopeForRequest({
      method: "GET",
      path: "/v1/admin/usage-policies/effective",
    });
    const usagePolicyDeleteWrite = requiredScopeForRequest({
      method: "DELETE",
      path: "/v1/admin/usage-policies/12",
    });

    expect(promptVersionsRead).toBe("admin:read");
    expect(promptVersionsWrite).toBe("admin:write");
    expect(promptApproveWrite).toBe("admin:write");
    expect(promptApplyWrite).toBe("admin:write");
    expect(effectiveRead).toBe("admin:read");
    expect(usagePolicyDeleteWrite).toBe("admin:write");
  });

  it("maps OpenAI-compatible chat endpoints to workspace:chat", () => {
    const scope = requiredScopeForRequest({
      method: "POST",
      path: "/v1/openai/chat/completions",
    });
    expect(scope).toBe("workspace:chat");
  });

  it("maps workspace-thread stream endpoints to workspace:chat", () => {
    const scope = requiredScopeForRequest({
      method: "POST",
      path: "/v1/workspace-thread/12/stream-chat",
    });
    expect(scope).toBe("workspace:chat");
  });

  it("maps non-stream workspace-thread routes to workspace:write", () => {
    const scope = requiredScopeForRequest({
      method: "POST",
      path: "/v1/workspace-thread/12/message",
    });
    expect(scope).toBe("workspace:write");
  });

  it("maps system endpoints to system:read", () => {
    const scope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/system/ping",
    });
    expect(scope).toBe("system:read");
  });

  it("maps auth endpoints to auth:read", () => {
    const sessionScope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/auth/session",
    });
    const rootScope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/auth",
    });
    expect(sessionScope).toBe("auth:read");
    expect(rootScope).toBe("auth:read");
  });

  it("maps users routes by method to users read/write scopes", () => {
    const readScope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/users",
    });
    const writeScope = requiredScopeForRequest({
      method: "POST",
      path: "/v1/users/invite",
    });
    expect(readScope).toBe("users:read");
    expect(writeScope).toBe("users:write");
  });

  it("maps workspace routes by method to workspace read/write scopes", () => {
    const readScope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/workspaces",
    });
    const writeScope = requiredScopeForRequest({
      method: "PATCH",
      path: "/v1/workspaces/slug",
    });
    expect(readScope).toBe("workspace:read");
    expect(writeScope).toBe("workspace:write");
  });

  it("maps documents and embed routes by method", () => {
    const docsRead = requiredScopeForRequest({
      method: "GET",
      path: "/v1/documents",
    });
    const docsWrite = requiredScopeForRequest({
      method: "DELETE",
      path: "/v1/documents/123",
    });
    const embedRead = requiredScopeForRequest({
      method: "GET",
      path: "/v1/embed/123",
    });
    const embedWrite = requiredScopeForRequest({
      method: "POST",
      path: "/v1/embed/123/chat",
    });
    expect(docsRead).toBe("documents:read");
    expect(docsWrite).toBe("documents:write");
    expect(embedRead).toBe("embed:read");
    expect(embedWrite).toBe("embed:write");
  });

  it("returns null for unmapped routes", () => {
    const scope = requiredScopeForRequest({
      method: "GET",
      path: "/v1/unknown/route",
    });
    expect(scope).toBeNull();
  });
});
