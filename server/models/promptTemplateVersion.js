const prisma = require("../utils/prisma");

const PromptTemplateVersion = {
  nextVersion: async function (templateId = null) {
    if (!templateId) return 1;
    const latest = await this.latestForTemplate(templateId);
    if (!latest) return 1;
    return Number(latest.version) + 1;
  },

  create: async function ({
    templateId = null,
    prompt = "",
    changelog = null,
    createdBy = null,
    approvedBy = null,
    version = null,
  }) {
    if (!templateId) return { version: null, error: "Template is required." };
    if (!prompt || typeof prompt !== "string")
      return { version: null, error: "Prompt text is required." };
    try {
      const next = version ? Number(version) : await this.nextVersion(templateId);
      const templateVersion = await prisma.prompt_template_versions.create({
        data: {
          templateId: Number(templateId),
          version: next,
          prompt: String(prompt),
          changelog: changelog ? String(changelog).slice(0, 2000) : null,
          createdBy: createdBy ? Number(createdBy) : null,
          approvedBy: approvedBy ? Number(approvedBy) : null,
        },
      });
      return { version: templateVersion, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE PROMPT TEMPLATE VERSION.", error.message);
      return { version: null, error: error.message };
    }
  },

  approve: async function (id = null, approvedBy = null) {
    if (!id || !approvedBy)
      return { success: false, error: "Missing id or approver." };
    try {
      await prisma.prompt_template_versions.update({
        where: { id: Number(id) },
        data: {
          approvedBy: Number(approvedBy),
        },
      });
      return { success: true, error: null };
    } catch (error) {
      console.error(error.message);
      return { success: false, error: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const version = await prisma.prompt_template_versions.findFirst({
        where: clause,
      });
      return version || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  latestForTemplate: async function (templateId = null) {
    if (!templateId) return null;
    try {
      const version = await prisma.prompt_template_versions.findFirst({
        where: { templateId: Number(templateId) },
        orderBy: { version: "desc" },
      });
      return version || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  forTemplate: async function (templateId = null, limit = null) {
    if (!templateId) return [];
    try {
      const versions = await prisma.prompt_template_versions.findMany({
        where: { templateId: Number(templateId) },
        orderBy: { version: "desc" },
        ...(limit !== null ? { take: limit } : {}),
      });
      return versions;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  where: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const versions = await prisma.prompt_template_versions.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return versions;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.prompt_template_versions.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { PromptTemplateVersion };
