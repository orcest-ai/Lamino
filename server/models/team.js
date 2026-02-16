const prisma = require("../utils/prisma");
const slugifyModule = require("slugify");
const { v4: uuidv4 } = require("uuid");

const Team = {
  writable: ["name", "description", "slug"],

  slugify: function (...args) {
    slugifyModule.extend({
      "+": " plus ",
      "!": " bang ",
      "@": " at ",
      "*": " splat ",
      ".": " dot ",
      ":": "",
      "~": "",
      "(": "",
      ")": "",
      "'": "",
      '"': "",
      "|": "",
    });
    return slugifyModule(...args);
  },

  validateFields: function (updates = {}) {
    const validated = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!this.writable.includes(key)) continue;
      switch (key) {
        case "name":
          validated.name = String(value || "").slice(0, 255).trim();
          break;
        case "description":
          validated.description = value ? String(value).slice(0, 2000) : null;
          break;
        case "slug":
          validated.slug = this.slugify(String(value || ""), {
            lower: true,
          }).slice(0, 255);
          break;
        default:
          break;
      }
    }
    return validated;
  },

  new: async function ({ name = null, description = null, createdBy = null }) {
    if (!name || typeof name !== "string")
      return { team: null, error: "Team name is required." };
    let slug = this.slugify(name, { lower: true }) || uuidv4();
    if (await this.get({ slug })) {
      slug = this.slugify(`${slug}-${Math.floor(100000 + Math.random() * 9e5)}`, {
        lower: true,
      });
    }

    try {
      const team = await prisma.teams.create({
        data: {
          name: String(name).slice(0, 255),
          description: description ? String(description).slice(0, 2000) : null,
          slug,
          createdBy: createdBy ? Number(createdBy) : null,
        },
      });
      return { team, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE TEAM.", error.message);
      return { team: null, error: error.message };
    }
  },

  update: async function (id = null, updates = {}) {
    if (!id) return { team: null, error: "No team id provided for update." };
    const data = this.validateFields(updates);
    if (Object.keys(data).length === 0)
      return { team: null, error: "No valid updates provided." };

    try {
      const team = await prisma.teams.update({
        where: { id: Number(id) },
        data,
      });
      return { team, error: null };
    } catch (error) {
      console.error("FAILED TO UPDATE TEAM.", error.message);
      return { team: null, error: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const team = await prisma.teams.findFirst({ where: clause });
      return team || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  where: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const teams = await prisma.teams.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return teams;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  withMembers: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const teams = await prisma.teams.findMany({
        where: clause,
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  role: true,
                },
              },
            },
          },
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return teams;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  withWorkspaces: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const teams = await prisma.teams.findMany({
        where: clause,
        include: {
          workspaces: {
            include: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return teams;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      return await prisma.teams.count({ where: clause });
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.teams.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { Team };
