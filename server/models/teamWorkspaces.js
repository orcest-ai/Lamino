const prisma = require("../utils/prisma");

const TeamWorkspace = {
  create: async function ({ teamId = null, workspaceId = null }) {
    if (!teamId || !workspaceId)
      return { link: null, error: "Invalid payload." };
    try {
      const link = await prisma.team_workspaces.create({
        data: {
          teamId: Number(teamId),
          workspaceId: Number(workspaceId),
        },
      });
      return { link, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE TEAM_WORKSPACE.", error.message);
      return { link: null, error: error.message };
    }
  },

  upsert: async function ({ teamId = null, workspaceId = null }) {
    if (!teamId || !workspaceId)
      return { link: null, error: "Invalid payload." };
    try {
      const link = await prisma.team_workspaces.upsert({
        where: {
          teamId_workspaceId: {
            teamId: Number(teamId),
            workspaceId: Number(workspaceId),
          },
        },
        create: {
          teamId: Number(teamId),
          workspaceId: Number(workspaceId),
        },
        update: {},
      });
      return { link, error: null };
    } catch (error) {
      console.error("FAILED TO UPSERT TEAM_WORKSPACE.", error.message);
      return { link: null, error: error.message };
    }
  },

  createManyWorkspaces: async function ({ teamId = null, workspaceIds = [] }) {
    if (!teamId || workspaceIds.length === 0)
      return { success: true, error: null };

    try {
      await prisma.$transaction(
        workspaceIds.map((workspaceId) =>
          prisma.team_workspaces.upsert({
            where: {
              teamId_workspaceId: {
                teamId: Number(teamId),
                workspaceId: Number(workspaceId),
              },
            },
            create: {
              teamId: Number(teamId),
              workspaceId: Number(workspaceId),
            },
            update: {},
          })
        )
      );
      return { success: true, error: null };
    } catch (error) {
      console.error(error.message);
      return { success: false, error: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const link = await prisma.team_workspaces.findFirst({ where: clause });
      return link || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  where: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const links = await prisma.team_workspaces.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return links;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  whereWithWorkspace: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const links = await prisma.team_workspaces.findMany({
        where: clause,
        include: {
          workspace: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return links;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      return await prisma.team_workspaces.count({ where: clause });
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.team_workspaces.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { TeamWorkspace };
