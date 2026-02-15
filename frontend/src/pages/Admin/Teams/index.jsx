import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { UsersThree } from "@phosphor-icons/react";
import Admin from "@/models/admin";
import ModalWrapper from "@/components/ModalWrapper";
import CTAButton from "@/components/lib/CTAButton";
import { useModal } from "@/hooks/useModal";
import showToast from "@/utils/toast";

export default function AdminTeams() {
  const { isOpen, openModal, closeModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeTeam, setActiveTeam] = useState(null);

  const loadData = async () => {
    setLoading(true);
    const [foundTeams, foundUsers, foundWorkspaces] = await Promise.all([
      Admin.teams(),
      Admin.users(),
      Admin.workspaces(),
    ]);
    setTeams(foundTeams);
    setUsers(foundUsers);
    setWorkspaces(foundWorkspaces);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onCreate = () => {
    setActiveTeam(null);
    openModal();
  };

  const onEdit = (team) => {
    setActiveTeam(team);
    openModal();
  };

  const onDelete = async (team) => {
    if (
      !window.confirm(
        `Delete team "${team.name}"?\nThis removes team membership and workspace assignments.`
      )
    )
      return;
    const result = await Admin.deleteTeam(team.id);
    if (!result?.success) {
      showToast(result?.error || "Failed deleting team.", "error");
      return;
    }
    showToast("Team deleted.", "success");
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
                Teams
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              Group users into teams and grant workspace access by team.
            </p>
          </div>
          <div className="w-full justify-end flex">
            <CTAButton
              onClick={onCreate}
              className="mt-3 mr-0 mb-4 md:-mb-14 z-10"
            >
              <UsersThree className="h-4 w-4" weight="bold" /> New Team
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
              <table className="w-full text-xs text-left rounded-lg min-w-[700px] border-spacing-0">
                <thead className="text-theme-text-secondary text-xs leading-[18px] font-bold uppercase border-white/10 border-b">
                  <tr>
                    <th className="px-6 py-3 rounded-tl-lg">Team</th>
                    <th className="px-6 py-3">Slug</th>
                    <th className="px-6 py-3">Members</th>
                    <th className="px-6 py-3">Workspaces</th>
                    <th className="px-6 py-3 rounded-tr-lg">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.length === 0 ? (
                    <tr className="bg-transparent text-theme-text-secondary text-sm font-medium">
                      <td colSpan="5" className="px-6 py-4 text-center">
                        No teams found.
                      </td>
                    </tr>
                  ) : (
                    teams.map((team) => (
                      <tr
                        key={team.id}
                        className="bg-transparent text-white text-opacity-80 text-xs font-medium border-b border-white/10 h-10"
                      >
                        <td className="px-6">
                          <p className="text-sm text-theme-text-primary">
                            {team.name}
                          </p>
                          {team.description && (
                            <p className="text-xs text-theme-text-secondary mt-1">
                              {team.description}
                            </p>
                          )}
                        </td>
                        <td className="px-6 text-theme-text-secondary">
                          {team.slug}
                        </td>
                        <td className="px-6">{team.members?.length ?? 0}</td>
                        <td className="px-6">{team.workspaces?.length ?? 0}</td>
                        <td className="px-6">
                          <div className="flex items-center gap-x-4">
                            <button
                              onClick={() => onEdit(team)}
                              className="text-blue-300 hover:text-blue-200"
                            >
                              Manage
                            </button>
                            <button
                              onClick={() => onDelete(team)}
                              className="text-red-300 hover:text-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <ModalWrapper isOpen={isOpen}>
        <TeamModal
          team={activeTeam}
          users={users}
          workspaces={workspaces}
          closeModal={closeModal}
          reload={loadData}
        />
      </ModalWrapper>
    </div>
  );
}

function TeamModal({
  team = null,
  users = [],
  workspaces = [],
  closeModal,
  reload,
}) {
  const [name, setName] = useState(team?.name || "");
  const [description, setDescription] = useState(team?.description || "");
  const [memberIds, setMemberIds] = useState(team?.userIds || []);
  const [workspaceIds, setWorkspaceIds] = useState(team?.workspaceIds || []);
  const [saving, setSaving] = useState(false);
  const isEdit = !!team?.id;

  useEffect(() => {
    setName(team?.name || "");
    setDescription(team?.description || "");
    setMemberIds(team?.userIds || []);
    setWorkspaceIds(team?.workspaceIds || []);
  }, [team]);

  const title = useMemo(
    () => (isEdit ? "Manage Team" : "Create Team"),
    [isEdit]
  );

  const onSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Team name is required.", "error");
      return;
    }
    setSaving(true);

    if (!isEdit) {
      const { team: createdTeam, error } = await Admin.newTeam({
        name,
        description,
        userIds: memberIds,
        workspaceIds,
      });
      setSaving(false);
      if (!createdTeam) {
        showToast(error || "Could not create team.", "error");
        return;
      }
      showToast("Team created.", "success");
      await reload();
      closeModal();
      return;
    }

    const [updateRes, membersRes, workspaceRes] = await Promise.all([
      Admin.updateTeam(team.id, { name, description }),
      Admin.updateTeamMembers(
        team.id,
        memberIds.map((id) => ({ userId: Number(id), role: "member" }))
      ),
      Admin.updateTeamWorkspaces(team.id, workspaceIds.map(Number)),
    ]);
    setSaving(false);

    if (!updateRes?.success || !membersRes?.success || !workspaceRes?.success) {
      showToast(
        updateRes?.error ||
          membersRes?.error ||
          workspaceRes?.error ||
          "Update failed.",
        "error"
      );
      return;
    }
    showToast("Team updated.", "success");
    await reload();
    closeModal();
  };

  const onMultiSelect = (setter) => (event) => {
    const values = Array.from(event.target.selectedOptions).map((opt) =>
      Number(opt.value)
    );
    setter(values);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="relative w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border">
        <div className="relative p-6 border-b rounded-t border-theme-modal-border">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
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
                placeholder="Engineering"
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
                placeholder="Team description (optional)"
              />
            </div>
            <div>
              <label className="text-white text-sm font-semibold block mb-2">
                Members
              </label>
              <select
                multiple
                value={memberIds.map(String)}
                onChange={onMultiSelect(setMemberIds)}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5 min-h-28"
              >
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.username} ({user.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white text-sm font-semibold block mb-2">
                Workspace Access
              </label>
              <select
                multiple
                value={workspaceIds.map(String)}
                onChange={onMultiSelect(setWorkspaceIds)}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg outline-none block w-full p-2.5 min-h-28"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={String(workspace.id)}>
                    {workspace.name}
                  </option>
                ))}
              </select>
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
              {saving ? "Saving..." : isEdit ? "Save Team" : "Create Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
