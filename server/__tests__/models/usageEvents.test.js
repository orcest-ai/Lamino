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
