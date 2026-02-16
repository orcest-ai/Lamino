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
const prisma = require("../../utils/prisma");

describe("UsagePolicies precedence resolution", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("applies policy rules so lower priority value overrides", async () => {
    jest.spyOn(UsagePolicies, "effectiveFor").mockResolvedValue([
      {
        id: 3,
        priority: 50,
        rules: JSON.stringify({
          maxPromptLength: 12000,
          allowedModels: ["gpt-4o-mini"],
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
        id: 1,
        priority: 10,
        rules: JSON.stringify({
          maxChatsPerDay: 100,
          allowedModels: ["gpt-4o", "claude-3-5-sonnet"],
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
      maxChatsPerDay: 100,
      maxPromptLength: 12000,
      allowedModels: ["gpt-4o", "claude-3-5-sonnet"],
    });
  });

  it("normalizes scope and writable policy fields", () => {
    expect(UsagePolicies.validateScope("workspace")).toBe("workspace");
    expect(UsagePolicies.validateScope("not-a-scope")).toBe("system");

    const validated = UsagePolicies.validateFields({
      name: "policy-name",
      description: "desc",
      enabled: 0,
      scope: "invalid-scope",
      teamId: "12",
      workspaceId: "18",
      userId: "7",
      priority: "15",
      rules: { maxPromptLength: 42 },
      unsupported: "ignored",
    });

    expect(validated).toEqual({
      name: "policy-name",
      description: "desc",
      enabled: false,
      scope: "system",
      teamId: 12,
      workspaceId: 18,
      userId: 7,
      priority: 15,
      rules: JSON.stringify({ maxPromptLength: 42 }),
    });
  });

  it("normalizes boolean-like fields and drops malformed relation identifiers", () => {
    const validated = UsagePolicies.validateFields({
      enabled: "false",
      teamId: "bad-team-id",
      workspaceId: -7,
      userId: "0",
      priority: "not-a-number",
      rules: "{}",
    });

    expect(validated).toEqual({
      enabled: false,
      teamId: null,
      workspaceId: null,
      userId: null,
      priority: 100,
      rules: "{}",
    });
  });

  it("falls back to safe boolean default for unrecognized enabled strings", () => {
    expect(UsagePolicies.validateFields({ enabled: "true" })).toEqual({
      enabled: true,
    });

    const validated = UsagePolicies.validateFields({
      enabled: "not-a-boolean",
    });
    expect(validated).toEqual({ enabled: false });
  });

  it("builds effective policy clause with descending priority ordering", async () => {
    prisma.usage_policies.findMany.mockResolvedValueOnce([
      { id: 3, priority: 100, scope: "system" },
    ]);

    await UsagePolicies.effectiveFor({
      userId: 44,
      workspaceId: 21,
      teamIds: [5, "6"],
    });

    expect(prisma.usage_policies.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        OR: [
          { scope: "system" },
          { scope: "workspace", workspaceId: 21 },
          { scope: "user", userId: 44 },
          { scope: "team", teamId: { in: [5, 6] } },
        ],
      },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    });
  });

  it("sanitizes malformed ids before building effective policy clause", async () => {
    prisma.usage_policies.findMany.mockResolvedValueOnce([]);

    await UsagePolicies.effectiveFor({
      userId: "bad-user",
      workspaceId: "-2",
      teamIds: [5, "5", "0", "foo", -3, "8.9"],
    });

    expect(prisma.usage_policies.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        OR: [
          { scope: "system" },
          { scope: "team", teamId: { in: [5] } },
        ],
      },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    });
  });

  it("sanitizes create payload fields before persisting", async () => {
    prisma.usage_policies.create.mockResolvedValueOnce({
      id: 91,
      name: "new-policy",
    });

    const result = await UsagePolicies.new({
      name: "new-policy",
      enabled: "false",
      teamId: "bad-id",
      workspaceId: "4.8",
      userId: 0,
      priority: "NaN-ish",
      rules: { maxPromptLength: 99 },
      createdBy: "creator-bad",
    });

    expect(result).toEqual({
      policy: { id: 91, name: "new-policy" },
      error: null,
    });
    expect(prisma.usage_policies.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "new-policy",
        enabled: false,
        teamId: null,
        workspaceId: null,
        userId: null,
        priority: 100,
        rules: JSON.stringify({ maxPromptLength: 99 }),
        createdBy: null,
      }),
    });
  });
});
