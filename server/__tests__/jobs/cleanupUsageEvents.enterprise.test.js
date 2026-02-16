const mockParseRetentionDays = jest.fn();
const mockPruneOlderThanDays = jest.fn();
const mockLog = jest.fn();
const mockConclude = jest.fn();

jest.mock("../../models/usageEvents.js", () => ({
  UsageEvents: {
    parseRetentionDays: (...args) => mockParseRetentionDays(...args),
    pruneOlderThanDays: (...args) => mockPruneOlderThanDays(...args),
  },
}));

jest.mock("../../jobs/helpers/index.js", () => ({
  log: (...args) => mockLog(...args),
  conclude: (...args) => mockConclude(...args),
}));

async function runCleanupJobModule() {
  jest.isolateModules(() => {
    require("../../jobs/cleanup-usage-events.js");
  });
  await new Promise((resolve) => setImmediate(resolve));
}

describe("cleanup-usage-events job", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRetentionDays = process.env.USAGE_EVENTS_RETENTION_DAYS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env.NODE_ENV = "test";
    delete process.env.USAGE_EVENTS_RETENTION_DAYS;
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalRetentionDays === undefined)
      delete process.env.USAGE_EVENTS_RETENTION_DAYS;
    else process.env.USAGE_EVENTS_RETENTION_DAYS = originalRetentionDays;
  });

  it("skips cleanup when retention is disabled or invalid", async () => {
    process.env.USAGE_EVENTS_RETENTION_DAYS = "not-a-number";
    mockParseRetentionDays.mockReturnValueOnce(null);

    await runCleanupJobModule();

    expect(mockParseRetentionDays).toHaveBeenCalledWith("not-a-number");
    expect(mockPruneOlderThanDays).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      "Usage-event retention disabled or invalid USAGE_EVENTS_RETENTION_DAYS value. Skipping cleanup."
    );
    expect(mockConclude).toHaveBeenCalledTimes(1);
  });

  it("prunes usage events and logs deleted row count", async () => {
    process.env.USAGE_EVENTS_RETENTION_DAYS = "30";
    mockParseRetentionDays.mockReturnValueOnce(30);
    mockPruneOlderThanDays.mockResolvedValueOnce({
      deletedCount: 17,
      cutoff: new Date("2026-01-01T00:00:00.000Z"),
      error: null,
    });

    await runCleanupJobModule();

    expect(mockPruneOlderThanDays).toHaveBeenCalledWith(30);
    expect(mockLog).toHaveBeenCalledWith(
      "Usage-event cleanup removed 17 rows older than 30 day(s)."
    );
    expect(mockConclude).toHaveBeenCalledTimes(1);
  });

  it("logs cleanup failures returned by the model", async () => {
    process.env.USAGE_EVENTS_RETENTION_DAYS = "14";
    mockParseRetentionDays.mockReturnValueOnce(14);
    mockPruneOlderThanDays.mockResolvedValueOnce({
      deletedCount: 0,
      cutoff: new Date("2026-01-01T00:00:00.000Z"),
      error: "delete-many-failed",
    });

    await runCleanupJobModule();

    expect(mockPruneOlderThanDays).toHaveBeenCalledWith(14);
    expect(mockLog).toHaveBeenCalledWith(
      "Usage-event cleanup failed for retentionDays=14: delete-many-failed"
    );
    expect(mockConclude).toHaveBeenCalledTimes(1);
  });
});
