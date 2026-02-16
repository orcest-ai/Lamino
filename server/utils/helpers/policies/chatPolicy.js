const { TeamMember } = require("../../../models/teamMembers");
const { UsageEvents } = require("../../../models/usageEvents");
const { UsagePolicies } = require("../../../models/usagePolicies");
const { SystemSettings } = require("../../../models/systemSettings");

function startOfUtcDay() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function normalizeAllowedArray(value = null) {
  if (!value) return [];
  if (Array.isArray(value))
    return value
      .map((entry) => String(entry).trim())
      .filter(Boolean);
  if (typeof value === "string")
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  return [];
}

function parsePositiveLimit(value = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return parsed;
}

async function resolvePolicyContext({ user = null, workspace = null }) {
  const teamMemberships = user?.id
    ? await TeamMember.where({ userId: Number(user.id) })
    : [];
  const teamIds = [...new Set(teamMemberships.map((membership) => membership.teamId))];
  const { rules, policies } = await UsagePolicies.resolveRulesFor({
    userId: user?.id || null,
    workspaceId: workspace?.id || null,
    teamIds,
  });
  return { teamIds, rules, policies };
}

async function enforceChatPolicies({ user = null, workspace = null, message = "" }) {
  const featureFlags = await SystemSettings.getFeatureFlags();
  if (featureFlags?.enterprise_usage_policies === false) {
    return { allowed: true, rules: {}, policies: [], teamIds: [] };
  }
  const { rules = {}, policies = [], teamIds = [] } = await resolvePolicyContext({
    user,
    workspace,
  });
  if (!rules || Object.keys(rules).length === 0)
    return { allowed: true, rules: {}, policies: [], teamIds };

  const provider = workspace?.chatProvider || process.env.LLM_PROVIDER || null;
  const model = workspace?.chatModel || null;
  const allowedProviders = normalizeAllowedArray(rules.allowedProviders);
  const allowedModels = normalizeAllowedArray(rules.allowedModels);
  const maxPromptLength = parsePositiveLimit(rules.maxPromptLength);
  const maxChatsPerDay = parsePositiveLimit(rules.maxChatsPerDay);
  const maxTokensPerDay = parsePositiveLimit(rules.maxTokensPerDay);

  if (
    allowedProviders.length > 0 &&
    provider &&
    !allowedProviders.includes(provider) &&
    !allowedProviders.includes("*")
  ) {
    return {
      allowed: false,
      code: "policy_provider_not_allowed",
      error: `Provider ${provider} is blocked by usage policy.`,
      policies,
      rules,
    };
  }

  if (
    allowedModels.length > 0 &&
    model &&
    !allowedModels.includes(model) &&
    !allowedModels.includes("*")
  ) {
    return {
      allowed: false,
      code: "policy_model_not_allowed",
      error: `Model ${model} is blocked by usage policy.`,
      policies,
      rules,
    };
  }

  if (maxPromptLength && typeof message === "string" && message.length > maxPromptLength) {
    return {
      allowed: false,
      code: "policy_prompt_too_long",
      error: `Prompt length exceeds policy limit of ${maxPromptLength} characters.`,
      policies,
      rules,
    };
  }

  const needsDailyUsageCheck = !!maxChatsPerDay || !!maxTokensPerDay;
  if (needsDailyUsageCheck) {
    const where = {
      occurredAt: {
        gte: startOfUtcDay(),
        lte: new Date(),
      },
      ...(workspace?.id ? { workspaceId: Number(workspace.id) } : {}),
      ...(user?.id ? { userId: Number(user.id) } : {}),
      eventType: { in: ["workspace_chat", "workspace_thread_chat", "embed_chat"] },
    };

    if (maxChatsPerDay) {
      const sentChats = await UsageEvents.count(where);
      if (sentChats >= maxChatsPerDay) {
        return {
          allowed: false,
          code: "policy_daily_chat_limit",
          error: `Daily chat quota reached (${maxChatsPerDay}).`,
          policies,
          rules,
        };
      }
    }

    if (maxTokensPerDay) {
      const aggregate = await UsageEvents.aggregate(where);
      const tokenCount = Number(aggregate?._sum?.totalTokens || 0);
      if (tokenCount >= maxTokensPerDay) {
        return {
          allowed: false,
          code: "policy_daily_token_limit",
          error: `Daily token quota reached (${maxTokensPerDay}).`,
          policies,
          rules,
        };
      }
    }
  }

  return { allowed: true, rules, policies, teamIds };
}

module.exports = {
  enforceChatPolicies,
  resolvePolicyContext,
};
