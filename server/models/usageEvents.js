const prisma = require("../utils/prisma");

const UsageEvents = {
  sanitizePayload: function (data = {}) {
    return {
      eventType: String(data?.eventType || "chat_completion"),
      userId: data?.userId ? Number(data.userId) : null,
      workspaceId: data?.workspaceId ? Number(data.workspaceId) : null,
      teamId: data?.teamId ? Number(data.teamId) : null,
      apiKeyId: data?.apiKeyId ? Number(data.apiKeyId) : null,
      chatId: data?.chatId ? Number(data.chatId) : null,
      threadId: data?.threadId ? Number(data.threadId) : null,
      provider: data?.provider ? String(data.provider) : null,
      model: data?.model ? String(data.model) : null,
      mode: data?.mode ? String(data.mode) : null,
      promptTokens: Number(data?.promptTokens || 0),
      completionTokens: Number(data?.completionTokens || 0),
      totalTokens: Number(data?.totalTokens || 0),
      durationMs: data?.durationMs ? Number(data.durationMs) : null,
      metadata: data?.metadata
        ? JSON.stringify(data.metadata)
        : data?.metadataRaw
          ? String(data.metadataRaw)
          : null,
      occurredAt: data?.occurredAt ? new Date(data.occurredAt) : new Date(),
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
