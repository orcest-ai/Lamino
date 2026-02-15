const mockCreate = jest.fn();
const mockUpsert = jest.fn();
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockDeleteMany = jest.fn();
const mockTransaction = jest.fn(async (operations = []) =>
  Promise.all(operations)
);

jest.mock("../../utils/prisma", () => ({
  team_members: {
    create: mockCreate,
    upsert: mockUpsert,
    findFirst: mockFindFirst,
    findMany: mockFindMany,
    count: mockCount,
    deleteMany: mockDeleteMany,
  },
  $transaction: mockTransaction,
}));

const { TeamMember } = require("../../models/teamMembers");

describe("TeamMember model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes unsupported team role to member", () => {
    expect(TeamMember.validateRole("owner")).toBe("owner");
    expect(TeamMember.validateRole("bogus-role")).toBe("member");
  });

  it("upserts with team + user unique composite key", async () => {
    mockUpsert.mockResolvedValueOnce({
      id: 1,
      teamId: 2,
      userId: 5,
      role: "admin",
    });
    const result = await TeamMember.upsert({
      teamId: 2,
      userId: 5,
      role: "admin",
    });

    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        teamId_userId: {
          teamId: 2,
          userId: 5,
        },
      },
      create: {
        teamId: 2,
        userId: 5,
        role: "admin",
      },
      update: {
        role: "admin",
      },
    });
  });

  it("batch-upserts team members to avoid duplicate membership rows", async () => {
    mockUpsert.mockResolvedValue({ id: 1 });
    const result = await TeamMember.createManyUsers({
      teamId: 11,
      userIds: [4, 4, 7],
      role: "viewer",
    });

    expect(result).toEqual({ success: true, error: null });
    expect(mockUpsert).toHaveBeenCalledTimes(3);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
