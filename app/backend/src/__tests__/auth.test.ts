import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../lib/password";

// Mock Prisma before imports
const mockPrisma = {
  user: {
    findFirst: vi.fn(),
  },
  session: {
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock rate limiter to bypass for integration tests
vi.mock("@/lib/rateLimiter", () => ({
  authRateLimiter: ((_, next) => next()) as MiddlewareHandler,
}));

// Mock Redis client for session module
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue({}),
}));

/**
 * Integration tests for the Auth Routes.
 * These tests verify the authentication flow: login, token refresh, and logout.
 */
describe("Auth Routes", () => {
  const testUser = {
    id: "user-123",
    username: "testuser",
    password: "", // Will be set with hashed password
    email: "test@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testSession = {
    id: "session-123",
    token: "valid-refresh-token",
    userId: "user-123",
    expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    createdAt: new Date(),
  };

  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-import authRoute after mocks are applied
    const { authRoute } = await import("../routes/api/v4/auth");
    app = new Hono();
    app.route("/auth", authRoute);

    // Hash the test password
    testUser.password = await hashPassword("correct-password");
  });

  describe("POST /auth - Login", () => {
    it("should return 401 for invalid username", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "nonexistent",
          password: "somepassword",
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe("Invalid username or password");
    });

    it("should return 401 for invalid password", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(testUser);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "testuser",
          password: "wrong-password",
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe("Invalid username or password");
    });

    it("should return token for valid credentials", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(testUser);
      mockPrisma.session.create.mockResolvedValue(testSession);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "testuser",
          password: "correct-password",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.code).toBe(200);
      expect(typeof json.data).toBe("string"); // JWT token
      expect(mockPrisma.session.create).toHaveBeenCalled();
    });
  });

  describe("POST /auth - Token Refresh", () => {
    it("should refresh token with valid existing token", async () => {
      mockPrisma.session.findFirst.mockResolvedValue(testSession);
      mockPrisma.session.create.mockResolvedValue(testSession);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "token",
          token: "valid-refresh-token",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(typeof json.data).toBe("string"); // New JWT token
    });

    it("should return 401 for expired token", async () => {
      mockPrisma.session.findFirst.mockResolvedValue(null);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "token",
          token: "expired-token",
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe("Invalid token");
    });
  });

  describe("DELETE /auth - Logout", () => {
    it("should delete session on logout", async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      const res = await app.request("/auth", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "some-token-to-logout",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { token: "some-token-to-logout" },
      });
    });

    it("should succeed even if token does not exist", async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });

      const res = await app.request("/auth", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "non-existent-token",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });
  });

  describe("Edge Cases - Input Validation", () => {
    it("should reject login with empty username", async () => {
      const _res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "",
          password: "somepassword",
        }),
      });

      // Empty username will still pass Zod validation (z.string() allows empty)
      // but won't match any user in the database
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res2 = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "",
          password: "somepassword",
        }),
      });

      expect(res2.status).toBe(401);
      const json = await res2.json();
      expect(json.message).toBe("Invalid username or password");
    });

    it("should reject login with empty password", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(testUser);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "testuser",
          password: "",
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe("Invalid username or password");
    });

    it("should reject malformed JSON in request body", async () => {
      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{",
      });

      expect(res.status).toBe(400);
    });

    it("should reject request with missing required fields", async () => {
      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          // Missing username and password
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should handle very long username gracefully", async () => {
      const longUsername = "a".repeat(1000);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: longUsername,
          password: "password",
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe("Invalid username or password");
    });

    it("should handle very long password gracefully", async () => {
      const longPassword = "a".repeat(1000);
      mockPrisma.user.findFirst.mockResolvedValue(testUser);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "testuser",
          password: longPassword,
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe("Invalid username or password");
    });
  });

  describe("Edge Cases - System Accounts", () => {
    it("should reject login for system accounts (null password)", async () => {
      const systemUser = {
        ...testUser,
        password: null, // System accounts have null passwords
      };
      mockPrisma.user.findFirst.mockResolvedValue(systemUser);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "testuser",
          password: "anypassword",
        }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toBe("Invalid username or password");
    });

    it("should not return system accounts in user query", async () => {
      // The query explicitly filters for password: { not: null }
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "systemaccount",
          password: "anypassword",
        }),
      });

      expect(res.status).toBe(401);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          username: "systemaccount",
          password: {
            not: null,
          },
        },
      });
    });
  });

  describe("Edge Cases - Token Edge Conditions", () => {
    it("should accept token that expires far in the future", async () => {
      const futureSession = {
        ...testSession,
        expiredAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      };
      mockPrisma.session.findFirst.mockResolvedValue(futureSession);
      mockPrisma.session.create.mockResolvedValue(testSession);

      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "token",
          token: "valid-refresh-token",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });

    it("should reject empty token string", async () => {
      const _res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "token",
          token: "",
        }),
      });

      // Empty token will find no session
      mockPrisma.session.findFirst.mockResolvedValue(null);

      const res2 = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "token",
          token: "",
        }),
      });

      expect(res2.status).toBe(401);
      const json = await res2.json();
      expect(json.message).toBe("Invalid token");
    });

    it("should use >= comparison for token expiry (boundary test)", async () => {
      // Session that expires at exactly the current time should be valid
      const exactlyNowSession = {
        ...testSession,
        expiredAt: new Date(),
      };
      mockPrisma.session.findFirst.mockResolvedValue(exactlyNowSession);
      mockPrisma.session.create.mockResolvedValue(testSession);

      // Call the endpoint
      await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "token",
          token: "valid-refresh-token",
        }),
      });

      // Verify the query uses gte (>=) not gt (>)
      expect(mockPrisma.session.findFirst).toHaveBeenCalledWith({
        where: {
          token: "valid-refresh-token",
          expiredAt: {
            gte: expect.any(Date),
          },
        },
      });
    });
  });

  describe("Edge Cases - Username Case Sensitivity", () => {
    it("should treat usernames as case-sensitive", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      // Try to login with different case
      const res = await app.request("/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password",
          username: "TestUser", // Different case
          password: "correct-password",
        }),
      });

      expect(res.status).toBe(401);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          username: "TestUser", // Exact case preserved
          password: {
            not: null,
          },
        },
      });
    });
  });
});
