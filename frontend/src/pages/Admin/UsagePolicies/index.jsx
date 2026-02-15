import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { ShieldCheck } from "@phosphor-icons/react";
import Admin from "@/models/admin";
import ModalWrapper from "@/components/ModalWrapper";
import CTAButton from "@/components/lib/CTAButton";
import { useModal } from "@/hooks/useModal";
import showToast from "@/utils/toast";

export default function AdminUsagePolicies() {
  const { isOpen, openModal, closeModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [activePolicy, setActivePolicy] = useState(null);
  const [previewInput, setPreviewInput] = useState({
    userId: "",
    workspaceId: "",
    teamIds: "",
  });
  const [previewRules, setPreviewRules] = useState(null);

  const loadData = async () => {
    setLoading(true);
    const [foundPolicies, foundTeams, foundUsers, foundWorkspaces] =
      await Promise.all([
        Admin.usagePolicies(),
        Admin.teams(),
        Admin.users(),
        Admin.workspaces(),
      ]);
    setPolicies(foundPolicies);
    setTeams(foundTeams);
    setUsers(foundUsers);
    setWorkspaces(foundWorkspaces);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onCreate = () => {
    setActivePolicy(null);
    openModal();
  };

  const onEdit = (policy) => {
    setActivePolicy(policy);
    openModal();
  };

  const onDelete = async (policy) => {
    if (!window.confirm(`Delete policy "${policy.name}"?`)) return;
    const result = await Admin.deleteUsagePolicy(policy.id);
    if (!result?.success) {
      showToast(result?.error || "Could not delete policy.", "error");
      return;
    }
    showToast("Policy deleted.", "success");
    await loadData();
  };

  const previewEffective = async () => {
    const query = {};
    if (previewInput.userId) query.userId = previewInput.userId;
    if (previewInput.workspaceId) query.workspaceId = previewInput.workspaceId;
    if (previewInput.teamIds) query.teamIds = previewInput.teamIds;
    const result = await Admin.effectiveUsagePolicy(query);
    setPreviewRules(result);
  };

  const teamName = useMemo(
    () =>
      Object.fromEntries(
        teams.map((team) => [String(team.id), team.name || "--"])
      ),
    [teams]
  );
  const workspaceName = useMemo(
    () =>
      Object.fromEntries(
        workspaces.map((workspace) => [
          String(workspace.id),
          workspace.name || "--",
        ])
      ),
    [workspaces]
  );
  const userName = useMemo(
    () =>
      Object.fromEntries(
        users.map((user) => [
          String(user.id),
          user.username || `User ${user.id}`,
        ])
      ),
    [users]
  );

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-white/10 border-b-2">
            <div className="items-center flex gap-x-4">
              <p className="text-lg leading-6 font-bold text-theme-text-primary">
                Usage Policies
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              Create scope-based guardrails for model/provider usage, prompts,
              and daily limits.
            </p>
          </div>
          <div className="w-full justify-end flex">
            <CTAButton
              onClick={onCreate}
              className="mt-3 mr-0 mb-4 md:-mb-14 z-10"
            >
              <ShieldCheck className="h-4 w-4" weight="bold" /> New Policy
            </CTAButton>
          </div>

          <section className="rounded-lg border border-white/10 p-4 mt-6">
            <p className="text-sm text-theme-text-primary font-semibold">
              Effective Policy Preview
            </p>
            <p className="text-xs text-theme-text-secondary mt-1">
              Resolve merged rules for a user/workspace/team scope combination.
            </p>
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <input
                placeholder="userId"
                value={previewInput.userId}
                onChange={(e) =>
                  setPreviewInput((prev) => ({
                    ...prev,
                    userId: e.target.value,
                  }))
                }
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
              />
              <input
                placeholder="workspaceId"
                value={previewInput.workspaceId}
                onChange={(e) =>
                  setPreviewInput((prev) => ({
                    ...prev,
                    workspaceId: e.target.value,
                  }))
                }
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
              />
              <input
                placeholder="teamIds comma-separated"
                value={previewInput.teamIds}
                onChange={(e) =>
                  setPreviewInput((prev) => ({
                    ...prev,
                    teamIds: e.target.value,
                  }))
                }
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
              />
            </div>
            <div className="mt-3">
              <CTAButton onClick={previewEffective}>Resolve Policy</CTAButton>
            </div>
            {previewRules && (
              <pre className="mt-3 p-3 rounded bg-black/30 text-xs text-theme-text-primary overflow-auto">
                {JSON.stringify(previewRules.rules || {}, null, 2)}
              </pre>
            )}
          </section>

          <div className="overflow-x-auto mt-6">
            {loading ? (
              <Skeleton.default
                height="60vh"
                width="100%"
                highlightColor="var(--theme-bg-primary)"
                baseColor="var(--theme-bg-secondary)"
                count={1}
                className="w-full p-4 rounded-b-2xl rounded-tr-2xl rounded-tl-sm"
                containerClassName="flex w-full"
              />
            ) : (
              <table className="w-full text-xs text-left rounded-lg min-w-[900px] border-spacing-0">
                <thead className="text-theme-text-secondary text-xs leading-[18px] font-bold uppercase border-white/10 border-b">
                  <tr>
                    <th className="px-6 py-3 rounded-tl-lg">Policy</th>
                    <th className="px-6 py-3">Scope</th>
                    <th className="px-6 py-3">Target</th>
                    <th className="px-6 py-3">Priority</th>
                    <th className="px-6 py-3">Enabled</th>
                    <th className="px-6 py-3 rounded-tr-lg">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.length === 0 ? (
                    <tr className="bg-transparent text-theme-text-secondary text-sm font-medium">
                      <td colSpan="6" className="px-6 py-4 text-center">
                        No usage policies configured.
                      </td>
                    </tr>
                  ) : (
                    policies.map((policy) => {
                      const target =
                        policy.scope === "team"
                          ? teamName[String(policy.teamId)] ||
                            `team:${policy.teamId}`
                          : policy.scope === "workspace"
                            ? workspaceName[String(policy.workspaceId)] ||
                              `workspace:${policy.workspaceId}`
                            : policy.scope === "user"
                              ? userName[String(policy.userId)] ||
                                `user:${policy.userId}`
                              : "Global";
                      return (
                        <tr
                          key={policy.id}
                          className="bg-transparent text-white text-opacity-80 text-xs font-medium border-b border-white/10 h-10"
                        >
                          <td className="px-6">
                            <p className="text-sm text-theme-text-primary">
                              {policy.name}
                            </p>
                            {policy.description && (
                              <p className="text-xs text-theme-text-secondary mt-1">
                                {policy.description}
                              </p>
                            )}
                          </td>
                          <td className="px-6 capitalize">{policy.scope}</td>
                          <td className="px-6">{target}</td>
                          <td className="px-6">{policy.priority}</td>
                          <td className="px-6">
                            {policy.enabled ? "Yes" : "No"}
                          </td>
                          <td className="px-6">
                            <div className="flex items-center gap-x-4">
                              <button
                                onClick={() => onEdit(policy)}
                                className="text-blue-300 hover:text-blue-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => onDelete(policy)}
                                className="text-red-300 hover:text-red-200"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <ModalWrapper isOpen={isOpen}>
        <UsagePolicyModal
          policy={activePolicy}
          teams={teams}
          users={users}
          workspaces={workspaces}
          closeModal={closeModal}
          reload={loadData}
        />
      </ModalWrapper>
    </div>
  );
}

function UsagePolicyModal({
  policy = null,
  teams = [],
  users = [],
  workspaces = [],
  closeModal,
  reload,
}) {
  const isEdit = !!policy?.id;
  const [name, setName] = useState(policy?.name || "");
  const [description, setDescription] = useState(policy?.description || "");
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [scope, setScope] = useState(policy?.scope || "system");
  const [teamId, setTeamId] = useState(
    policy?.teamId ? String(policy.teamId) : ""
  );
  const [workspaceId, setWorkspaceId] = useState(
    policy?.workspaceId ? String(policy.workspaceId) : ""
  );
  const [userId, setUserId] = useState(
    policy?.userId ? String(policy.userId) : ""
  );
  const [priority, setPriority] = useState(policy?.priority ?? 100);
  const [rulesText, setRulesText] = useState(policy?.rules || "{}");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(policy?.name || "");
    setDescription(policy?.description || "");
    setEnabled(policy?.enabled ?? true);
    setScope(policy?.scope || "system");
    setTeamId(policy?.teamId ? String(policy.teamId) : "");
    setWorkspaceId(policy?.workspaceId ? String(policy.workspaceId) : "");
    setUserId(policy?.userId ? String(policy.userId) : "");
    setPriority(policy?.priority ?? 100);
    setRulesText(policy?.rules || "{}");
  }, [policy]);

  const onSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Policy name is required.", "error");
      return;
    }
    let parsedRules = {};
    try {
      parsedRules = JSON.parse(rulesText || "{}");
    } catch {
      showToast("Rules must be valid JSON.", "error");
      return;
    }
    const payload = {
      name,
      description,
      enabled,
      scope,
      priority: Number(priority || 100),
      rules: parsedRules,
      teamId: scope === "team" ? Number(teamId || 0) || null : null,
      workspaceId:
        scope === "workspace" ? Number(workspaceId || 0) || null : null,
      userId: scope === "user" ? Number(userId || 0) || null : null,
    };
    setSaving(true);

    const result = isEdit
      ? await Admin.updateUsagePolicy(policy.id, payload)
      : await Admin.newUsagePolicy(payload);
    setSaving(false);
    if (!(isEdit ? result?.success : result?.policy)) {
      showToast(result?.error || "Could not save policy.", "error");
      return;
    }
    showToast(isEdit ? "Policy updated." : "Policy created.", "success");
    await reload();
    closeModal();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="relative w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border">
        <div className="relative p-6 border-b rounded-t border-theme-modal-border">
          <h3 className="text-xl font-semibold text-white">
            {isEdit ? "Edit Usage Policy" : "Create Usage Policy"}
          </h3>
        </div>
        <form onSubmit={onSave} className="px-7 py-6">
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <label className="text-white text-sm font-semibold block mb-2">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
                placeholder="Daily Team Chat Limit"
              />
            </div>
            <div>
              <label className="text-white text-sm font-semibold block mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-white text-sm font-semibold block mb-2">
                  Scope
                </label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
                >
                  <option value="system">System</option>
                  <option value="team">Team</option>
                  <option value="workspace">Workspace</option>
                  <option value="user">User</option>
                </select>
              </div>
              <div>
                <label className="text-white text-sm font-semibold block mb-2">
                  Priority
                </label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value || 100))}
                  className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
                />
              </div>
            </div>
            {scope === "team" && (
              <div>
                <label className="text-white text-sm font-semibold block mb-2">
                  Team
                </label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
                >
                  <option value="">Select team...</option>
                  {teams.map((team) => (
                    <option key={team.id} value={String(team.id)}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {scope === "workspace" && (
              <div>
                <label className="text-white text-sm font-semibold block mb-2">
                  Workspace
                </label>
                <select
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
                >
                  <option value="">Select workspace...</option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={String(workspace.id)}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {scope === "user" && (
              <div>
                <label className="text-white text-sm font-semibold block mb-2">
                  User
                </label>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
                >
                  <option value="">Select user...</option>
                  {users.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.username}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-x-2">
              <input
                id="policy-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <label htmlFor="policy-enabled" className="text-sm text-white">
                Enabled
              </label>
            </div>
            <div>
              <label className="text-white text-sm font-semibold block mb-2">
                Rules (JSON)
              </label>
              <textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={10}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5 font-mono"
                placeholder='{"allowedProviders":["openai"],"maxChatsPerDay":100}'
              />
            </div>
          </div>
          <div className="flex justify-end items-center mt-6 pt-6 border-t border-theme-modal-border">
            <button
              onClick={closeModal}
              type="button"
              className="transition-all duration-300 text-white hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm mr-2"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm disabled:opacity-60"
            >
              {saving ? "Saving..." : isEdit ? "Save Policy" : "Create Policy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
