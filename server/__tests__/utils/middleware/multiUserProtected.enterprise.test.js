const mockIsMultiUserMode = jest.fn();
const mockUserFromSession = jest.fn();

jest.mock("../../../models/systemSettings", () => ({
  SystemSettings: {
    isMultiUserMode: (...args) => mockIsMultiUserMode(...args),
  },
}));

jest.mock("../../../utils/http", () => ({
  userFromSession: (...args) => mockUserFromSession(...args),
}));

const {
  strictMultiUserRoleValid,
  flexUserRoleValid,
  isMultiUserSetup,
  ROLES,
} = require("../../../utils/middleware/multiUserProtected");

function mockResponse() {
  const response = {
    locals: {},
    sendStatus: jest.fn(),
    end: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  response.sendStatus.mockImplementation(() => response);
  return response;
}

describe("multiUserProtected middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMultiUserMode.mockResolvedValue(true);
    mockUserFromSession.mockResolvedValue({ id: 42, role: ROLES.admin });
  });

  describe("strictMultiUserRoleValid", () => {
    it("default role set allows manager access", async () => {
      const middleware = strictMultiUserRoleValid();
      const response = mockResponse();
      const next = jest.fn();
      mockUserFromSession.mockResolvedValueOnce({ id: 7, role: ROLES.manager });

      await middleware({ headers: {} }, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.sendStatus).not.toHaveBeenCalled();
    });

    it("bypasses validation when all roles are allowed", async () => {
      const middleware = strictMultiUserRoleValid([ROLES.all]);
      const response = mockResponse();
      const next = jest.fn();

      await middleware({}, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockIsMultiUserMode).not.toHaveBeenCalled();
      expect(mockUserFromSession).not.toHaveBeenCalled();
    });

    it("denies access when multi-user mode is disabled", async () => {
      const middleware = strictMultiUserRoleValid([ROLES.admin]);
      const response = mockResponse();
      const next = jest.fn();
      mockIsMultiUserMode.mockResolvedValueOnce(false);

      await middleware({}, response, next);

      expect(response.sendStatus).toHaveBeenCalledWith(401);
      expect(response.end).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });

    it("uses locals context and allows matching role without external lookups", async () => {
      const middleware = strictMultiUserRoleValid([ROLES.manager]);
      const response = mockResponse();
      const next = jest.fn();
      response.locals.multiUserMode = true;
      response.locals.user = { id: 8, role: ROLES.manager };

      await middleware({}, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockIsMultiUserMode).not.toHaveBeenCalled();
      expect(mockUserFromSession).not.toHaveBeenCalled();
    });

    it("loads user from session and rejects disallowed role", async () => {
      const middleware = strictMultiUserRoleValid([ROLES.admin]);
      const response = mockResponse();
      const next = jest.fn();
      mockUserFromSession.mockResolvedValueOnce({ id: 9, role: ROLES.default });

      await middleware({ headers: {} }, response, next);

      expect(mockIsMultiUserMode).toHaveBeenCalledTimes(1);
      expect(mockUserFromSession).toHaveBeenCalledTimes(1);
      expect(response.sendStatus).toHaveBeenCalledWith(401);
      expect(response.end).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("flexUserRoleValid", () => {
    it("default role set allows manager access when multi-user is enabled", async () => {
      const middleware = flexUserRoleValid();
      const response = mockResponse();
      const next = jest.fn();
      mockUserFromSession.mockResolvedValueOnce({ id: 10, role: ROLES.manager });

      await middleware({ headers: {} }, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.sendStatus).not.toHaveBeenCalled();
    });

    it("bypasses role checks while multi-user mode is disabled", async () => {
      const middleware = flexUserRoleValid([ROLES.admin]);
      const response = mockResponse();
      const next = jest.fn();
      mockIsMultiUserMode.mockResolvedValueOnce(false);

      await middleware({}, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockUserFromSession).not.toHaveBeenCalled();
    });

    it("allows matching role when multi-user mode is enabled", async () => {
      const middleware = flexUserRoleValid([ROLES.manager]);
      const response = mockResponse();
      const next = jest.fn();
      mockUserFromSession.mockResolvedValueOnce({ id: 10, role: ROLES.manager });

      await middleware({ headers: {} }, response, next);

      expect(mockIsMultiUserMode).toHaveBeenCalledTimes(1);
      expect(mockUserFromSession).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
      expect(response.sendStatus).not.toHaveBeenCalled();
    });

    it("rejects disallowed role when multi-user mode is enabled", async () => {
      const middleware = flexUserRoleValid([ROLES.manager]);
      const response = mockResponse();
      const next = jest.fn();
      mockUserFromSession.mockResolvedValueOnce({ id: 10, role: ROLES.default });

      await middleware({ headers: {} }, response, next);

      expect(response.sendStatus).toHaveBeenCalledWith(401);
      expect(response.end).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("isMultiUserSetup", () => {
    it("returns 403 payload when multi-user mode is disabled", async () => {
      const response = mockResponse();
      const next = jest.fn();
      mockIsMultiUserMode.mockResolvedValueOnce(false);

      await isMultiUserSetup({}, response, next);

      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.json).toHaveBeenCalledWith({
        error: "Invalid request",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("calls next when multi-user mode is enabled", async () => {
      const response = mockResponse();
      const next = jest.fn();
      mockIsMultiUserMode.mockResolvedValueOnce(true);

      await isMultiUserSetup({}, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.status).not.toHaveBeenCalled();
    });
  });
});
