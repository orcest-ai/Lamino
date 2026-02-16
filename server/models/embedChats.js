const { safeJsonParse } = require("../utils/http");
const prisma = require("../utils/prisma");
const { UsageEvents } = require("./usageEvents");

function parseUsageMetrics(metrics = {}) {
  const promptTokens = Number(
    metrics?.prompt_tokens ?? metrics?.promptTokens ?? 0
  );
  const completionTokens = Number(
    metrics?.completion_tokens ?? metrics?.completionTokens ?? 0
  );
  const totalTokens = Number(
    metrics?.total_tokens ?? metrics?.totalTokens ?? promptTokens + completionTokens
  );
  const durationRaw = Number(metrics?.duration ?? metrics?.durationMs ?? 0);
  const durationMs =
    !Number.isFinite(durationRaw) || durationRaw <= 0
      ? null
      : durationRaw > 1000
        ? Math.round(durationRaw)
        : Math.round(durationRaw * 1000);
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    durationMs,
  };
}

/**
 * @typedef {Object} EmbedChat
 * @property {number} id
 * @property {number} embed_id
 * @property {string} prompt
 * @property {string} response
 * @property {string} connection_information
 * @property {string} session_id
 * @property {boolean} include
 */

const EmbedChats = {
  new: async function ({
    embedId,
    prompt,
    response = {},
    connection_information = {},
    sessionId,
  }) {
    try {
      const chat = await prisma.embed_chats.create({
        data: {
          prompt,
          embed_id: Number(embedId),
          response: JSON.stringify(response),
          connection_information: JSON.stringify(connection_information),
          session_id: String(sessionId),
        },
      });

      const embed = await prisma.embed_configs.findFirst({
        where: { id: Number(embedId) },
        select: {
          workspace_id: true,
        },
      });
      const usageMetrics = parseUsageMetrics(response?.metrics || {});
      await UsageEvents.log({
        eventType: "embed_chat",
        workspaceId: embed?.workspace_id ? Number(embed.workspace_id) : null,
        promptTokens: usageMetrics.promptTokens,
        completionTokens: usageMetrics.completionTokens,
        totalTokens: usageMetrics.totalTokens,
        durationMs: usageMetrics.durationMs,
        mode: response?.type || null,
        metadata: {
          embedId: Number(embedId),
          sessionId: String(sessionId),
          sourceCount: Array.isArray(response?.sources)
            ? response.sources.length
            : 0,
        },
      });
      return { chat, message: null };
    } catch (error) {
      console.error(error.message);
      return { chat: null, message: error.message };
    }
  },

  /**
   * Loops through each chat and filters out the sources from the response object.
   * We do this when returning /history of an embed to the frontend to prevent inadvertent leaking
   * of private sources the user may not have intended to share with users.
   * @param {EmbedChat[]} chats
   * @returns {EmbedChat[]} Returns a new array of chats with the sources filtered out of responses
   */
  filterSources: function (chats) {
    return chats.map((chat) => {
      const { response, ...rest } = chat;
      const { sources, ...responseRest } = safeJsonParse(response);
      return { ...rest, response: JSON.stringify(responseRest) };
    });
  },

  /**
   * Fetches chats for a given embed and session id.
   * @param {number} embedId the id of the embed to fetch chats for
   * @param {string} sessionId the id of the session to fetch chats for
   * @param {number|null} limit the maximum number of chats to fetch
   * @param {string|null} orderBy the order to fetch chats in
   * @param {boolean} filterSources whether to filter out the sources from the response (default: false)
   * @returns {Promise<EmbedChat[]>} Returns an array of chats for the given embed and session
   */
  forEmbedByUser: async function (
    embedId = null,
    sessionId = null,
    limit = null,
    orderBy = null,
    filterSources = false
  ) {
    if (!embedId || !sessionId) return [];

    try {
      const chats = await prisma.embed_chats.findMany({
        where: {
          embed_id: Number(embedId),
          session_id: String(sessionId),
          include: true,
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : { orderBy: { id: "asc" } }),
      });
      return filterSources ? this.filterSources(chats) : chats;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  markHistoryInvalid: async function (embedId = null, sessionId = null) {
    if (!embedId || !sessionId) return [];

    try {
      await prisma.embed_chats.updateMany({
        where: {
          embed_id: Number(embedId),
          session_id: String(sessionId),
        },
        data: {
          include: false,
        },
      });
      return;
    } catch (error) {
      console.error(error.message);
    }
  },

  get: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const chat = await prisma.embed_chats.findFirst({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return chat || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.embed_chats.deleteMany({
        where: clause,
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  where: async function (
    clause = {},
    limit = null,
    orderBy = null,
    offset = null
  ) {
    try {
      const chats = await prisma.embed_chats.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(offset !== null ? { skip: offset } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return chats;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  whereWithEmbedAndWorkspace: async function (
    clause = {},
    limit = null,
    orderBy = null,
    offset = null
  ) {
    try {
      const chats = await prisma.embed_chats.findMany({
        where: clause,
        include: {
          embed_config: {
            select: {
              workspace: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(offset !== null ? { skip: offset } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return chats;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      const count = await prisma.embed_chats.count({
        where: clause,
      });
      return count;
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },
};

module.exports = { EmbedChats };
