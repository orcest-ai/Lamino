const {
  usageTimeRange,
  usageBaseClause,
  timeSeriesBucket,
} = require("../../../utils/helpers/usageFilters");

describe("usageFilters helper", () => {
  it("falls back to a sane time window when inputs are invalid", () => {
    const { from, to } = usageTimeRange({
      days: "-4",
      from: "not-a-date",
      to: "still-not-a-date",
    });

    expect(from).toBeInstanceOf(Date);
    expect(to).toBeInstanceOf(Date);
    expect(to.getTime()).toBeGreaterThan(from.getTime());
  });

  it("normalizes days to positive integer values with upper bound", () => {
    const normalized = usageTimeRange({
      days: "12.9",
      to: "2026-04-20T00:00:00.000Z",
    });
    const capped = usageTimeRange({
      days: "9999",
      to: "2026-04-20T00:00:00.000Z",
    });

    expect(normalized.from.toISOString()).toBe("2026-04-08T00:00:00.000Z");
    expect(capped.from.toISOString()).toBe("2025-04-20T00:00:00.000Z");
  });

  it("builds usage where clause with optional filters", () => {
    const clause = usageBaseClause({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-05T00:00:00.000Z",
      userId: "7",
      workspaceId: "8",
      teamId: "9",
      eventType: "chat_completion",
      provider: "openai",
      model: "gpt-4o",
    });

    expect(clause).toMatchObject({
      userId: 7,
      workspaceId: 8,
      teamId: 9,
      eventType: "chat_completion",
      provider: "openai",
      model: "gpt-4o",
    });
    expect(clause.occurredAt.gte).toBeInstanceOf(Date);
    expect(clause.occurredAt.lte).toBeInstanceOf(Date);
  });

  it("swaps from/to when an inverted time range is provided", () => {
    const { from, to } = usageTimeRange({
      from: "2026-03-10T00:00:00.000Z",
      to: "2026-03-01T00:00:00.000Z",
    });
    expect(from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("omits invalid id/string filters instead of emitting NaN or blanks", () => {
    const clause = usageBaseClause({
      userId: "NaN",
      workspaceId: "4.2",
      teamId: "",
      eventType: "   ",
      provider: null,
      model: undefined,
    });

    expect(clause).toEqual({
      occurredAt: expect.any(Object),
    });
  });

  it("formats time buckets by day and hour", () => {
    const timestamp = "2026-02-15T22:30:45.000Z";
    expect(timeSeriesBucket(timestamp, "day")).toBe("2026-02-15");
    expect(timeSeriesBucket(timestamp, "hour")).toBe("2026-02-15T22:00");
  });
});
