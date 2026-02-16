const { SystemSettings } = require("../../models/systemSettings");

function gateEnabled(flags = {}, feature = "") {
  if (!feature) return true;
  if (!Object.prototype.hasOwnProperty.call(flags, feature)) return true;
  return flags[feature] !== false;
}

function requireFeature(feature = "") {
  return async function (request, response, next) {
    try {
      const flags = await SystemSettings.getFeatureFlags();
      if (gateEnabled(flags, feature)) return next();
      return response.status(403).json({
        success: false,
        error: `Feature ${feature} is disabled on this instance.`,
      });
    } catch (error) {
      console.error(error);
      return response.status(500).json({
        success: false,
        error: "Could not evaluate feature gate.",
      });
    }
  };
}

module.exports = { requireFeature, gateEnabled };
