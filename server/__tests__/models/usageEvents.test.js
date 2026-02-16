const mockCreate = jest.fn();
const mockFindMany = jest.fn();
const mockAggregate = jest.fn();
const mockGroupBy = jest.fn();
const mockCount = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock("../../utils/prisma", () => ({
  usage_events: {
    create: mockCreate,
    findMany: mockFindMany,
    aggregate: mockAggregate,
    groupBy: mockGroupBy,
    count: mockCount,
    deleteMany: mockDeleteMany,
  },
}));

const { UsageEvents } = require("../../models/usageEvents");

describe("UsageEvents model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sanitizes payload with number coercion and metadata serialization", () => {
    const sanitized = UsageEvents.sanitizePayload({
      eventType: "chat_completion",
      userId: "3",
      workspaceId: "7",
      promptTokens: "11",
      completionTokens: "13",
      totalTokens: "24",
      durationMs: "55",
      metadata: { source: "workspace-chat" },
      occurredAt: "2026-02-15T00:00:00.000Z",
    });

    expect(sanitized).toMatchObject({
      eventType: "chat_completion",
      userId: 3,
      workspaceId: 7,
      promptTokens: 11,
      completionTokens: 13,
      totalTokens: 24,
      durationMs: 55,
      metadata: JSON.stringify({ source: "workspace-chat" }),
    });
    expect(sanitized.occurredAt).toBeInstanceOf(Date);
  });

  it("falls back malformed numeric metrics to safe defaults", () => {
    const sanitized = UsageEvents.sanitizePayload({
      promptTokens: "NaN-ish",
      completionTokens: "15.9",
      totalTokens: undefined,
      durationMs: "invalid",
    });

    expect(sanitized.promptTokens).toBe(0);
    expect(sanitized.completionTokens).toBe(15);
    expect(sanitized.totalTokens).toBe(0);
    expect(sanitized.durationMs).toBeNull();
  });

  it("normalizes invalid identifiers and malformed occurredAt values safely", () => {
    const before = Date.now();
    const sanitized = UsageEvents.sanitizePayload({
      userId: "NaN-user",
      workspaceId: -5,
      teamId: "0",
      apiKeyId: " ",
      chatId: "12.9",
      threadId: "33",
      occurredAt: "invalid-date-value",
    });
    const after = Date.now();

    expect(sanitized.userId).toBeNull();
    expect(sanitized.workspaceId).toBeNull();
    expect(sanitized.teamId).toBeNull();
    expect(sanitized.apiKeyId).toBeNull();
    expect(sanitized.chatId).toBeNull();
    expect(sanitized.threadId).toBe(33);
    expect(sanitized.occurredAt).toBeInstanceOf(Date);
    expect(sanitized.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(sanitized.occurredAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("clamps negative metric values to zero", () => {
    const sanitized = UsageEvents.sanitizePayload({
      promptTokens: -5,
      completionTokens: "-3",
      totalTokens: -8,
      durationMs: -22,
    });

    expect(sanitized.promptTokens).toBe(0);
    expect(sanitized.completionTokens).toBe(0);
    expect(sanitized.totalTokens).toBe(0);
    expect(sanitized.durationMs).toBe(0);
  });

  it("logs event rows and returns event payload", async () => {
    mockCreate.mockResolvedValueOnce({
      id: 44,
      eventType: "chat_completion",
      totalTokens: 22,
    });

    const result = await UsageEvents.log({
      userId: 5,
      totalTokens: 22,
      metadataRaw: "raw-metadata",
    });

    expect(result).toEqual({
      event: { id: 44, eventType: "chat_completion", totalTokens: 22 },
      error: null,
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].data.userId).toBe(5);
    expect(mockCreate.mock.calls[0][0].data.metadata).toBe("raw-metadata");
  });

  it("queries with pagination and custom order", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 9 }]);
    const result = await UsageEvents.where(
      { workspaceId: 2 },
      20,
      { occurredAt: "asc" },
      5
    );

    expect(result).toEqual([{ id: 9 }]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { workspaceId: 2 },
      take: 20,
      skip: 5,
      orderBy: { occurredAt: "asc" },
    });
  });

  it("loads usage events with related user/workspace/team context", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 12,
        user: { id: 1, username: "admin", role: "admin" },
        workspace: { id: 4, slug: "sales", name: "Sales" },
      },
    ]);
    const result = await UsageEvents.withRelations(
      { userId: 1 },
      10,
      { occurredAt: "desc" },
      0
    );

    expect(result).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
        team: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
      take: 10,
      skip: 0,
      orderBy: { occurredAt: "desc" },
    });
  });

  it("returns aggregate fallback values when prisma throws", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAggregate.mockRejectedValueOnce(new Error("aggregation-failed"));
    const aggregate = await UsageEvents.aggregate({ workspaceId: 88 });

    expect(aggregate).toEqual({
      _count: { id: 0 },
      _sum: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs: 0,
      },
    });
    consoleSpy.mockRestore();
  });

  it("supports grouped summaries and safe count/delete wrappers", async () => {
    mockGroupBy.mockResolvedValueOnce([{ provider: "openai", _count: { id: 2 } }]);
    mockCount.mockResolvedValueOnce(4);
    mockDeleteMany.mockResolvedValueOnce({ count: 4 });

    const grouped = await UsageEvents.groupBy({
      by: ["provider"],
      where: { eventType: "chat_completion" },
      orderBy: { provider: "asc" },
    });
    const count = await UsageEvents.count({ provider: "openai" });
    const deleted = await UsageEvents.delete({ provider: "openai" });

    expect(grouped).toEqual([{ provider: "openai", _count: { id: 2 } }]);
    expect(count).toBe(4);
    expect(deleted).toBe(true);
  });

  it("prunes usage events older than retention window", async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 7 });
    const before = Date.now();
    const result = await UsageEvents.pruneOlderThanDays(30);
    const after = Date.now();

    expect(result.error).toBeNull();
    expect(result.deletedCount).toBe(7);
    expect(result.cutoff).toBeInstanceOf(Date);
    expect(result.cutoff.getTime()).toBeGreaterThanOrEqual(
      before - 30 * 24 * 60 * 60 * 1000 - 2000
    );
    expect(result.cutoff.getTime()).toBeLessThanOrEqual(
      after - 30 * 24 * 60 * 60 * 1000 + 2000
    );
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        occurredAt: {
          lt: expect.any(Date),
        },
      },
    });
  });

  it("treats invalid retention windows as no-op cleanup", async () => {
    const invalidResults = await Promise.all([
      UsageEvents.pruneOlderThanDays("bad"),
      UsageEvents.pruneOlderThanDays(0),
      UsageEvents.pruneOlderThanDays(-5),
      UsageEvents.pruneOlderThanDays("7.5"),
    ]);

    for (const result of invalidResults) {
      expect(result).toEqual({
        deletedCount: 0,
        cutoff: null,
        error: null,
      });
    }
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("returns cleanup error details when prune delete fails", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockDeleteMany.mockRejectedValueOnce(new Error("prune-delete-failed"));

    const result = await UsageEvents.pruneOlderThanDays(14);

    expect(result.deletedCount).toBe(0);
    expect(result.cutoff).toBeInstanceOf(Date);
    expect(result.error).toBe("prune-delete-failed");
    consoleSpy.mockRestore();
  });

  it("returns safe defaults for list and delete operations on errors", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFindMany.mockRejectedValueOnce(new Error("find-failed"));
    mockDeleteMany.mockRejectedValueOnce(new Error("delete-failed"));

    const rows = await UsageEvents.where({ teamId: 7 });
    const deleted = await UsageEvents.delete({ teamId: 7 });

    expect(rows).toEqual([]);
    expect(deleted).toBe(false);
    consoleSpy.mockRestore();
  });
});
