const path = require("path");

describe("collector/utils/files storage resolution", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  test("falls back to server/storage path when STORAGE_DIR is missing in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.STORAGE_DIR;

    const filesUtils = require("../../../utils/files");

    expect(filesUtils.resolveStorageRoot()).toBe(
      path.resolve(__dirname, "../../../../server/storage")
    );
    expect(filesUtils.documentsFolder).toBe(
      path.resolve(__dirname, "../../../../server/storage/documents")
    );
    expect(filesUtils.directUploadsFolder).toBe(
      path.resolve(__dirname, "../../../../server/storage/direct-uploads")
    );
  });

  test("uses STORAGE_DIR when provided in production", () => {
    process.env.NODE_ENV = "production";
    process.env.STORAGE_DIR = "/tmp/lamino-storage";

    const filesUtils = require("../../../utils/files");

    expect(filesUtils.resolveStorageRoot()).toBe(
      path.resolve("/tmp/lamino-storage")
    );
    expect(filesUtils.documentsFolder).toBe(
      path.resolve("/tmp/lamino-storage/documents")
    );
  });
});
