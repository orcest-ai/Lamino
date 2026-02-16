const MANAGER_RESTRICTED_SYSTEM_PREFERENCE_KEYS = Object.freeze([
  "feature_flags",
  "enterprise_teams",
  "enterprise_prompt_library",
  "enterprise_usage_monitoring",
  "enterprise_usage_policies",
]);

function managerRestrictedSystemPreferenceKey(updates = {}) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return null;
  }

  return (
    Object.keys(updates).find((key) =>
      MANAGER_RESTRICTED_SYSTEM_PREFERENCE_KEYS.includes(key)
    ) || null
  );
}

module.exports = {
  MANAGER_RESTRICTED_SYSTEM_PREFERENCE_KEYS,
  managerRestrictedSystemPreferenceKey,
};
