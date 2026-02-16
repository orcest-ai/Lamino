const mockGetFeatureFlags = jest.fn();

jest.mock("../../../models/systemSettings", () => ({
  SystemSettings: {
    getFeatureFlags: (...args) => mockGetFeatureFlags(...args),
  },
}));

const { gateEnabled, requireFeature } = require("../../../utils/middleware/featureGate");

describe("feature gate helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows when feature key is missing", () => {
    expect(gateEnabled({}, "unknown_feature")).toBe(true);
  });

  it("disables only when flag is explicitly false", () => {
    expect(gateEnabled({ enterprise_teams: false }, "enterprise_teams")).toBe(
      false
    );
    expect(gateEnabled({ enterprise_teams: true }, "enterprise_teams")).toBe(
      true
    );
  });

  it("returns 403 from middleware when feature disabled", async () => {
    mockGetFeatureFlags.mockResolvedValue({ enterprise_teams: false });
    const middleware = requireFeature("enterprise_teams");
    const request = {};
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    await middleware(request, response, next);
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });
});
