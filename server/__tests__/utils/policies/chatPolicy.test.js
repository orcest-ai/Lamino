const mockTeamMemberWhere = jest.fn();
const mockUsagePolicyResolveRulesFor = jest.fn();
const mockUsageEventsCount = jest.fn();
const mockUsageEventsAggregate = jest.fn();
const mockGetFeatureFlags = jest.fn();

jest.mock("../../../../server/models/teamMembers", () => ({
  TeamMember: {
    where: (...args) => mockTeamMemberWhere(...args),
  },
}));

jest.mock("../../../../server/models/usagePolicies", () => ({
  UsagePolicies: {
    resolveRulesFor: (...args) => mockUsagePolicyResolveRulesFor(...args),
  },
}));

jest.mock("../../../../server/models/usageEvents", () => ({
  UsageEvents: {
    count: (...args) => mockUsageEventsCount(...args),
    aggregate: (...args) => mockUsageEventsAggregate(...args),
  },
}));

jest.mock("../../../../server/models/systemSettings", () => ({
  SystemSettings: {
    getFeatureFlags: (...args) => mockGetFeatureFlags(...args),
  },
}));

const { enforceChatPolicies } = require("../../../../server/utils/helpers/policies/chatPolicy");

describe("Chat policy enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTeamMemberWhere.mockResolvedValue([]);
    mockUsagePolicyResolveRulesFor.mockResolvedValue({
      rules: {},
      policies: [],
    });
    mockGetFeatureFlags.mockResolvedValue({
      enterprise_usage_policies: true,
    });
    mockUsageEventsCount.mockResolvedValue(0);
    mockUsageEventsAggregate.mockResolvedValue({
      _sum: {
        totalTokens: 0,
      },
    });
  });

  it("allows chat when no policy rules are active", async () => {
    const result = await enforceChatPolicies({
      user: { id: 1 },
      workspace: { id: 2, chatProvider: "openai", chatModel: "gpt-4o" },
      message: "Hello world",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks chats that use a provider disallowed by policy", async () => {
    mockUsagePolicyResolveRulesFor.mockResolvedValue({
      rules: { allowedProviders: ["anthropic"] },
      policies: [{ id: 11 }],
    });
    const result = await enforceChatPolicies({
      user: { id: 1 },
      workspace: { id: 2, chatProvider: "openai", chatModel: "gpt-4o" },
      message: "Hello world",
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("policy_provider_not_allowed");
  });

  it("blocks chats that exceed max prompt length", async () => {
    mockUsagePolicyResolveRulesFor.mockResolvedValue({
      rules: { maxPromptLength: 5 },
      policies: [{ id: 22 }],
    });
    const result = await enforceChatPolicies({
      user: { id: 1 },
      workspace: { id: 2, chatProvider: "openai", chatModel: "gpt-4o" },
      message: "123456",
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("policy_prompt_too_long");
  });

  it("blocks chats when daily chat count policy is exceeded", async () => {
    mockUsagePolicyResolveRulesFor.mockResolvedValue({
      rules: { maxChatsPerDay: 2 },
      policies: [{ id: 33 }],
    });
    mockUsageEventsCount.mockResolvedValue(2);
    const result = await enforceChatPolicies({
      user: { id: 1 },
      workspace: { id: 2, chatProvider: "openai", chatModel: "gpt-4o" },
      message: "hello",
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("policy_daily_chat_limit");
  });
});
