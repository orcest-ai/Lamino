jest.mock("../../utils/logger", () => () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const { BackgroundService } = require("../../utils/BackgroundWorkers");

describe("BackgroundService enterprise retention scheduling", () => {
  const originalRetentionEnv = process.env.USAGE_EVENTS_RETENTION_DAYS;
  let consoleSpy;

  beforeEach(() => {
    BackgroundService._instance = null;
    delete process.env.USAGE_EVENTS_RETENTION_DAYS;
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  afterAll(() => {
    if (originalRetentionEnv === undefined)
      delete process.env.USAGE_EVENTS_RETENTION_DAYS;
    else process.env.USAGE_EVENTS_RETENTION_DAYS = originalRetentionEnv;
    BackgroundService._instance = null;
  });

  it("disables usage-event cleanup job when retention env is unset or invalid", () => {
    const service = new BackgroundService();

    expect(service.resolveUsageEventsRetentionDays()).toBe(0);
    process.env.USAGE_EVENTS_RETENTION_DAYS = "NaN";
    expect(service.resolveUsageEventsRetentionDays()).toBe(0);
    process.env.USAGE_EVENTS_RETENTION_DAYS = "0";
    expect(service.resolveUsageEventsRetentionDays()).toBe(0);
    process.env.USAGE_EVENTS_RETENTION_DAYS = "-5";
    expect(service.resolveUsageEventsRetentionDays()).toBe(0);
    process.env.USAGE_EVENTS_RETENTION_DAYS = "7.5";
    expect(service.resolveUsageEventsRetentionDays()).toBe(0);
  });

  it("enables usage-event cleanup job only for positive integer retention values", () => {
    const service = new BackgroundService();
    process.env.USAGE_EVENTS_RETENTION_DAYS = "30";

    expect(service.resolveUsageEventsRetentionDays()).toBe(30);
  });

  it("builds active jobs list with optional sync and retention workers", () => {
    const service = new BackgroundService();
    service.documentSyncEnabled = false;
    service.usageEventsRetentionDays = 0;
    expect(service.jobs().map((job) => job.name)).toEqual([
      "cleanup-orphan-documents",
    ]);

    service.documentSyncEnabled = true;
    service.usageEventsRetentionDays = 45;
    expect(service.jobs().map((job) => job.name)).toEqual([
      "cleanup-orphan-documents",
      "sync-watched-documents",
      "cleanup-usage-events",
    ]);
  });
});
