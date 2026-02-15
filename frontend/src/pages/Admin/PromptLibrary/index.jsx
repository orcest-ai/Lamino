import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { TextT } from "@phosphor-icons/react";
import Admin from "@/models/admin";
import ModalWrapper from "@/components/ModalWrapper";
import CTAButton from "@/components/lib/CTAButton";
import { useModal } from "@/hooks/useModal";
import showToast from "@/utils/toast";

export default function AdminPromptLibrary() {
  const { isOpen, openModal, closeModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [teams, setTeams] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);

  const loadData = async () => {
    setLoading(true);
    const [foundTemplates, foundTeams, foundWorkspaces] = await Promise.all([
      Admin.promptTemplates(),
      Admin.teams(),
      Admin.workspaces(),
    ]);
    setTemplates(foundTemplates);
    setTeams(foundTeams);
    setWorkspaces(foundWorkspaces);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onDelete = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    const result = await Admin.deletePromptTemplate(template.id);
    if (!result?.success) {
      showToast(result?.error || "Delete failed.", "error");
      return;
    }
    showToast("Template deleted.", "success");
    await loadData();
  };

  const onAddVersion = async (template) => {
    const prompt = window.prompt("Paste the new prompt template text:");
    if (!prompt) return;
    const changelog = window.prompt("Version changelog (optional):") || "";
    const result = await Admin.newPromptTemplateVersion(template.id, {
      prompt,
      changelog,
      publish: true,
    });
    if (!result?.version) {
      showToast(result?.error || "Could not create template version.", "error");
      return;
    }
    showToast("Template version created.", "success");
    await loadData();
  };

  const onApply = async (template) => {
    const workspaceHint = workspaces
      .slice(0, 8)
      .map((workspace) => `${workspace.id}:${workspace.name}`)
      .join(", ");
    const value = window.prompt(
      `Apply to workspace id.\nExamples: ${workspaceHint}\n\nWorkspace ID:`
    );
    if (!value) return;
    const workspaceId = Number(value);
    if (Number.isNaN(workspaceId)) {
      showToast("Workspace ID must be numeric.", "error");
      return;
    }
    const result = await Admin.applyPromptTemplateToWorkspace(template.id, {
      workspaceId,
    });
    if (!result?.success) {
      showToast(result?.error || "Could not apply template.", "error");
      return;
    }
    showToast("Template applied to workspace.", "success");
  };

  const onTogglePublish = async (template) => {
    const result = await Admin.updatePromptTemplate(template.id, {
      isPublished: !template.isPublished,
    });
    if (!result?.success) {
      showToast(result?.error || "Could not update publish state.", "error");
      return;
    }
    showToast("Publish state updated.", "success");
    await loadData();
  };

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
                Prompt Engineering
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              Create reusable prompt templates, version them, and apply them to
              workspace system prompts.
            </p>
          </div>
          <div className="w-full justify-end flex">
            <CTAButton
              onClick={openModal}
              className="mt-3 mr-0 mb-4 md:-mb-14 z-10"
            >
              <TextT className="h-4 w-4" weight="bold" /> New Template
            </CTAButton>
          </div>
          <div className="overflow-x-auto mt-6">
            {loading ? (
              <Skeleton.default
                height="80vh"
                width="100%"
                highlightColor="var(--theme-bg-primary)"
                baseColor="var(--theme-bg-secondary)"
                count={1}
                className="w-full p-4 rounded-b-2xl rounded-tr-2xl rounded-tl-sm"
                containerClassName="flex w-full"
              />
            ) : (
              <table className="w-full text-xs text-left rounded-lg min-w-[820px] border-spacing-0">
                <thead className="text-theme-text-secondary text-xs leading-[18px] font-bold uppercase border-white/10 border-b">
                  <tr>
                    <th className="px-6 py-3 rounded-tl-lg">Template</th>
                    <th className="px-6 py-3">Scope</th>
                    <th className="px-6 py-3">Team</th>
                    <th className="px-6 py-3">Latest Version</th>
                    <th className="px-6 py-3">Published</th>
                    <th className="px-6 py-3 rounded-tr-lg">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 ? (
                    <tr className="bg-transparent text-theme-text-secondary text-sm font-medium">
                      <td colSpan="6" className="px-6 py-4 text-center">
                        No templates found.
                      </td>
                    </tr>
                  ) : (
                    templates.map((template) => {
                      const latestVersion = template?.versions?.[0] || null;
                      return (
                        <tr
                          key={template.id}
                          className="bg-transparent text-white text-opacity-80 text-xs font-medium border-b border-white/10 h-10"
                        >
                          <td className="px-6">
                            <p className="text-sm text-theme-text-primary">
                              {template.name}
                            </p>
                            <p className="text-xs text-theme-text-secondary mt-1">
                              {template.slug}
                            </p>
                          </td>
                          <td className="px-6 capitalize">{template.scope}</td>
                          <td className="px-6">
                            {teams.find((team) => team.id === template.teamId)
                              ?.name || "--"}
                          </td>
                          <td className="px-6">
                            {latestVersion ? `v${latestVersion.version}` : "--"}
                          </td>
                          <td className="px-6">
                            {template.isPublished ? "Yes" : "No"}
                          </td>
                          <td className="px-6">
                            <div className="flex items-center gap-x-3">
                              <button
                                onClick={() => onAddVersion(template)}
                                className="text-blue-300 hover:text-blue-200"
                              >
                                New Version
                              </button>
                              <button
                                onClick={() => onApply(template)}
                                className="text-emerald-300 hover:text-emerald-200"
                              >
                                Apply
                              </button>
                              <button
                                onClick={() => onTogglePublish(template)}
                                className="text-yellow-300 hover:text-yellow-200"
                              >
                                {template.isPublished ? "Unpublish" : "Publish"}
                              </button>
                              <button
                                onClick={() => onDelete(template)}
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
        <NewTemplateModal
          teams={teams}
          closeModal={closeModal}
          reload={loadData}
        />
      </ModalWrapper>
    </div>
  );
}

function NewTemplateModal({ teams = [], closeModal, reload }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("system");
  const [teamId, setTeamId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  const scopedTeams = useMemo(() => teams || [], [teams]);

  const onSave = async (e) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      showToast("Template name and prompt are required.", "error");
      return;
    }
    if (scope === "team" && !teamId) {
      showToast("Select a team for team-scoped templates.", "error");
      return;
    }
    setSaving(true);
    const { template, error } = await Admin.newPromptTemplate({
      name,
      description,
      scope,
      teamId: scope === "team" ? Number(teamId) : null,
      prompt,
      approved: true,
    });
    setSaving(false);
    if (!template) {
      showToast(error || "Template creation failed.", "error");
      return;
    }
    showToast("Template created.", "success");
    await reload();
    closeModal();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="relative w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border">
        <div className="relative p-6 border-b rounded-t border-theme-modal-border">
          <h3 className="text-xl font-semibold text-white">
            Create Prompt Template
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
                placeholder="Support Assistant - Strict Answers"
              />
            </div>
            <div>
              <label className="text-white text-sm font-semibold block mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
                placeholder="Optional description"
              />
            </div>
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
                <option value="user">User</option>
              </select>
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
                  {scopedTeams.map((team) => (
                    <option key={team.id} value={String(team.id)}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-white text-sm font-semibold block mb-2">
                Prompt Text
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5"
                placeholder="You are a strict enterprise support assistant..."
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
              {saving ? "Creating..." : "Create Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
