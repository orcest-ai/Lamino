import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const Admin = {
  // User Management
  users: async () => {
    return await fetch(`${API_BASE}/admin/users`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.users || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  newUser: async (data) => {
    return await fetch(`${API_BASE}/admin/users/new`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { user: null, error: e.message };
      });
  },
  updateUser: async (userId, data) => {
    return await fetch(`${API_BASE}/admin/user/${userId}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  deleteUser: async (userId) => {
    return await fetch(`${API_BASE}/admin/user/${userId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // Invitations
  invites: async () => {
    return await fetch(`${API_BASE}/admin/invites`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.invites || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  newInvite: async ({ role = null, workspaceIds = null }) => {
    return await fetch(`${API_BASE}/admin/invite/new`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        role,
        workspaceIds,
      }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { invite: null, error: e.message };
      });
  },
  disableInvite: async (inviteId) => {
    return await fetch(`${API_BASE}/admin/invite/${inviteId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // Workspaces Mgmt
  workspaces: async () => {
    return await fetch(`${API_BASE}/admin/workspaces`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.workspaces || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  workspaceUsers: async (workspaceId) => {
    return await fetch(`${API_BASE}/admin/workspaces/${workspaceId}/users`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.users || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  newWorkspace: async (name) => {
    return await fetch(`${API_BASE}/admin/workspaces/new`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ name }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { workspace: null, error: e.message };
      });
  },
  updateUsersInWorkspace: async (workspaceId, userIds = []) => {
    return await fetch(
      `${API_BASE}/admin/workspaces/${workspaceId}/update-users`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ userIds }),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  deleteWorkspace: async (workspaceId) => {
    return await fetch(`${API_BASE}/admin/workspaces/${workspaceId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // Team Management
  teams: async () => {
    return await fetch(`${API_BASE}/admin/teams`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.teams || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  team: async (teamId) => {
    return await fetch(`${API_BASE}/admin/teams/${teamId}`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.team || null)
      .catch((e) => {
        console.error(e);
        return null;
      });
  },
  newTeam: async (data = {}) => {
    return await fetch(`${API_BASE}/admin/teams/new`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { team: null, error: e.message };
      });
  },
  updateTeam: async (teamId, data = {}) => {
    return await fetch(`${API_BASE}/admin/teams/${teamId}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, team: null, error: e.message };
      });
  },
  deleteTeam: async (teamId) => {
    return await fetch(`${API_BASE}/admin/teams/${teamId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  updateTeamMembers: async (teamId, members = []) => {
    return await fetch(`${API_BASE}/admin/teams/${teamId}/update-members`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ members }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  updateTeamWorkspaces: async (teamId, workspaceIds = []) => {
    return await fetch(`${API_BASE}/admin/teams/${teamId}/update-workspaces`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ workspaceIds }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  teamAccessMap: async (teamId) => {
    return await fetch(`${API_BASE}/admin/teams/${teamId}/access-map`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.map || null)
      .catch((e) => {
        console.error(e);
        return null;
      });
  },

  // Prompt Engineering
  promptTemplates: async () => {
    return await fetch(`${API_BASE}/admin/prompt-templates`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.templates || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  newPromptTemplate: async (data = {}) => {
    return await fetch(`${API_BASE}/admin/prompt-templates/new`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { template: null, error: e.message };
      });
  },
  updatePromptTemplate: async (templateId, updates = {}) => {
    return await fetch(`${API_BASE}/admin/prompt-templates/${templateId}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, template: null, error: e.message };
      });
  },
  deletePromptTemplate: async (templateId) => {
    return await fetch(`${API_BASE}/admin/prompt-templates/${templateId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  promptTemplateVersions: async (templateId) => {
    return await fetch(`${API_BASE}/admin/prompt-templates/${templateId}/versions`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res?.versions || [])
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  newPromptTemplateVersion: async (templateId, data = {}) => {
    return await fetch(
      `${API_BASE}/admin/prompt-templates/${templateId}/versions/new`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify(data),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { version: null, error: e.message };
      });
  },
  approvePromptTemplateVersion: async (templateId, versionId) => {
    return await fetch(
      `${API_BASE}/admin/prompt-templates/${templateId}/versions/${versionId}/approve`,
      {
        method: "POST",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  applyPromptTemplateToWorkspace: async (templateId, data = {}) => {
    return await fetch(
      `${API_BASE}/admin/prompt-templates/${templateId}/apply-to-workspace`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify(data),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // System Preferences
  /**
   * Fetches system preferences by fields
   * @param {string[]} labels - Array of labels for settings
   * @returns {Promise<{settings: Object, error: string}>} - System preferences object
   */
  systemPreferencesByFields: async (labels = []) => {
    return await fetch(
      `${API_BASE}/admin/system-preferences-for?labels=${labels.join(",")}`,
      {
        method: "GET",
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return null;
      });
  },
  updateSystemPreferences: async (updates = {}) => {
    return await fetch(`${API_BASE}/admin/system-preferences`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // API Keys
  getApiKeys: async function () {
    return fetch(`${API_BASE}/admin/api-keys`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error fetching api keys.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { apiKeys: [], error: e.message };
      });
  },
  generateApiKey: async function ({
    name = null,
    scopes = ["*"],
    expiresAt = null,
  } = {}) {
    return fetch(`${API_BASE}/admin/generate-api-key`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ name, scopes, expiresAt }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error generating api key.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { apiKey: null, error: e.message };
      });
  },
  updateApiKey: async function (apiKeyId = "", updates = {}) {
    return fetch(`${API_BASE}/admin/api-keys/${apiKeyId}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, apiKey: null, error: e.message };
      });
  },
  deleteApiKey: async function (apiKeyId = "") {
    return fetch(`${API_BASE}/admin/delete-api-key/${apiKeyId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
};

export default Admin;
