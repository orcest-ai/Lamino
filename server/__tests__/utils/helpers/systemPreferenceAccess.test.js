const {
  MANAGER_RESTRICTED_SYSTEM_PREFERENCE_KEYS,
  managerRestrictedSystemPreferenceKey,
  systemPreferenceAccessError,
} = require("../../../utils/helpers/systemPreferenceAccess");

describe("systemPreferenceAccess helper", () => {
  it("returns null for payloads without restricted keys", () => {
    expect(
      managerRestrictedSystemPreferenceKey({
        custom_app_name: "AnythingLLM Enterprise",
      })
    ).toBeNull();
    expect(
      managerRestrictedSystemPreferenceKey({
        support_email: "support@example.com",
      })
    ).toBeNull();
  });

  it("returns first restricted key when manager payload includes enterprise flags", () => {
    expect(
      managerRestrictedSystemPreferenceKey({
        enterprise_teams: "disabled",
      })
    ).toBe("enterprise_teams");

    expect(
      managerRestrictedSystemPreferenceKey({
        feature_flags: { enterprise_teams: "disabled" },
        enterprise_prompt_library: "disabled",
      })
    ).toBe("feature_flags");
  });

  it("safely ignores malformed update payloads", () => {
    expect(managerRestrictedSystemPreferenceKey(null)).toBeNull();
    expect(managerRestrictedSystemPreferenceKey(undefined)).toBeNull();
    expect(managerRestrictedSystemPreferenceKey("enterprise_teams")).toBeNull();
    expect(managerRestrictedSystemPreferenceKey(["enterprise_teams"])).toBeNull();
  });

  it("keeps restricted key matrix explicit and stable", () => {
    expect(MANAGER_RESTRICTED_SYSTEM_PREFERENCE_KEYS).toEqual([
      "feature_flags",
      "enterprise_teams",
      "enterprise_prompt_library",
      "enterprise_usage_monitoring",
      "enterprise_usage_policies",
    ]);
  });

  it("returns manager-only access error for restricted updates", () => {
    expect(
      systemPreferenceAccessError("manager", {
        enterprise_usage_policies: "disabled",
      })
    ).toBe("Managers cannot update enterprise_usage_policies.");
    expect(
      systemPreferenceAccessError("manager", {
        feature_flags: { enterprise_teams: "disabled" },
      })
    ).toBe("Managers cannot update feature_flags.");
  });

  it("returns null access error for non-manager roles or safe payloads", () => {
    expect(
      systemPreferenceAccessError("admin", {
        enterprise_teams: "disabled",
      })
    ).toBeNull();
    expect(
      systemPreferenceAccessError("default", {
        enterprise_teams: "disabled",
      })
    ).toBeNull();
    expect(
      systemPreferenceAccessError("manager", {
        custom_app_name: "AnythingLLM",
      })
    ).toBeNull();
    expect(systemPreferenceAccessError("manager", null)).toBeNull();
  });
});
