import { useEffect, useState } from "react";
import Admin from "@/models/admin";
import showToast from "@/utils/toast";
import { Trash } from "@phosphor-icons/react";
import { userFromStorage } from "@/utils/request";
import System from "@/models/system";

export default function ApiKeyRow({ apiKey, removeApiKey, reload }) {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const user = userFromStorage();
  const Model = !!user ? Admin : System;
  const scopeList = Array.isArray(apiKey?.scopes)
    ? apiKey.scopes
    : typeof apiKey?.scopes === "string"
      ? apiKey.scopes
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : ["*"];

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Are you sure you want to deactivate this api key?\nAfter you do this it will not longer be useable.\n\nThis action is irreversible.`
      )
    )
      return false;

    await Model.deleteApiKey(apiKey.id);
    showToast("API Key permanently deleted", "info");
    removeApiKey(apiKey.id);
  };

  const toggleRevocation = async () => {
    if (!Model?.updateApiKey) {
      showToast("Revocation controls unavailable in this mode.", "warning");
      return;
    }
    setUpdating(true);
    const revokeNow = !apiKey?.isRevoked;
    const { success, error } = await Model.updateApiKey(apiKey.id, {
      revokedAt: revokeNow ? new Date().toISOString() : null,
    });
    setUpdating(false);
    if (!success) {
      showToast(error || "Could not update API key.", "error");
      return;
    }
    showToast(revokeNow ? "API key revoked." : "API key restored.", "success");
    if (typeof reload === "function") reload();
  };

  const copyApiKey = () => {
    if (!apiKey) return false;
    window.navigator.clipboard.writeText(apiKey.secret);
    showToast("API Key copied to clipboard", "success");
    setCopied(true);
  };

  useEffect(() => {
    function resetStatus() {
      if (!copied) return false;
      setTimeout(() => {
        setCopied(false);
      }, 3000);
    }
    resetStatus();
  }, [copied]);

  return (
    <>
      <tr className="bg-transparent text-white text-opacity-80 text-xs font-medium border-b border-white/10 h-10">
        <td scope="row" className="px-6 whitespace-nowrap">
          <p className="text-theme-text-primary">
            {apiKey.name || "Untitled Key"}
          </p>
          <p className="text-theme-text-secondary text-xs mt-1">
            {apiKey.secret}
          </p>
        </td>
        <td className="px-6 text-left">{scopeList.join(", ") || "*"}</td>
        <td className="px-6 text-left">{apiKey.createdBy?.username || "--"}</td>
        <td className="px-6">{apiKey.expiresAt || "--"}</td>
        <td className="px-6">
          {apiKey.isRevoked
            ? "Revoked"
            : apiKey.isExpired
              ? "Expired"
              : "Active"}
        </td>
        <td className="px-6">{apiKey.createdAt}</td>
        <td className="px-6 flex items-center gap-x-6 h-full mt-1">
          <button
            onClick={copyApiKey}
            disabled={copied}
            className="text-xs font-medium text-blue-300 rounded-lg hover:text-white hover:light:text-blue-500 hover:text-opacity-60 hover:underline"
          >
            {copied ? "Copied" : "Copy API Key"}
          </button>
          <button
            onClick={handleDelete}
            className="text-xs font-medium text-white/80 light:text-black/80 hover:light:text-red-500 hover:text-red-300 rounded-lg px-2 py-1 hover:bg-white hover:light:bg-red-50 hover:bg-opacity-10"
          >
            <Trash className="h-5 w-5" />
          </button>
          {!!Model?.updateApiKey && (
            <button
              onClick={toggleRevocation}
              disabled={updating}
              className="text-xs font-medium text-yellow-300 hover:text-yellow-200 disabled:opacity-60"
            >
              {apiKey?.isRevoked ? "Restore" : "Revoke"}
            </button>
          )}
        </td>
      </tr>
    </>
  );
}
