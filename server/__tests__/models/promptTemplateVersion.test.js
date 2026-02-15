const mockCreate = jest.fn();
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock("../../utils/prisma", () => ({
  prompt_template_versions: {
    create: mockCreate,
    findFirst: mockFindFirst,
    findMany: mockFindMany,
    deleteMany: mockDeleteMany,
    update: jest.fn(),
  },
}));

const { PromptTemplateVersion } = require("../../models/promptTemplateVersion");

describe("PromptTemplateVersion model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("increments template version based on latest existing version", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 99, templateId: 5, version: 3 });
    const next = await PromptTemplateVersion.nextVersion(5);
    expect(next).toBe(4);
  });

  it("starts at version 1 when no history exists", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const next = await PromptTemplateVersion.nextVersion(5);
    expect(next).toBe(1);
  });

  it("creates a new prompt template version using computed increment", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 5, templateId: 3, version: 7 });
    mockCreate.mockResolvedValueOnce({ id: 6, templateId: 3, version: 8 });
    const result = await PromptTemplateVersion.create({
      templateId: 3,
      prompt: "You are a strict assistant.",
      changelog: "Update safety constraints",
      createdBy: 10,
    });

    expect(result.error).toBeNull();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        templateId: 3,
        version: 8,
        prompt: "You are a strict assistant.",
        changelog: "Update safety constraints",
        createdBy: 10,
        approvedBy: null,
      },
    });
  });
});
