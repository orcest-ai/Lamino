const prisma = require("../utils/prisma");

const UsageEvents = {
  toIntOrDefault: function (value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  },

  toPositiveIntOrNull: function (value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const normalized = Math.trunc(parsed);
    return normalized > 0 ? normalized : null;
  },

  toDateOrNow: function (value) {
    if (!value) return new Date();
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  },

  sanitizePayload: function (data = {}) {
    const promptTokens = Math.max(
      0,
      this.toIntOrDefault(data?.promptTokens, 0)
    );
    const completionTokens = Math.max(
      0,
      this.toIntOrDefault(data?.completionTokens, 0)
    );
    const totalTokens = Math.max(0, this.toIntOrDefault(data?.totalTokens, 0));
    const durationValue =
      data?.durationMs === null || data?.durationMs === undefined
        ? null
        : this.toIntOrDefault(data.durationMs, null);

    return {
      eventType: String(data?.eventType || "chat_completion"),
      userId: this.toPositiveIntOrNull(data?.userId),
      workspaceId: this.toPositiveIntOrNull(data?.workspaceId),
      teamId: this.toPositiveIntOrNull(data?.teamId),
      apiKeyId: this.toPositiveIntOrNull(data?.apiKeyId),
      chatId: this.toPositiveIntOrNull(data?.chatId),
      threadId: this.toPositiveIntOrNull(data?.threadId),
      provider: data?.provider ? String(data.provider) : null,
      model: data?.model ? String(data.model) : null,
      mode: data?.mode ? String(data.mode) : null,
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs: durationValue === null ? null : Math.max(0, durationValue),
      metadata: data?.metadata
        ? JSON.stringify(data.metadata)
        : data?.metadataRaw
          ? String(data.metadataRaw)
          : null,
      occurredAt: this.toDateOrNow(data?.occurredAt),
    };
  },

  log: async function (data = {}) {
    try {
      const event = await prisma.usage_events.create({
        data: this.sanitizePayload(data),
      });
      return { event, error: null };
    } catch (error) {
      console.error("FAILED TO LOG USAGE EVENT.", error.message);
      return { event: null, error: error.message };
    }
  },

  where: async function (
    clause = {},
    limit = null,
    orderBy = { occurredAt: "desc" },
    offset = null
  ) {
    try {
      const events = await prisma.usage_events.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(offset !== null ? { skip: offset } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return events;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  withRelations: async function (
    clause = {},
    limit = null,
    orderBy = { occurredAt: "desc" },
    offset = null
  ) {
    try {
      const events = await prisma.usage_events.findMany({
        where: clause,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
          workspace: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
          team: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(offset !== null ? { skip: offset } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return events;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  aggregate: async function (clause = {}) {
    try {
      return await prisma.usage_events.aggregate({
        where: clause,
        _count: { id: true },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          durationMs: true,
        },
      });
    } catch (error) {
      console.error(error.message);
      return {
        _count: { id: 0 },
        _sum: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          durationMs: 0,
        },
      };
    }
  },

  groupBy: async function ({ by = ["eventType"], where = {}, orderBy = null }) {
    try {
      return await prisma.usage_events.groupBy({
        by,
        where,
        _count: { id: true },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          durationMs: true,
        },
        ...(orderBy ? { orderBy } : {}),
      });
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      return await prisma.usage_events.count({ where: clause });
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.usage_events.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { UsageEvents };
