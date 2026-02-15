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

function readCachedFlags() {
  try {
    const cachedRaw = window.localStorage.getItem(CACHE_KEY);
    if (!cachedRaw) return null;
    const cached = JSON.parse(cachedRaw);
    if (
      !cached ||
      typeof cached !== "object" ||
      Date.now() - Number(cached.lastFetched || 0) >= CACHE_TTL_MS ||
      !cached.flags ||
      typeof cached.flags !== "object"
    ) {
      return null;
    }
    return cached.flags;
  } catch {
    return null;
  }
}

function cacheFlags(flags) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ flags, lastFetched: Date.now() })
    );
  } catch {
    // no-op: localStorage may be unavailable in some browser contexts
  }
}

export default function useEnterpriseFeatureFlags() {
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState(DEFAULT_FLAGS);

  useEffect(() => {
    let active = true;
    async function loadFlags() {
      try {
        const cachedFlags = readCachedFlags();
        if (cachedFlags) {
          if (active) {
            setFlags((prev) => ({ ...prev, ...cachedFlags }));
            setLoading(false);
          }
          return;
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
        cacheFlags(merged);
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
