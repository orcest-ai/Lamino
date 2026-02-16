const { SystemSettings } = require("../../models/systemSettings");

describe("SystemSettings enterprise feature flags", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("passes enterprise fields through updateSettings filter", async () => {
    const updateSpy = jest
      .spyOn(SystemSettings, "_updateSettings")
      .mockResolvedValue({ success: true, error: null });

    const result = await SystemSettings.updateSettings({
      enterprise_teams: "disabled",
      enterprise_prompt_library: "enabled",
      unsupported_setting: "ignored",
    });

    expect(result).toEqual({ success: true, error: null });
    expect(updateSpy).toHaveBeenCalledWith({
      enterprise_teams: "disabled",
      enterprise_prompt_library: "enabled",
    });
  });

  it("merges parsed feature_flags with dedicated enterprise labels", async () => {
    jest.spyOn(SystemSettings, "get").mockImplementation(async ({ label }) => {
      const lookup = {
        feature_flags: {
          value: JSON.stringify({
            enterprise_teams: false,
            enterprise_usage_policies: false,
            custom_rollout_flag: true,
          }),
        },
        enterprise_prompt_library: { value: "enabled" },
        experimental_live_file_sync: { value: "disabled" },
      };
      return lookup[label] || null;
    });

    const flags = await SystemSettings.getFeatureFlags();

    expect(flags.custom_rollout_flag).toBe(true);
    expect(flags.enterprise_teams).toBe(false);
    expect(flags.enterprise_prompt_library).toBe(true);
    expect(flags.enterprise_usage_policies).toBe(false);
    expect(flags.enterprise_usage_monitoring).toBe(true);
    expect(flags.experimental_live_file_sync).toBe(false);
  });

  it("prefers dedicated enterprise labels over feature_flags JSON", async () => {
    jest.spyOn(SystemSettings, "get").mockImplementation(async ({ label }) => {
      const lookup = {
        feature_flags: {
          value: JSON.stringify({
            enterprise_teams: false,
            enterprise_prompt_library: false,
          }),
        },
        enterprise_teams: { value: "enabled" },
        enterprise_prompt_library: { value: "disabled" },
        experimental_live_file_sync: { value: "enabled" },
      };
      return lookup[label] || null;
    });

    const flags = await SystemSettings.getFeatureFlags();

    expect(flags.enterprise_teams).toBe(true);
    expect(flags.enterprise_prompt_library).toBe(false);
    expect(flags.experimental_live_file_sync).toBe(true);
  });

  it("normalizes malformed feature_flags values safely", () => {
    const normalizedFromGarbage = SystemSettings.validations.feature_flags(
      "this-is-not-json"
    );
    const normalizedFromObject = SystemSettings.validations.feature_flags({
      enterprise_teams: false,
    });

    expect(normalizedFromGarbage).toBe("{}");
    expect(normalizedFromObject).toBe(
      JSON.stringify({ enterprise_teams: false })
    );
  });
});
