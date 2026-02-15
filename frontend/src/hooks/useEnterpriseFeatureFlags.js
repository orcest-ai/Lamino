import { useEffect, useMemo, useState } from "react";
import Admin from "@/models/admin";

const DEFAULT_FLAGS = {
  enterprise_teams: true,
  enterprise_prompt_library: true,
  enterprise_usage_monitoring: true,
  enterprise_usage_policies: true,
};
const CACHE_KEY = "anythingllm_enterprise_feature_flags";
const CACHE_TTL_MS = 5 * 60 * 1000;

export default function useEnterpriseFeatureFlags() {
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState(DEFAULT_FLAGS);

  useEffect(() => {
    let active = true;
    async function loadFlags() {
      try {
        const cachedRaw = window.localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (
            cached &&
            typeof cached === "object" &&
            Date.now() - Number(cached.lastFetched || 0) < CACHE_TTL_MS &&
            cached.flags &&
            typeof cached.flags === "object"
          ) {
            if (active) {
              setFlags((prev) => ({ ...prev, ...cached.flags }));
              setLoading(false);
            }
            return;
          }
        }

        const response = await Admin.systemPreferencesByFields([
          "feature_flags",
        ]);
        const fetched = response?.settings?.feature_flags;
        if (!active) return;
        const merged = {
          ...DEFAULT_FLAGS,
          ...(fetched && typeof fetched === "object" ? fetched : {}),
        };
        setFlags(merged);
        window.localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ flags: merged, lastFetched: Date.now() })
        );
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
