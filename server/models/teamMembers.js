const prisma = require("../utils/prisma");

const VALID_TEAM_MEMBER_ROLES = ["owner", "admin", "member", "viewer"];

const TeamMember = {
  validateRole: function (role = "member") {
    return VALID_TEAM_MEMBER_ROLES.includes(String(role))
      ? String(role)
      : "member";
  },

  create: async function ({ teamId = null, userId = null, role = "member" }) {
    if (!teamId || !userId) return { member: null, error: "Invalid payload." };
    try {
      const member = await prisma.team_members.create({
        data: {
          teamId: Number(teamId),
          userId: Number(userId),
          role: this.validateRole(role),
        },
      });
      return { member, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE TEAM_MEMBER.", error.message);
      return { member: null, error: error.message };
    }
  },

  upsert: async function ({ teamId = null, userId = null, role = "member" }) {
    if (!teamId || !userId) return { member: null, error: "Invalid payload." };
    try {
      const member = await prisma.team_members.upsert({
        where: {
          teamId_userId: {
            teamId: Number(teamId),
            userId: Number(userId),
          },
        },
        create: {
          teamId: Number(teamId),
          userId: Number(userId),
          role: this.validateRole(role),
        },
        update: {
          role: this.validateRole(role),
        },
      });
      return { member, error: null };
    } catch (error) {
      console.error("FAILED TO UPSERT TEAM_MEMBER.", error.message);
      return { member: null, error: error.message };
    }
  },

  createManyUsers: async function ({
    teamId = null,
    userIds = [],
    role = "member",
  }) {
    if (!teamId || userIds.length === 0) return { success: true, error: null };
    try {
      await prisma.$transaction(
        userIds.map((userId) =>
          prisma.team_members.upsert({
            where: {
              teamId_userId: {
                teamId: Number(teamId),
                userId: Number(userId),
              },
            },
            create: {
              teamId: Number(teamId),
              userId: Number(userId),
              role: this.validateRole(role),
            },
            update: {
              role: this.validateRole(role),
            },
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
      const member = await prisma.team_members.findFirst({ where: clause });
      return member || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  where: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const members = await prisma.team_members.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return members;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  whereWithUser: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const members = await prisma.team_members.findMany({
        where: clause,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
              suspended: true,
            },
          },
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return members;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      return await prisma.team_members.count({ where: clause });
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.team_members.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { TeamMember, VALID_TEAM_MEMBER_ROLES };
