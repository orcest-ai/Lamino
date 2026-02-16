describe("job helpers logging behavior", () => {
  const originalProcessSend = process.send;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.send = originalProcessSend;
    process.env.NODE_ENV = originalNodeEnv;
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it("falls back to console logging when process.send is unavailable", () => {
    jest.doMock("node:worker_threads", () => ({ parentPort: null }));
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    process.send = undefined;
    process.env.NODE_ENV = "development";

    jest.isolateModules(() => {
      const { log } = require("../../jobs/helpers");
      log("standalone-log");
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("standalone-log")
    );
  });

  it("uses process.send when running under child-process messaging", () => {
    jest.doMock("node:worker_threads", () => ({ parentPort: null }));
    const processSend = jest.fn();
    process.send = processSend;
    process.env.NODE_ENV = "development";

    jest.isolateModules(() => {
      const { log } = require("../../jobs/helpers");
      log("child-process-log");
    });

    expect(processSend).toHaveBeenCalledWith(
      expect.stringContaining("child-process-log")
    );
  });
});
