const { EventLogs } = require("../../../models/eventLogs");
const { Invite } = require("../../../models/invite");
const { SystemSettings } = require("../../../models/systemSettings");
const { User } = require("../../../models/user");
const { Workspace } = require("../../../models/workspace");
const { WorkspaceChats } = require("../../../models/workspaceChats");
const { WorkspaceUser } = require("../../../models/workspaceUsers");
const { Team } = require("../../../models/team");
const { TeamMember } = require("../../../models/teamMembers");
const { TeamWorkspace } = require("../../../models/teamWorkspaces");
const { PromptTemplate } = require("../../../models/promptTemplate");
const { PromptTemplateVersion } = require("../../../models/promptTemplateVersion");
const { UsageEvents } = require("../../../models/usageEvents");
const { UsagePolicies } = require("../../../models/usagePolicies");
const { canModifyAdmin } = require("../../../utils/helpers/admin");
const { multiUserMode, reqBody } = require("../../../utils/http");
const { validApiKey } = require("../../../utils/middleware/validApiKey");
const { requireFeature } = require("../../../utils/middleware/featureGate");

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

async function promptTemplateAccessClause(createdBy = null) {
  if (!createdBy) return { scope: "system" };
  const memberships = await TeamMember.where({ userId: Number(createdBy) });
  const teamIds = memberships.map((membership) => membership.teamId);
  return {
    OR: [
      { scope: "system" },
      { createdBy: Number(createdBy) },
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

function usageTimeRange(query = {}) {
  const days = Number(query?.days || 30);
  const to = query?.to ? new Date(query.to) : new Date();
  const from = query?.from
    ? new Date(query.from)
    : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

function usageBaseClause(query = {}) {
  const { from, to } = usageTimeRange(query);
  const clause = {
    occurredAt: {
      gte: from,
      lte: to,
    },
  };
  if (query?.userId) clause.userId = Number(query.userId);
  if (query?.workspaceId) clause.workspaceId = Number(query.workspaceId);
  if (query?.teamId) clause.teamId = Number(query.teamId);
  if (query?.eventType) clause.eventType = String(query.eventType);
  if (query?.provider) clause.provider = String(query.provider);
  if (query?.model) clause.model = String(query.model);
  return clause;
}

function timeSeriesBucket(date = new Date(), interval = "day") {
  const iso = new Date(date).toISOString();
  if (interval === "hour") return iso.slice(0, 13) + ":00";
  return iso.slice(0, 10);
}

function apiAdminEndpoints(app) {
  if (!app) return;

  app.get("/v1/admin/is-multi-user-mode", [validApiKey], (_, response) => {
    /*
    #swagger.tags = ['Admin']
    #swagger.description = 'Check to see if the instance is in multi-user-mode first. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
             "isMultiUser": true
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
    */
    const isMultiUser = multiUserMode(response);
    response.status(200).json({ isMultiUser });
  });

  app.get("/v1/admin/users", [validApiKey], async (request, response) => {
    /*
    #swagger.tags = ['Admin']
    #swagger.description = 'Check to see if the instance is in multi-user-mode first. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
             "users": [
                {
                  username: "sample-sam",
                  role: 'default',
                }
             ]
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }

      const users = await User.where();
      response.status(200).json({ users });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.post("/v1/admin/users/new", [validApiKey], async (request, response) => {
    /*
    #swagger.tags = ['Admin']
    #swagger.description = 'Create a new user with username and password. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.requestBody = {
        description: 'Key pair object that will define the new user to add to the system.',
        required: true,
        content: {
          "application/json": {
            example: {
              username: "sample-sam",
              password: 'hunter2',
              role: 'default | admin'
            }
          }
        }
      }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              user: {
                id: 1,
                username: 'sample-sam',
                role: 'default',
              },
              error: null,
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }

      const newUserParams = reqBody(request);
      const { user: newUser, error } = await User.create(newUserParams);
      response.status(newUser ? 200 : 400).json({ user: newUser, error });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.post("/v1/admin/users/:id", [validApiKey], async (request, response) => {
    /*
    #swagger.tags = ['Admin']
    #swagger.parameters['id'] = {
      in: 'path',
      description: 'id of the user in the database.',
      required: true,
      type: 'string'
    }
    #swagger.description = 'Update existing user settings. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.requestBody = {
        description: 'Key pair object that will update the found user. All fields are optional and will not update unless specified.',
        required: true,
        content: {
          "application/json": {
            example: {
              username: "sample-sam",
              password: 'hunter2',
              role: 'default | admin',
              suspended: 0,
            }
          }
        }
      }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              success: true,
              error: null,
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }

      const { id } = request.params;
      const updates = reqBody(request);
      const user = await User.get({ id: Number(id) });
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
  });

  app.delete(
    "/v1/admin/users/:id",
    [validApiKey],
    async (request, response) => {
      /*
    #swagger.tags = ['Admin']
    #swagger.description = 'Delete existing user by id. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.parameters['id'] = {
      in: 'path',
      description: 'id of the user in the database.',
      required: true,
      type: 'string'
    }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              success: true,
              error: null,
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }

        const { id } = request.params;
        const user = await User.get({ id: Number(id) });
        await User.delete({ id: user.id });
        await EventLogs.logEvent("api_user_deleted", {
          userName: user.username,
        });
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get("/v1/admin/invites", [validApiKey], async (request, response) => {
    /*
    #swagger.tags = ['Admin']
    #swagger.description = 'List all existing invitations to instance regardless of status. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
             "invites": [
                {
                  id: 1,
                  status: "pending",
                  code: 'abc-123',
                  claimedBy: null
                }
             ]
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }

      const invites = await Invite.whereWithUsers();
      response.status(200).json({ invites });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.post("/v1/admin/invite/new", [validApiKey], async (request, response) => {
    /*
    #swagger.tags = ['Admin']
    #swagger.description = 'Create a new invite code for someone to use to register with instance. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.requestBody = {
        description: 'Request body for creation parameters of the invitation',
        required: false,
        content: {
          "application/json": {
            example: {
              workspaceIds: [1,2,45],
            }
          }
        }
      }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              invite: {
                id: 1,
                status: "pending",
                code: 'abc-123',
              },
              error: null,
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }

      const body = reqBody(request);
      const { invite, error } = await Invite.create({
        workspaceIds: body?.workspaceIds ?? [],
      });
      response.status(200).json({ invite, error });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.delete(
    "/v1/admin/invite/:id",
    [validApiKey],
    async (request, response) => {
      /*
    #swagger.tags = ['Admin']
    #swagger.description = 'Deactivates (soft-delete) invite by id. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.parameters['id'] = {
      in: 'path',
      description: 'id of the invite in the database.',
      required: true,
      type: 'string'
    }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              success: true,
              error: null,
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }

        const { id } = request.params;
        const { success, error } = await Invite.deactivate(id);
        response.status(200).json({ success, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/v1/admin/workspaces/:workspaceId/users",
    [validApiKey],
    async (request, response) => {
      /*
      #swagger.tags = ['Admin']
      #swagger.parameters['workspaceId'] = {
        in: 'path',
        description: 'id of the workspace.',
        required: true,
        type: 'string'
      }
      #swagger.description = 'Retrieve a list of users with permissions to access the specified workspace.'
      #swagger.responses[200] = {
        content: {
          "application/json": {
            schema: {
              type: 'object',
              example: {
                users: [
                  {"userId": 1, "role": "admin"},
                  {"userId": 2, "role": "member"}
                ]
              }
            }
          }
        }
      }
      #swagger.responses[403] = {
        schema: {
          "$ref": "#/definitions/InvalidAPIKey"
        }
      }
       #swagger.responses[401] = {
        description: "Instance is not in Multi-User mode. Method denied",
      }
      */

      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }

        const workspaceId = request.params.workspaceId;
        const users = await Workspace.workspaceUsers(workspaceId);

        response.status(200).json({ users });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/v1/admin/workspaces/:workspaceId/update-users",
    [validApiKey],
    async (request, response) => {
      /*
    #swagger.tags = ['Admin']
    #swagger.deprecated = true
    #swagger.parameters['workspaceId'] = {
      in: 'path',
      description: 'id of the workspace in the database.',
      required: true,
      type: 'string'
    }
    #swagger.description = 'Overwrite workspace permissions to only be accessible by the given user ids and admins. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.requestBody = {
        description: 'Entire array of user ids who can access the workspace. All fields are optional and will not update unless specified.',
        required: true,
        content: {
          "application/json": {
            example: {
              userIds: [1,2,4,12],
            }
          }
        }
      }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              success: true,
              error: null,
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }

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

  app.post(
    "/v1/admin/workspaces/:workspaceSlug/manage-users",
    [validApiKey],
    async (request, response) => {
      /*
    #swagger.tags = ['Admin']
    #swagger.parameters['workspaceSlug'] = {
      in: 'path',
      description: 'slug of the workspace in the database',
      required: true,
      type: 'string'
    }
    #swagger.description = 'Set workspace permissions to be accessible by the given user ids and admins. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.requestBody = {
        description: 'Array of user ids who will be given access to the target workspace. <code>reset</code> will remove all existing users from the workspace and only add the new users - default <code>false</code>.',
        required: true,
        content: {
          "application/json": {
            example: {
              userIds: [1,2,4,12],
              reset: false
            }
          }
        }
      }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              success: true,
              error: null,
              users: [
                {"userId": 1, "username": "main-admin", "role": "admin"},
                {"userId": 2, "username": "sample-sam", "role": "default"}
              ]
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }

        const { workspaceSlug } = request.params;
        const { userIds: _uids, reset = false } = reqBody(request);
        const userIds = (
          await User.where({ id: { in: _uids.map(Number) } })
        ).map((user) => user.id);
        const workspace = await Workspace.get({ slug: String(workspaceSlug) });
        const workspaceUsers = await Workspace.workspaceUsers(workspace.id);

        if (!workspace) {
          response.status(404).json({
            success: false,
            error: `Workspace ${workspaceSlug} not found`,
            users: workspaceUsers,
          });
          return;
        }

        if (userIds.length === 0) {
          response.status(404).json({
            success: false,
            error: `No valid user IDs provided.`,
            users: workspaceUsers,
          });
          return;
        }

        // Reset all users in the workspace and add the new users as the only users in the workspace
        if (reset) {
          const { success, error } = await Workspace.updateUsers(
            workspace.id,
            userIds
          );
          return response.status(200).json({
            success,
            error,
            users: await Workspace.workspaceUsers(workspace.id),
          });
        }

        // Add new users to the workspace if they are not already in the workspace
        const existingUserIds = workspaceUsers.map((user) => user.userId);
        const usersToAdd = userIds.filter(
          (userId) => !existingUserIds.includes(userId)
        );
        if (usersToAdd.length > 0)
          await WorkspaceUser.createManyUsers(usersToAdd, workspace.id);
        response.status(200).json({
          success: true,
          error: null,
          users: await Workspace.workspaceUsers(workspace.id),
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/v1/admin/teams",
    [validApiKey, requireFeature("enterprise_teams")],
    async (_request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
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
    } catch (error) {
      console.error(error);
      response.sendStatus(500).end();
    }
  });

  app.post(
    "/v1/admin/teams/new",
    [validApiKey, requireFeature("enterprise_teams")],
    async (request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
      const body = reqBody(request);
      const { team, error } = await Team.new({
        name: body?.name,
        description: body?.description,
        createdBy: response.locals?.apiKey?.createdBy || null,
      });
      if (!team) return response.status(200).json({ team: null, error });

      const members = sanitizeMemberPayload(body?.members || body?.userIds || []);
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

      response.status(200).json({ team, error: null });
    } catch (error) {
      console.error(error);
      response.sendStatus(500).end();
    }
  });

  app.post(
    "/v1/admin/teams/:teamId",
    [validApiKey, requireFeature("enterprise_teams")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { teamId } = request.params;
        const existing = await Team.get({ id: Number(teamId) });
        if (!existing)
          return response.status(404).json({
            success: false,
            error: "Team not found.",
          });
        const { team, error } = await Team.update(teamId, reqBody(request));
        response.status(200).json({ success: !!team, team, error });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/v1/admin/teams/:teamId",
    [validApiKey, requireFeature("enterprise_teams")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { teamId } = request.params;
        const existing = await Team.get({ id: Number(teamId) });
        if (!existing)
          return response.status(404).json({
            success: false,
            error: "Team not found.",
          });
        await Team.delete({ id: Number(teamId) });
        response.status(200).json({ success: true, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/v1/admin/teams/:teamId/update-members",
    [validApiKey, requireFeature("enterprise_teams")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { teamId } = request.params;
        const existing = await Team.get({ id: Number(teamId) });
        if (!existing)
          return response.status(404).json({
            success: false,
            error: "Team not found.",
          });
        const body = reqBody(request);
        const members = sanitizeMemberPayload(
          body?.members || body?.userIds || []
        );
        await TeamMember.delete({ teamId: Number(teamId) });
        for (const member of members) {
          await TeamMember.upsert({
            teamId: Number(teamId),
            userId: member.userId,
            role: member.role || "member",
          });
        }
        response.status(200).json({ success: true, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/v1/admin/teams/:teamId/update-workspaces",
    [validApiKey, requireFeature("enterprise_teams")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { teamId } = request.params;
        const existing = await Team.get({ id: Number(teamId) });
        if (!existing)
          return response.status(404).json({
            success: false,
            error: "Team not found.",
          });
        const body = reqBody(request);
        const workspaceIds = sanitizeIdArray(body?.workspaceIds || []);
        await TeamWorkspace.delete({ teamId: Number(teamId) });
        if (workspaceIds.length > 0) {
          await TeamWorkspace.createManyWorkspaces({
            teamId: Number(teamId),
            workspaceIds,
          });
        }
        response.status(200).json({ success: true, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/v1/admin/prompt-templates",
    [validApiKey, requireFeature("enterprise_prompt_library")],
    async (_request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const clause = await promptTemplateAccessClause(
          response.locals?.apiKey?.createdBy || null
        );
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
    "/v1/admin/prompt-templates/new",
    [validApiKey, requireFeature("enterprise_prompt_library")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const body = reqBody(request);
        const createdBy = response.locals?.apiKey?.createdBy || null;
        const { template, error } = await PromptTemplate.new({
          name: body?.name,
          description: body?.description,
          scope: body?.scope || "system",
          teamId: body?.teamId || null,
          createdBy,
        });
        if (!template) return response.status(200).json({ template: null, error });

        if (body?.prompt) {
          await PromptTemplateVersion.create({
            templateId: template.id,
            prompt: body.prompt,
            changelog: body?.changelog || "Initial template version",
            createdBy,
            approvedBy: body?.approved ? createdBy : null,
          });
        }
        response.status(200).json({ template, error: null });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/v1/admin/prompt-templates/:templateId",
    [validApiKey, requireFeature("enterprise_prompt_library")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { templateId } = request.params;
        const clause = await promptTemplateAccessClause(
          response.locals?.apiKey?.createdBy || null
        );
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
        response.status(200).json({ success: !!template, template, error });
      } catch (error) {
        console.error(error);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/v1/admin/prompt-templates/:templateId",
    [validApiKey, requireFeature("enterprise_prompt_library")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { templateId } = request.params;
        const clause = await promptTemplateAccessClause(
          response.locals?.apiKey?.createdBy || null
        );
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
    "/v1/admin/prompt-templates/:templateId/versions",
    [validApiKey, requireFeature("enterprise_prompt_library")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { templateId } = request.params;
        const clause = await promptTemplateAccessClause(
          response.locals?.apiKey?.createdBy || null
        );
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
    "/v1/admin/prompt-templates/:templateId/versions/new",
    [validApiKey, requireFeature("enterprise_prompt_library")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { templateId } = request.params;
        const clause = await promptTemplateAccessClause(
          response.locals?.apiKey?.createdBy || null
        );
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
        const createdBy = response.locals?.apiKey?.createdBy || null;
        const { version, error } = await PromptTemplateVersion.create({
          templateId: Number(templateId),
          prompt: body?.prompt,
          changelog: body?.changelog || null,
          createdBy,
          approvedBy: body?.approved ? createdBy : null,
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
    "/v1/admin/prompt-templates/:templateId/versions/:versionId/approve",
    [validApiKey, requireFeature("enterprise_prompt_library")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { templateId, versionId } = request.params;
        const clause = await promptTemplateAccessClause(
          response.locals?.apiKey?.createdBy || null
        );
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
          response.locals?.apiKey?.createdBy || null
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
    "/v1/admin/prompt-templates/:templateId/apply-to-workspace",
    [validApiKey, requireFeature("enterprise_prompt_library")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const { templateId } = request.params;
        const body = reqBody(request);
        const createdBy = response.locals?.apiKey?.createdBy || null;
        const clause = await promptTemplateAccessClause(createdBy);
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

        const user = createdBy ? await User.get({ id: Number(createdBy) }) : null;
        await Workspace.trackChange(previousWorkspace, updatedWorkspace, user);
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
    "/v1/admin/usage-policies",
    [validApiKey, requireFeature("enterprise_usage_policies")],
    async (_request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
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
  });

  app.post(
    "/v1/admin/usage-policies/new",
    [validApiKey, requireFeature("enterprise_usage_policies")],
    async (request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
      const body = reqBody(request);
      const { policy, error } = await UsagePolicies.new({
        ...body,
        createdBy: response.locals?.apiKey?.createdBy || null,
      });
      response.status(200).json({ policy, error });
    } catch (error) {
      console.error(error);
      response.sendStatus(500).end();
    }
  });

  app.post(
    "/v1/admin/usage-policies/:id",
    [validApiKey, requireFeature("enterprise_usage_policies")],
    async (request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
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
  });

  app.delete(
    "/v1/admin/usage-policies/:id",
    [validApiKey, requireFeature("enterprise_usage_policies")],
    async (request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
      const { id } = request.params;
      await UsagePolicies.delete({ id: Number(id) });
      response.status(200).json({ success: true, error: null });
    } catch (error) {
      console.error(error);
      response.sendStatus(500).end();
    }
  });

  app.get(
    "/v1/admin/usage-policies/effective",
    [validApiKey, requireFeature("enterprise_usage_policies")],
    async (request, response) => {
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }
        const teamIds = request.query?.teamIds
          ? String(request.query.teamIds)
              .split(",")
              .map((id) => Number(id))
              .filter((id) => !Number.isNaN(id))
          : [];
        const { rules, policies } = await UsagePolicies.resolveRulesFor({
          userId: request.query?.userId ? Number(request.query.userId) : null,
          workspaceId: request.query?.workspaceId
            ? Number(request.query.workspaceId)
            : null,
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
    "/v1/admin/usage/overview",
    [validApiKey, requireFeature("enterprise_usage_monitoring")],
    async (request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
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
  });

  app.get(
    "/v1/admin/usage/timeseries",
    [validApiKey, requireFeature("enterprise_usage_monitoring")],
    async (request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
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
        buckets[bucket].completionTokens += Number(event.completionTokens || 0);
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
  });

  app.get(
    "/v1/admin/usage/breakdown",
    [validApiKey, requireFeature("enterprise_usage_monitoring")],
    async (request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
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
      const breakdown = await UsageEvents.groupBy({ by: [by], where: clause });
      response.status(200).json({ breakdown, error: null });
    } catch (error) {
      console.error(error);
      response.sendStatus(500).end();
    }
  });

  app.get(
    "/v1/admin/usage/export.csv",
    [validApiKey, requireFeature("enterprise_usage_monitoring")],
    async (request, response) => {
    try {
      if (!multiUserMode(response)) {
        response.sendStatus(401).end();
        return;
      }
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
  });

  app.post(
    "/v1/admin/workspace-chats",
    [validApiKey],
    async (request, response) => {
      /*
    #swagger.tags = ['Admin']
    #swagger.description = 'All chats in the system ordered by most recent. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.requestBody = {
        description: 'Page offset to show of workspace chats. All fields are optional and will not update unless specified.',
        required: false,
        content: {
          "application/json": {
            example: {
              offset: 2,
            }
          }
        }
      }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              success: true,
              error: null,
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
    */
      try {
        const pgSize = 20;
        const { offset = 0 } = reqBody(request);
        const chats = await WorkspaceChats.whereWithData(
          {},
          pgSize,
          offset * pgSize,
          { id: "desc" }
        );

        const hasPages = (await WorkspaceChats.count()) > (offset + 1) * pgSize;
        response.status(200).json({ chats: chats, hasPages });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/v1/admin/preferences",
    [validApiKey],
    async (request, response) => {
      /*
    #swagger.tags = ['Admin']
    #swagger.description = 'Update multi-user preferences for instance. Methods are disabled until multi user mode is enabled via the UI.'
    #swagger.requestBody = {
      description: 'Object with setting key and new value to set. All keys are optional and will not update unless specified.',
      required: true,
      content: {
        "application/json": {
          example: {
            support_email: "support@example.com",
          }
        }
      }
    }
    #swagger.responses[200] = {
      content: {
        "application/json": {
          schema: {
            type: 'object',
            example: {
              success: true,
              error: null,
            }
          }
        }
      }
    }
    #swagger.responses[403] = {
      schema: {
        "$ref": "#/definitions/InvalidAPIKey"
      }
    }
     #swagger.responses[401] = {
      description: "Instance is not in Multi-User mode. Method denied",
    }
    */
      try {
        if (!multiUserMode(response)) {
          response.sendStatus(401).end();
          return;
        }

        const updates = reqBody(request);
        await SystemSettings.updateSettings(updates);
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { apiAdminEndpoints };
