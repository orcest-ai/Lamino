const mockGet = jest.fn();
const mockIsUsable = jest.fn();
const mockIsRevoked = jest.fn();
const mockHasScope = jest.fn();
const mockParseScopes = jest.fn();
const mockIsMultiUserMode = jest.fn();

jest.mock("../../../models/apiKeys", () => ({
  ApiKey: {
    get: (...args) => mockGet(...args),
    isUsable: (...args) => mockIsUsable(...args),
    isRevoked: (...args) => mockIsRevoked(...args),
    hasScope: (...args) => mockHasScope(...args),
    parseScopes: (...args) => mockParseScopes(...args),
  },
}));

jest.mock("../../../models/systemSettings", () => ({
  SystemSettings: {
    isMultiUserMode: (...args) => mockIsMultiUserMode(...args),
  },
}));

const { validApiKey } = require("../../../utils/middleware/validApiKey");

function mockResponse() {
  const response = {
    locals: {},
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return response;
}

describe("validApiKey middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMultiUserMode.mockResolvedValue(true);
  });

  it("rejects requests missing Authorization header", async () => {
    const request = { header: jest.fn(() => null), method: "GET", path: "/v1/admin/teams" };
    const response = mockResponse();
    const next = jest.fn();

    await validApiKey(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "No valid api key found.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects unknown API keys", async () => {
    const request = {
      header: jest.fn(() => "Bearer unknown"),
      method: "GET",
      path: "/v1/admin/teams",
    };
    mockGet.mockResolvedValueOnce(null);
    const response = mockResponse();
    const next = jest.fn();

    await validApiKey(request, response, next);

    expect(mockGet).toHaveBeenCalledWith({ secret: "unknown" });
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects revoked keys with explicit revoked message", async () => {
    const request = {
      header: jest.fn(() => "Bearer revoked"),
      method: "GET",
      path: "/v1/admin/teams",
    };
    mockGet.mockResolvedValueOnce({ id: 9, secret: "revoked" });
    mockIsUsable.mockReturnValueOnce(false);
    mockIsRevoked.mockReturnValueOnce(true);
    const response = mockResponse();
    const next = jest.fn();

    await validApiKey(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "API key has been revoked.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects expired keys when unusable but not revoked", async () => {
    const request = {
      header: jest.fn(() => "Bearer expired"),
      method: "GET",
      path: "/v1/admin/teams",
    };
    mockGet.mockResolvedValueOnce({ id: 10, secret: "expired" });
    mockIsUsable.mockReturnValueOnce(false);
    mockIsRevoked.mockReturnValueOnce(false);
    const response = mockResponse();
    const next = jest.fn();

    await validApiKey(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "API key has expired.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects keys without required route scope", async () => {
    const request = {
      header: jest.fn(() => "Bearer scoped"),
      method: "POST",
      path: "/v1/admin/teams/new",
    };
    const key = { id: 11, secret: "scoped", scopes: "admin:read" };
    mockGet.mockResolvedValueOnce(key);
    mockIsUsable.mockReturnValueOnce(true);
    mockHasScope.mockReturnValueOnce(false);
    const response = mockResponse();
    const next = jest.fn();

    await validApiKey(request, response, next);

    expect(mockHasScope).toHaveBeenCalledWith(key, "admin:write");
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: "API key is missing required scope: admin:write.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("sets response locals and calls next for valid scoped key", async () => {
    const request = {
      header: jest.fn(() => "Bearer valid"),
      method: "GET",
      path: "/v1/admin/teams",
    };
    const key = { id: 12, secret: "valid", scopes: "admin:read" };
    mockGet.mockResolvedValueOnce(key);
    mockIsUsable.mockReturnValueOnce(true);
    mockHasScope.mockReturnValueOnce(true);
    mockParseScopes.mockReturnValueOnce(["admin:read"]);
    const response = mockResponse();
    const next = jest.fn();

    await validApiKey(request, response, next);

    expect(response.locals.multiUserMode).toBe(true);
    expect(response.locals.apiKey).toEqual({
      ...key,
      scopes: ["admin:read"],
      requiredScope: "admin:read",
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("permits routes without inferred required scope", async () => {
    const request = {
      header: jest.fn(() => "Bearer valid"),
      method: "GET",
      path: "/healthz",
    };
    const key = { id: 13, secret: "valid", scopes: "admin:read" };
    mockGet.mockResolvedValueOnce(key);
    mockIsUsable.mockReturnValueOnce(true);
    mockParseScopes.mockReturnValueOnce(["admin:read"]);
    const response = mockResponse();
    const next = jest.fn();

    await validApiKey(request, response, next);

    expect(mockHasScope).not.toHaveBeenCalled();
    expect(response.locals.apiKey.requiredScope).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("stores multi-user mode status from system settings in locals", async () => {
    mockIsMultiUserMode.mockResolvedValueOnce(false);
    const request = {
      header: jest.fn(() => "Bearer valid"),
      method: "GET",
      path: "/v1/admin/teams",
    };
    const key = { id: 14, secret: "valid", scopes: "admin:read" };
    mockGet.mockResolvedValueOnce(key);
    mockIsUsable.mockReturnValueOnce(true);
    mockHasScope.mockReturnValueOnce(true);
    mockParseScopes.mockReturnValueOnce(["admin:read"]);
    const response = mockResponse();
    const next = jest.fn();

    await validApiKey(request, response, next);

    expect(response.locals.multiUserMode).toBe(false);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
