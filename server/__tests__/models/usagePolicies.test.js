jest.mock("../../utils/prisma", () => ({
  usage_policies: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const { UsagePolicies } = require("../../models/usagePolicies");

describe("UsagePolicies precedence resolution", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("applies policy rules in ascending priority order", async () => {
    jest.spyOn(UsagePolicies, "effectiveFor").mockResolvedValue([
      {
        id: 1,
        priority: 10,
        rules: JSON.stringify({
          maxChatsPerDay: 100,
          allowedModels: ["gpt-4o", "claude-3-5-sonnet"],
        }),
      },
      {
        id: 2,
        priority: 30,
        rules: JSON.stringify({
          maxChatsPerDay: 15,
        }),
      },
      {
        id: 3,
        priority: 50,
        rules: JSON.stringify({
          maxPromptLength: 12000,
          allowedModels: ["gpt-4o-mini"],
        }),
      },
    ]);

    const { rules, policies } = await UsagePolicies.resolveRulesFor({
      userId: 42,
      workspaceId: 7,
      teamIds: [2],
    });

    expect(policies).toHaveLength(3);
    expect(rules).toEqual({
      maxChatsPerDay: 15,
      maxPromptLength: 12000,
      allowedModels: ["gpt-4o-mini"],
    });
  });
});
