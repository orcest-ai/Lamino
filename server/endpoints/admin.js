const { ApiKey } = require("../models/apiKeys");
const { Document } = require("../models/documents");
const { EventLogs } = require("../models/eventLogs");
const { Invite } = require("../models/invite");
const { SystemSettings } = require("../models/systemSettings");
const { Telemetry } = require("../models/telemetry");
const { User } = require("../models/user");
const { DocumentVectors } = require("../models/vectors");
const { Workspace } = require("../models/workspace");
const { WorkspaceChats } = require("../models/workspaceChats");
const { Team } = require("../models/team");
const { TeamMember } = require("../models/teamMembers");
const { TeamWorkspace } = require("../models/teamWorkspaces");
const { PromptTemplate } = require("../models/promptTemplate");
const { PromptTemplateVersion } = require("../models/promptTemplateVersion");
const { UsageEvents } = require("../models/usageEvents");
const { UsagePolicies } = require("../models/usagePolicies");
const {
  getVectorDbClass,
  getEmbeddingEngineSelection,
} = require("../utils/helpers");
const {
  parseIdFilter,
  parseIdList,
  usageBaseClause,
  timeSeriesBucket,
} = require("../utils/helpers/usageFilters");
const {
  systemPreferenceAccessError,
} = require("../utils/helpers/systemPreferenceAccess");
const {
  validRoleSelection,
  canModifyAdmin,
  validCanModify,
} = require("../utils/helpers/admin");
const { reqBody, userFromSession, safeJsonParse } = require("../utils/http");
const {
  strictMultiUserRoleValid,
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const ImportedPlugin = require("../utils/agents/imported");
const {
  simpleSSOLoginDisabledMiddleware,
} = require("../utils/middleware/simpleSSOEnabled");
const { requireFeature } = require("../utils/middleware/featureGate");

function sanitizeMemberPayload(payload = [], fallbackRole = "member") {
  if (!Array.isArray(payload)) return [];
  const members = [];
  for (const member of payload) {
    const userId = Number(member?.userId || member?.id || member);
    if (!userId || Number.isNaN(userId)) continue;
    members.push({
      userId,
      role: member?.role || fallbackRole,
    });
  }
  return members;
}

function sanitizeIdArray(payload = []) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((item) => Number(item))
    .filter((item) => !Number.isNaN(item) && item > 0);
}

async function promptTemplateAccessClause(user = null) {
  if (!user?.id) return { scope: "system" };
  if ([ROLES.admin, ROLES.manager].includes(user.role)) return {};

  const memberships = await TeamMember.where({ userId: Number(user.id) });
  const teamIds = memberships.map((membership) => membership.teamId);
  return {
    OR: [
      { scope: "system" },
      { createdBy: Number(user.id) },
      ...(teamIds.length > 0
        ? [
            {
              scope: "team",
              teamId: { in: teamIds },
            },
          ]
        : []),
    ],
  };
}

function adminEndpoints(app) {
  if (!app) return;

  app.get(
    "/admin/users",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const users = await User.where();
        response.status(200).json({ users });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/users/new",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const currUser = await userFromSession(request, response);
        const newUserParams = reqBody(request);
        const roleValidation = validRoleSelection(currUser, newUserParams);

        if (!roleValidation.valid) {
          response
            .status(200)
            .json({ user: null, error: roleValidation.error });
          return;
        }

        const { user: newUser, error } = await User.create(newUserParams);
        if (!!newUser) {
          await EventLogs.logEvent(
            "user_created",
            {
              userName: newUser.username,
              createdBy: currUser.username,
            },
            currUser.id
          );
        }

        response.status(200).json({ user: newUser, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/user/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const currUser = await userFromSession(request, response);
        const { id } = request.params;
        const updates = reqBody(request);
        const user = await User.get({ id: Number(id) });

        const canModify = validCanModify(currUser, user);
        if (!canModify.valid) {
          response.status(200).json({ success: false, error: canModify.error });
          return;
        }

        const roleValidation = validRoleSelection(currUser, updates);
        if (!roleValidation.valid) {
          response
            .status(200)
            .json({ success: false, error: roleValidation.error });
          return;
        }

        const validAdminRoleModification = await canModifyAdmin(user, updates);
        if (!validAdminRoleModification.valid) {
          response
            .status(200)
            .json({ success: false, error: validAdminRoleModification.error });
          return;
        }

        const { success, error } = await User.update(id, updates);
        response.status(200).json({ success, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/user/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const currUser = await userFromSession(request, response);
        const { id } = request.params;
        const user = await User.get({ id: Number(id) });

        const canModify = validCanModify(currUser, user);
        if (!canModify.valid) {
          response.status(200).json({ success: false, error: canModify.error });
          return;
        }

        await User.delete({ id: Number(id) });
        await EventLogs.logEvent(
          "user_deleted",
          {
            userName: user.username,
            deletedBy: currUser.username,
          },
          currUser.id
        );
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/invites",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const invites = await Invite.whereWithUsers();
        response.status(200).json({ invites });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/invite/new",
    [
      validatedRequest,
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
      simpleSSOLoginDisabledMiddleware,
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const body = reqBody(request);
        const { invite, error } = await Invite.create({
          createdByUserId: user.id,
          workspaceIds: body?.workspaceIds || [],
        });

        await EventLogs.logEvent(
          "invite_created",
          {
            inviteCode: invite.code,
            createdBy: response.locals?.user?.username,
          },
          response.locals?.user?.id
        );
        response.status(200).json({ invite, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/invite/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { id } = request.params;
        const { success, error } = await Invite.deactivate(id);
        await EventLogs.logEvent(
          "invite_deleted",
          { deletedBy: response.locals?.user?.username },
          response.locals?.user?.id
        );
        response.status(200).json({ success, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/workspaces",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const workspaces = await Workspace.whereWithUsers();
        response.status(200).json({ workspaces });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/workspaces/:workspaceId/users",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { workspaceId } = request.params;
        const users = await Workspace.workspaceUsers(workspaceId);
        response.status(200).json({ users });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/workspaces/new",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { name } = reqBody(request);
        const { workspace, message: error } = await Workspace.new(
          name,
          user.id
        );
        response.status(200).json({ workspace, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/workspaces/:workspaceId/update-users",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { workspaceId } = request.params;
        const { userIds } = reqBody(request);
        const { success, error } = await Workspace.updateUsers(
          workspaceId,
          userIds
        );
        response.status(200).json({ success, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/workspaces/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { id } = request.params;
        const VectorDb = getVectorDbClass();
        const workspace = await Workspace.get({ id: Number(id) });
        if (!workspace) {
          response.sendStatus(404).end();
          return;
        }

        await WorkspaceChats.delete({ workspaceId: Number(workspace.id) });
        await DocumentVectors.deleteForWorkspace(Number(workspace.id));
        await Document.delete({ workspaceId: Number(workspace.id) });
        await Workspace.delete({ id: Number(workspace.id) });
        try {
          await VectorDb["delete-namespace"]({ namespace: workspace.slug });
        } catch (e) {
          console.error(e.message);
        }

        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/teams",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (_request, response) => {
      try {
        const teams = await Team.where({}, null, { createdAt: "desc" });
        const teamsWithMappings = [];

        for (const team of teams) {
          const members = await TeamMember.whereWithUser({ teamId: team.id });
          const workspaces = await TeamWorkspace.whereWithWorkspace({
            teamId: team.id,
          });
          teamsWithMappings.push({
            ...team,
            members,
            workspaces,
            userIds: members.map((member) => member.userId),
            workspaceIds: workspaces.map((workspace) => workspace.workspaceId),
          });
        }
        response.status(200).json({ teams: teamsWithMappings, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/teams/:teamId",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const { teamId } = request.params;
        const team = await Team.get({ id: Number(teamId) });
        if (!team) return response.status(404).json({ team: null, error: "Team not found." });
        const members = await TeamMember.whereWithUser({ teamId: Number(teamId) });
        const workspaces = await TeamWorkspace.whereWithWorkspace({
          teamId: Number(teamId),
        });
        response.status(200).json({
          team: {
            ...team,
            members,
            workspaces,
            userIds: members.map((member) => member.userId),
            workspaceIds: workspaces.map((workspace) => workspace.workspaceId),
          },
          error: null,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/teams/new",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const body = reqBody(request);
        const { team, error } = await Team.new({
          name: body?.name,
          description: body?.description,
          createdBy: user?.id,
        });
        if (!team) return response.status(200).json({ team: null, error });

        let members = sanitizeMemberPayload(body?.members || body?.userIds || []);
        if (members.length === 0 && user?.id) {
          members = [{ userId: user.id, role: "owner" }];
        }
        for (const member of members) {
          await TeamMember.upsert({ teamId: team.id, ...member });
        }

        const workspaceIds = sanitizeIdArray(body?.workspaceIds || []);
        if (workspaceIds.length > 0) {
          await TeamWorkspace.createManyWorkspaces({
            teamId: team.id,
            workspaceIds,
          });
        }

        await EventLogs.logEvent(
          "team_created",
          {
            teamName: team.name,
            createdBy: user?.username,
          },
          user?.id
        );

        const teamMembers = await TeamMember.whereWithUser({ teamId: team.id });
        const teamWorkspaces = await TeamWorkspace.whereWithWorkspace({
          teamId: team.id,
        });
        response.status(200).json({
          team: {
            ...team,
            members: teamMembers,
            workspaces: teamWorkspaces,
            userIds: teamMembers.map((member) => member.userId),
            workspaceIds: teamWorkspaces.map(
              (workspace) => workspace.workspaceId
            ),
          },
          error: null,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/teams/:teamId",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const { teamId } = request.params;
        const existing = await Team.get({ id: Number(teamId) });
        if (!existing)
          return response.status(404).json({ success: false, error: "Team not found." });
        const { team, error } = await Team.update(teamId, reqBody(request));
        response.status(200).json({ success: !!team, team, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/teams/:teamId",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { teamId } = request.params;
        const existing = await Team.get({ id: Number(teamId) });
        if (!existing)
          return response.status(404).json({ success: false, error: "Team not found." });
        await Team.delete({ id: Number(teamId) });
        await EventLogs.logEvent(
          "team_deleted",
          {
            teamName: existing.name,
            deletedBy: user?.username,
          },
          user?.id
        );
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/teams/:teamId/members",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const { teamId } = request.params;
        const members = await TeamMember.whereWithUser({ teamId: Number(teamId) });
        response.status(200).json({ members, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/teams/:teamId/update-members",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { teamId } = request.params;
        const existing = await Team.get({ id: Number(teamId) });
        if (!existing)
          return response.status(404).json({ success: false, error: "Team not found." });
        const body = reqBody(request);
        const members = sanitizeMemberPayload(body?.members || body?.userIds || []);
        await TeamMember.delete({ teamId: Number(teamId) });
        for (const member of members) {
          await TeamMember.upsert({
            teamId: Number(teamId),
            userId: member.userId,
            role: member.role || "member",
          });
        }
        await EventLogs.logEvent(
          "team_members_updated",
          {
            teamName: existing.name,
            memberCount: members.length,
            updatedBy: user?.username,
          },
          user?.id
        );
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/teams/:teamId/workspaces",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const { teamId } = request.params;
        const workspaces = await TeamWorkspace.whereWithWorkspace({
          teamId: Number(teamId),
        });
        response.status(200).json({ workspaces, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/teams/:teamId/update-workspaces",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { teamId } = request.params;
        const existing = await Team.get({ id: Number(teamId) });
        if (!existing)
          return response.status(404).json({ success: false, error: "Team not found." });
        const body = reqBody(request);
        const workspaceIds = sanitizeIdArray(body?.workspaceIds || []);
        await TeamWorkspace.delete({ teamId: Number(teamId) });
        if (workspaceIds.length > 0) {
          await TeamWorkspace.createManyWorkspaces({
            teamId: Number(teamId),
            workspaceIds,
          });
        }
        await EventLogs.logEvent(
          "team_workspaces_updated",
          {
            teamName: existing.name,
            workspaceCount: workspaceIds.length,
            updatedBy: user?.username,
          },
          user?.id
        );
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/teams/:teamId/access-map",
    [
      validatedRequest,
      requireFeature("enterprise_teams"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const { teamId } = request.params;
        const team = await Team.get({ id: Number(teamId) });
        if (!team)
          return response.status(404).json({ map: null, error: "Team not found." });
        const members = await TeamMember.whereWithUser({ teamId: Number(teamId) });
        const workspaces = await TeamWorkspace.whereWithWorkspace({
          teamId: Number(teamId),
        });
        response.status(200).json({
          map: {
            team,
            members,
            workspaces,
          },
          error: null,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/prompt-templates",
    [
      validatedRequest,
      requireFeature("enterprise_prompt_library"),
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const clause = await promptTemplateAccessClause(user);
        const templates = await PromptTemplate.whereWithVersions(
          clause,
          null,
          [{ lastUpdatedAt: "desc" }]
        );
        response.status(200).json({ templates, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/prompt-templates/new",
    [
      validatedRequest,
      requireFeature("enterprise_prompt_library"),
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const body = reqBody(request);
        const { template, error } = await PromptTemplate.new({
          name: body?.name,
          description: body?.description,
          scope: body?.scope || "system",
          teamId: body?.teamId || null,
          createdBy: user?.id,
        });
        if (!template) return response.status(200).json({ template: null, error });

        if (body?.prompt) {
          await PromptTemplateVersion.create({
            templateId: template.id,
            prompt: body.prompt,
            changelog: body?.changelog || "Initial template version",
            createdBy: user?.id,
            approvedBy: body?.approved ? user?.id : null,
          });
        }

        await EventLogs.logEvent(
          "prompt_template_created",
          {
            templateName: template.name,
            scope: template.scope,
            createdBy: user?.username,
          },
          user?.id
        );
        const withVersions = await PromptTemplate.whereWithVersions({
          id: template.id,
        });
        response.status(200).json({
          template: withVersions?.[0] || template,
          error: null,
        });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/prompt-templates/:templateId",
    [
      validatedRequest,
      requireFeature("enterprise_prompt_library"),
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { templateId } = request.params;
        const clause = await promptTemplateAccessClause(user);
        const existing = await PromptTemplate.get({
          ...clause,
          id: Number(templateId),
        });
        if (!existing)
          return response.status(404).json({
            success: false,
            error: "Prompt template not found.",
          });
        const { template, error } = await PromptTemplate.update(
          Number(templateId),
          reqBody(request)
        );
        response.status(200).json({
          success: !!template,
          template,
          error,
        });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/prompt-templates/:templateId",
    [
      validatedRequest,
      requireFeature("enterprise_prompt_library"),
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { templateId } = request.params;
        const clause = await promptTemplateAccessClause(user);
        const existing = await PromptTemplate.get({
          ...clause,
          id: Number(templateId),
        });
        if (!existing)
          return response.status(404).json({
            success: false,
            error: "Prompt template not found.",
          });
        await PromptTemplate.delete({ id: Number(templateId) });
        response.status(200).json({ success: true, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/prompt-templates/:templateId/versions",
    [
      validatedRequest,
      requireFeature("enterprise_prompt_library"),
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { templateId } = request.params;
        const clause = await promptTemplateAccessClause(user);
        const existing = await PromptTemplate.get({
          ...clause,
          id: Number(templateId),
        });
        if (!existing)
          return response.status(404).json({
            versions: [],
            error: "Prompt template not found.",
          });
        const versions = await PromptTemplateVersion.forTemplate(
          Number(templateId)
        );
        response.status(200).json({ versions, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/prompt-templates/:templateId/versions/new",
    [
      validatedRequest,
      requireFeature("enterprise_prompt_library"),
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { templateId } = request.params;
        const clause = await promptTemplateAccessClause(user);
        const existing = await PromptTemplate.get({
          ...clause,
          id: Number(templateId),
        });
        if (!existing)
          return response.status(404).json({
            version: null,
            error: "Prompt template not found.",
          });
        const body = reqBody(request);
        const { version, error } = await PromptTemplateVersion.create({
          templateId: Number(templateId),
          prompt: body?.prompt,
          changelog: body?.changelog || null,
          createdBy: user?.id,
          approvedBy: body?.approved ? user?.id : null,
        });
        if (!version) return response.status(200).json({ version: null, error });
        if (body?.publish) {
          await PromptTemplate.update(Number(templateId), { isPublished: true });
        }
        response.status(200).json({ version, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/prompt-templates/:templateId/versions/:versionId/approve",
    [
      validatedRequest,
      requireFeature("enterprise_prompt_library"),
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { templateId, versionId } = request.params;
        const clause = await promptTemplateAccessClause(user);
        const existing = await PromptTemplate.get({
          ...clause,
          id: Number(templateId),
        });
        if (!existing)
          return response.status(404).json({
            success: false,
            error: "Prompt template not found.",
          });
        const version = await PromptTemplateVersion.get({
          id: Number(versionId),
          templateId: Number(templateId),
        });
        if (!version)
          return response.status(404).json({
            success: false,
            error: "Template version not found.",
          });
        const { success, error } = await PromptTemplateVersion.approve(
          Number(versionId),
          user?.id
        );
        if (success) {
          await PromptTemplate.update(Number(templateId), { isPublished: true });
        }
        response.status(200).json({ success, error });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/prompt-templates/:templateId/apply-to-workspace",
    [
      validatedRequest,
      requireFeature("enterprise_prompt_library"),
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { templateId } = request.params;
        const body = reqBody(request);
        const clause = await promptTemplateAccessClause(user);
        const template = await PromptTemplate.get({
          ...clause,
          id: Number(templateId),
        });
        if (!template)
          return response.status(404).json({
            success: false,
            error: "Prompt template not found.",
          });

        const workspace = await Workspace.get({ id: Number(body?.workspaceId) });
        if (!workspace)
          return response.status(404).json({
            success: false,
            error: "Workspace not found.",
          });

        const version =
          (body?.versionId
            ? await PromptTemplateVersion.get({
                id: Number(body.versionId),
                templateId: Number(templateId),
              })
            : null) ||
          (body?.version
            ? await PromptTemplateVersion.get({
                templateId: Number(templateId),
                version: Number(body.version),
              })
            : null) ||
          (await PromptTemplateVersion.latestForTemplate(Number(templateId)));

        if (!version)
          return response.status(404).json({
            success: false,
            error: "No template version is available to apply.",
          });

        const previousWorkspace = { ...workspace };
        const { workspace: updatedWorkspace, message: error } =
          await Workspace.update(Number(workspace.id), {
            openAiPrompt: version.prompt,
          });
        if (!updatedWorkspace)
          return response.status(200).json({ success: false, error });

        await Workspace.trackChange(previousWorkspace, updatedWorkspace, user);
        await EventLogs.logEvent(
          "workspace_prompt_template_applied",
          {
            workspace: workspace.slug,
            template: template.slug,
            templateVersion: version.version,
            appliedBy: user?.username,
          },
          user?.id
        );

        response.status(200).json({
          success: true,
          error: null,
          workspace: updatedWorkspace,
          template,
          version,
        });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/usage-policies",
    [
      validatedRequest,
      requireFeature("enterprise_usage_policies"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (_request, response) => {
      try {
        const policies = await UsagePolicies.whereWithRelations(
          {},
          null,
          [{ priority: "asc" }, { id: "asc" }]
        );
        response.status(200).json({ policies, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/usage-policies/new",
    [
      validatedRequest,
      requireFeature("enterprise_usage_policies"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const body = reqBody(request);
        const { policy, error } = await UsagePolicies.new({
          ...body,
          createdBy: user?.id,
        });
        response.status(200).json({ policy, error });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/usage-policies/:id",
    [
      validatedRequest,
      requireFeature("enterprise_usage_policies"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const { id } = request.params;
        const { policy, error } = await UsagePolicies.update(
          Number(id),
          reqBody(request)
        );
        response.status(200).json({ success: !!policy, policy, error });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/usage-policies/:id",
    [
      validatedRequest,
      requireFeature("enterprise_usage_policies"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const { id } = request.params;
        await UsagePolicies.delete({ id: Number(id) });
        response.status(200).json({ success: true, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/usage-policies/effective",
    [
      validatedRequest,
      requireFeature("enterprise_usage_policies"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const teamIds = parseIdList(request.query?.teamIds);
        const { rules, policies } = await UsagePolicies.resolveRulesFor({
          userId: parseIdFilter(request.query?.userId),
          workspaceId: parseIdFilter(request.query?.workspaceId),
          teamIds,
        });
        response.status(200).json({ rules, policies, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/usage/overview",
    [
      validatedRequest,
      requireFeature("enterprise_usage_monitoring"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const clause = usageBaseClause(request.query);
        const aggregate = await UsageEvents.aggregate(clause);
        response.status(200).json({
          summary: {
            events: aggregate?._count?.id || 0,
            promptTokens: aggregate?._sum?.promptTokens || 0,
            completionTokens: aggregate?._sum?.completionTokens || 0,
            totalTokens: aggregate?._sum?.totalTokens || 0,
            durationMs: aggregate?._sum?.durationMs || 0,
          },
          error: null,
        });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/usage/timeseries",
    [
      validatedRequest,
      requireFeature("enterprise_usage_monitoring"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const clause = usageBaseClause(request.query);
        const interval =
          String(request.query?.interval || "day").toLowerCase() === "hour"
            ? "hour"
            : "day";
        const events = await UsageEvents.where(clause, 10000, {
          occurredAt: "asc",
        });
        const buckets = {};
        for (const event of events) {
          const bucket = timeSeriesBucket(event.occurredAt, interval);
          if (!buckets[bucket]) {
            buckets[bucket] = {
              period: bucket,
              events: 0,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              durationMs: 0,
            };
          }
          buckets[bucket].events += 1;
          buckets[bucket].promptTokens += Number(event.promptTokens || 0);
          buckets[bucket].completionTokens += Number(
            event.completionTokens || 0
          );
          buckets[bucket].totalTokens += Number(event.totalTokens || 0);
          buckets[bucket].durationMs += Number(event.durationMs || 0);
        }

        response.status(200).json({
          interval,
          series: Object.values(buckets).sort((a, b) =>
            a.period.localeCompare(b.period)
          ),
          error: null,
        });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/usage/breakdown",
    [
      validatedRequest,
      requireFeature("enterprise_usage_monitoring"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const by = String(request.query?.by || "eventType");
        const validBy = [
          "eventType",
          "userId",
          "workspaceId",
          "teamId",
          "provider",
          "model",
          "mode",
        ];
        if (!validBy.includes(by))
          return response.status(400).json({
            breakdown: [],
            error: `Invalid breakdown field: ${by}`,
          });
        const clause = usageBaseClause(request.query);
        const breakdown = await UsageEvents.groupBy({
          by: [by],
          where: clause,
        });
        response.status(200).json({ breakdown, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/usage/export.csv",
    [
      validatedRequest,
      requireFeature("enterprise_usage_monitoring"),
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const clause = usageBaseClause(request.query);
        const events = await UsageEvents.where(clause, 50000, {
          occurredAt: "desc",
        });
        const headers = [
          "id",
          "occurredAt",
          "eventType",
          "userId",
          "workspaceId",
          "teamId",
          "apiKeyId",
          "provider",
          "model",
          "mode",
          "promptTokens",
          "completionTokens",
          "totalTokens",
          "durationMs",
        ];
        const rows = events.map((event) =>
          [
            event.id,
            new Date(event.occurredAt).toISOString(),
            event.eventType,
            event.userId ?? "",
            event.workspaceId ?? "",
            event.teamId ?? "",
            event.apiKeyId ?? "",
            event.provider ?? "",
            event.model ?? "",
            event.mode ?? "",
            event.promptTokens ?? 0,
            event.completionTokens ?? 0,
            event.totalTokens ?? 0,
            event.durationMs ?? "",
          ].join(",")
        );
        const csv = [headers.join(","), ...rows].join("\n");
        response.setHeader("Content-Type", "text/csv");
        response.setHeader(
          "Content-Disposition",
          "attachment; filename=\"usage-events.csv\""
        );
        response.status(200).send(csv);
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  // System preferences but only by array of labels
  app.get(
    "/admin/system-preferences-for",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const requestedSettings = {};
        const labels = request.query.labels?.split(",") || [];
        const needEmbedder = [
          "text_splitter_chunk_size",
          "max_embed_chunk_size",
        ];
        const noRecord = [
          "max_embed_chunk_size",
          "agent_sql_connections",
          "imported_agent_skills",
          "feature_flags",
          "meta_page_title",
          "meta_page_favicon",
        ];

        for (const label of labels) {
          // Skip any settings that are not explicitly defined as public
          if (!SystemSettings.publicFields.includes(label)) continue;

          // Only get the embedder if the setting actually needs it
          let embedder = needEmbedder.includes(label)
            ? getEmbeddingEngineSelection()
            : null;
          // Only get the record from db if the setting actually needs it
          let setting = noRecord.includes(label)
            ? null
            : await SystemSettings.get({ label });

          switch (label) {
            case "footer_data":
              requestedSettings[label] = setting?.value ?? JSON.stringify([]);
              break;
            case "support_email":
              requestedSettings[label] = setting?.value || null;
              break;
            case "text_splitter_chunk_size":
              requestedSettings[label] =
                setting?.value || embedder?.embeddingMaxChunkLength || null;
              break;
            case "text_splitter_chunk_overlap":
              requestedSettings[label] = setting?.value || null;
              break;
            case "max_embed_chunk_size":
              requestedSettings[label] =
                embedder?.embeddingMaxChunkLength || 1000;
              break;
            case "agent_search_provider":
              requestedSettings[label] = setting?.value || null;
              break;
            case "agent_sql_connections":
              requestedSettings[label] =
                await SystemSettings.agent_sql_connections();
              break;
            case "default_agent_skills":
              requestedSettings[label] = safeJsonParse(setting?.value, []);
              break;
            case "disabled_agent_skills":
              requestedSettings[label] = safeJsonParse(setting?.value, []);
              break;
            case "imported_agent_skills":
              requestedSettings[label] = ImportedPlugin.listImportedPlugins();
              break;
            case "custom_app_name":
              requestedSettings[label] = setting?.value || null;
              break;
            case "feature_flags":
              requestedSettings[label] =
                (await SystemSettings.getFeatureFlags()) || {};
              break;
            case "meta_page_title":
              requestedSettings[label] =
                await SystemSettings.getValueOrFallback({ label }, null);
              break;
            case "meta_page_favicon":
              requestedSettings[label] =
                await SystemSettings.getValueOrFallback({ label }, null);
              break;
            default:
              break;
          }
        }

        response.status(200).json({ settings: requestedSettings });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/system-preferences",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const updates = reqBody(request) || {};
        const accessError = systemPreferenceAccessError(
          response?.locals?.user?.role || null,
          updates
        );
        if (accessError)
          return response.status(403).json({
            success: false,
            error: accessError,
          });
        await SystemSettings.updateSettings(updates);
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/api-keys",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const apiKeys = await ApiKey.whereWithUser({});
        return response.status(200).json({
          apiKeys,
          error: null,
        });
      } catch (error) {
        console.error(error);
        response.status(500).json({
          apiKey: null,
          error: "Could not find an API Keys.",
        });
      }
    }
  );

  app.post(
    "/admin/generate-api-key",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const body = reqBody(request);
        const { apiKey, error } = await ApiKey.create({
          createdBy: user.id,
          name: body?.name || null,
          scopes: body?.scopes || [ApiKey.defaultScope],
          expiresAt: body?.expiresAt || null,
        });
        await EventLogs.logEvent(
          "api_key_created",
          { createdBy: user?.username },
          user?.id
        );
        return response.status(200).json({
          apiKey,
          error,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/api-keys/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { id } = request.params;
        if (!id || Number.isNaN(Number(id)))
          return response.status(400).json({
            success: false,
            error: "Invalid API key id.",
          });
        const updates = reqBody(request);
        const { apiKey, error } = await ApiKey.update(Number(id), updates);
        return response.status(200).json({
          success: !!apiKey,
          apiKey,
          error,
        });
      } catch (error) {
        console.error(error);
        response.status(500).json({
          success: false,
          apiKey: null,
          error: "Could not update API key.",
        });
      }
    }
  );

  app.delete(
    "/admin/delete-api-key/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { id } = request.params;
        if (!id || isNaN(Number(id))) return response.sendStatus(400).end();
        await ApiKey.delete({ id: Number(id) });

        await EventLogs.logEvent(
          "api_key_deleted",
          { deletedBy: response.locals?.user?.username },
          response?.locals?.user?.id
        );
        return response.status(200).end();
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { adminEndpoints };
