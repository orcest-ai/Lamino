const prisma = require("../utils/prisma");
const slugifyModule = require("slugify");
const { v4: uuidv4 } = require("uuid");
const { safeJsonParse } = require("../utils/http");

const VALID_TEMPLATE_SCOPES = ["system", "team", "user"];

const PromptTemplate = {
  writable: ["name", "slug", "description", "scope", "teamId", "isPublished"],

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

  validateScope: function (scope = "system") {
    return VALID_TEMPLATE_SCOPES.includes(String(scope))
      ? String(scope)
      : "system";
  },

  validateFields: function (updates = {}) {
    const validated = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!this.writable.includes(key)) continue;
      switch (key) {
        case "name":
          validated.name = String(value || "").slice(0, 255).trim();
          break;
        case "slug":
          validated.slug = this.slugify(String(value || ""), {
            lower: true,
          }).slice(0, 255);
          break;
        case "description":
          validated.description = value ? String(value).slice(0, 2000) : null;
          break;
        case "scope":
          validated.scope = this.validateScope(value);
          break;
        case "teamId":
          validated.teamId = value ? Number(value) : null;
          break;
        case "isPublished":
          validated.isPublished = Boolean(value);
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
    scope = "system",
    teamId = null,
    createdBy = null,
  }) {
    if (!name || typeof name !== "string")
      return { template: null, error: "Template name is required." };
    let slug = this.slugify(name, { lower: true }) || uuidv4();
    if (await this.get({ slug, teamId: teamId ? Number(teamId) : null })) {
      slug = this.slugify(`${slug}-${Math.floor(100000 + Math.random() * 9e5)}`, {
        lower: true,
      });
    }

    try {
      const template = await prisma.prompt_templates.create({
        data: {
          uuid: uuidv4(),
          name: String(name).slice(0, 255),
          slug,
          description: description ? String(description).slice(0, 2000) : null,
          scope: this.validateScope(scope),
          teamId: teamId ? Number(teamId) : null,
          createdBy: createdBy ? Number(createdBy) : null,
        },
      });
      return { template, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE PROMPT TEMPLATE.", error.message);
      return { template: null, error: error.message };
    }
  },

  update: async function (id = null, updates = {}) {
    if (!id)
      return { template: null, error: "No prompt template id provided." };
    const data = this.validateFields(updates);
    if (Object.keys(data).length === 0)
      return { template: null, error: "No valid updates provided." };

    try {
      const template = await prisma.prompt_templates.update({
        where: { id: Number(id) },
        data,
      });
      return { template, error: null };
    } catch (error) {
      console.error("FAILED TO UPDATE PROMPT TEMPLATE.", error.message);
      return { template: null, error: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const template = await prisma.prompt_templates.findFirst({ where: clause });
      return template || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  where: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const templates = await prisma.prompt_templates.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return templates;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  whereWithVersions: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const templates = await prisma.prompt_templates.findMany({
        where: clause,
        include: {
          versions: {
            orderBy: { version: "desc" },
          },
        },
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return templates;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  latestVersion: async function (templateId = null) {
    if (!templateId) return null;
    try {
      return await prisma.prompt_template_versions.findFirst({
        where: { templateId: Number(templateId) },
        orderBy: { version: "desc" },
      });
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.prompt_templates.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  count: async function (clause = {}) {
    try {
      return await prisma.prompt_templates.count({ where: clause });
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  parseMetadata: function (value = null, fallback = {}) {
    return safeJsonParse(value, fallback);
  },
};

module.exports = { PromptTemplate, VALID_TEMPLATE_SCOPES };
