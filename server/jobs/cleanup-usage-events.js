const { log, conclude } = require("./helpers/index.js");
const { UsageEvents } = require("../models/usageEvents.js");

const retentionDays = UsageEvents.parseRetentionDays(
  process.env.USAGE_EVENTS_RETENTION_DAYS
);

(async () => {
  try {
    if (!retentionDays) {
      log(
        "Usage-event retention disabled or invalid USAGE_EVENTS_RETENTION_DAYS value. Skipping cleanup."
      );
      return;
    }

    const result = await UsageEvents.pruneOlderThanDays(retentionDays);
    if (result.error) {
      log(
        `Usage-event cleanup failed for retentionDays=${retentionDays}: ${result.error}`
      );
      return;
    }

    log(
      `Usage-event cleanup removed ${result.deletedCount} rows older than ${retentionDays} day(s).`
    );
  } catch (error) {
    console.error(error);
    log(`Usage-event cleanup errored: ${error.message}`);
  } finally {
    conclude();
  }
})();
