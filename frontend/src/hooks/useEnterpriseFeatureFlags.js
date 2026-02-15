import { useEffect, useMemo, useState } from "react";
import Admin from "@/models/admin";

const DEFAULT_FLAGS = {
  enterprise_teams: true,
  enterprise_prompt_library: true,
  enterprise_usage_monitoring: true,
  enterprise_usage_policies: true,
};

export default function useEnterpriseFeatureFlags() {
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState(DEFAULT_FLAGS);

  useEffect(() => {
    let active = true;
    async function loadFlags() {
      try {
        const response = await Admin.systemPreferencesByFields([
          "feature_flags",
        ]);
        const fetched = response?.settings?.feature_flags;
        if (!active) return;
        setFlags((prev) => ({
          ...prev,
          ...(fetched && typeof fetched === "object" ? fetched : {}),
        }));
      } finally {
        if (active) setLoading(false);
      }
    }
    loadFlags();
    return () => {
      active = false;
    };
  }, []);

  const isEnabled = useMemo(
    () => (feature) => flags?.[feature] !== false,
    [flags]
  );

  return { loading, flags, isEnabled };
}
