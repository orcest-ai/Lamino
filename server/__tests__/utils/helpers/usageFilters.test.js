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

  it("formats time buckets by day and hour", () => {
    const timestamp = "2026-02-15T22:30:45.000Z";
    expect(timeSeriesBucket(timestamp, "day")).toBe("2026-02-15");
    expect(timeSeriesBucket(timestamp, "hour")).toBe("2026-02-15T22:00");
  });
});
