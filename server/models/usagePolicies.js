const prisma = require("../utils/prisma");
const { safeJsonParse } = require("../utils/http");

const VALID_POLICY_SCOPES = ["system", "team", "workspace", "user"];

const UsagePolicies = {
  writable: [
    "name",
    "description",
    "enabled",
    "scope",
    "teamId",
    "workspaceId",
    "userId",
    "priority",
    "rules",
  ],

  validateScope: function (scope = "system") {
    return VALID_POLICY_SCOPES.includes(String(scope))
      ? String(scope)
      : "system";
  },

  validateFields: function (updates = {}) {
    const validated = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!this.writable.includes(key)) continue;
      switch (key) {
        case "name":
          validated.name = String(value || "").slice(0, 255);
          break;
        case "description":
          validated.description = value ? String(value).slice(0, 2000) : null;
          break;
        case "enabled":
          validated.enabled = Boolean(value);
          break;
        case "scope":
          validated.scope = this.validateScope(value);
          break;
        case "teamId":
          validated.teamId = value ? Number(value) : null;
          break;
        case "workspaceId":
          validated.workspaceId = value ? Number(value) : null;
          break;
        case "userId":
          validated.userId = value ? Number(value) : null;
          break;
        case "priority":
          validated.priority = Number(value || 100);
          break;
        case "rules":
          validated.rules =
            typeof value === "string"
              ? value
              : JSON.stringify(value || {});
          break;
        default:
          break;
      }
    }
    return validated;
  },

  new: async function ({
    name = null,
    description = null,
    enabled = true,
    scope = "system",
    teamId = null,
    workspaceId = null,
    userId = null,
    priority = 100,
    rules = {},
    createdBy = null,
  }) {
    if (!name || typeof name !== "string")
      return { policy: null, error: "Policy name is required." };
    try {
      const policy = await prisma.usage_policies.create({
        data: {
          name: String(name).slice(0, 255),
          description: description ? String(description).slice(0, 2000) : null,
          enabled: Boolean(enabled),
          scope: this.validateScope(scope),
          teamId: teamId ? Number(teamId) : null,
          workspaceId: workspaceId ? Number(workspaceId) : null,
          userId: userId ? Number(userId) : null,
          priority: Number(priority || 100),
          rules: typeof rules === "string" ? rules : JSON.stringify(rules),
          createdBy: createdBy ? Number(createdBy) : null,
        },
      });
      return { policy, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE USAGE POLICY.", error.message);
      return { policy: null, error: error.message };
    }
  },

  update: async function (id = null, updates = {}) {
    if (!id) return { policy: null, error: "No policy id provided." };
    const data = this.validateFields(updates);
    if (Object.keys(data).length === 0)
      return { policy: null, error: "No valid updates provided." };
    try {
      const policy = await prisma.usage_policies.update({
        where: { id: Number(id) },
        data,
      });
      return { policy, error: null };
    } catch (error) {
      console.error("FAILED TO UPDATE USAGE POLICY.", error.message);
      return { policy: null, error: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const policy = await prisma.usage_policies.findFirst({ where: clause });
      return policy || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  where: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const policies = await prisma.usage_policies.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return policies;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  whereWithRelations: async function (
    clause = {},
    limit = null,
    orderBy = null
  ) {
    try {
      const policies = await prisma.usage_policies.findMany({
        where: clause,
        include: {
          team: true,
          workspace: true,
          user: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return policies;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  effectiveFor: async function ({
    userId = null,
    workspaceId = null,
    teamIds = [],
  }) {
    const where = {
      enabled: true,
      OR: [
        { scope: "system" },
        ...(workspaceId
          ? [{ scope: "workspace", workspaceId: Number(workspaceId) }]
          : []),
        ...(userId ? [{ scope: "user", userId: Number(userId) }] : []),
        ...(teamIds.length > 0
          ? [{ scope: "team", teamId: { in: teamIds.map(Number) } }]
          : []),
      ],
    };

    const policies = await this.where(where, null, [
      { priority: "desc" },
      { id: "asc" },
    ]);
    return policies;
  },

  resolveRulesFor: async function ({ userId = null, workspaceId = null, teamIds = [] }) {
    const policies = await this.effectiveFor({ userId, workspaceId, teamIds });
    const merged = {};

    for (const policy of policies) {
      const rules = safeJsonParse(policy.rules, {});
      Object.assign(merged, rules || {});
    }

    return { rules: merged, policies };
  },

  count: async function (clause = {}) {
    try {
      return await prisma.usage_policies.count({ where: clause });
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.usage_policies.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { UsagePolicies, VALID_POLICY_SCOPES };
