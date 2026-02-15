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
const {
  getVectorDbClass,
  getEmbeddingEngineSelection,
} = require("../utils/helpers");
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
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
        const updates = reqBody(request);
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
