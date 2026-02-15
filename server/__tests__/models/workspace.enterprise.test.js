const { Workspace } = require("../../models/workspace");

describe("Workspace enterprise access helpers", () => {
  it("includes direct and team membership clauses for non-admin users", () => {
    const clause = Workspace.membershipClauseForUser({ id: 12, role: "default" });
    expect(clause).toEqual({
      OR: [
        {
          workspace_users: {
            some: {
              user_id: 12,
            },
          },
        },
        {
          team_workspaces: {
            some: {
              team: {
                members: {
                  some: {
                    userId: 12,
                  },
                },
              },
            },
          },
        },
      ],
    });
  });

  it("returns empty clause for missing user context", () => {
    expect(Workspace.membershipClauseForUser(null)).toEqual({});
    expect(Workspace.membershipClauseForUser({})).toEqual({});
  });
});
