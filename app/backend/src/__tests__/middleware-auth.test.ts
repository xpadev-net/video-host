import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env, HonoApp } from "@/@types/hono";
import { JWT_SECRET } from "../env";

// Mock Prisma before imports
const mockPrisma = {
  session: {
    findFirst: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock rate limiter to bypass for integration tests
vi.mock("@/lib/rateLimiter", () => ({
  authRateLimiter: ((_, next) => next()) as MiddlewareHandler,
}));

/**
 * Integration tests for the Auth Middleware.
 * These tests verify that the authentication middleware correctly validates
 * JWT tokens, checks session validity, and grants/denies access appropriately.
 */
describe("Auth Middleware", () => {
  const testUser = {
    id: "user-123",
    username: "testuser",
    name: "Test User",
    role: "USER" as const,
    avatarUrl: null,
    password: "hashed-password",
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testSession = {
    id: "session-123",
    token: "valid-session-token",
    userId: "user-123",
    expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    createdAt: new Date(),
    updatedAt: new Date(),
    user: testUser,
  };

  let app: HonoApp;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-import auth middleware and create test app
    const { handleAuth } = await import("../middleware/auth");
    app = new Hono<Env>();

    // Apply auth middleware
    handleAuth(app);

    // Add test routes
    app.get("/api/v4/users", (c) => {
      const user = c.get("user");
      return c.json({ status: "ok", user });
    });

    // Add a public endpoint for testing
    app.get("/api/v4/public", (c) => {
      return c.json({ status: "ok", message: "public" });
    });
  });

  describe("Protected endpoints without authentication", () => {
    it("should reject request without Authorization header", async () => {
      const res = await app.request("/api/v4/users");

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Unauthorized");
    });

    it("should reject request with malformed Authorization header (missing Bearer)", async () => {
      const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);

      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: token, // Missing "Bearer " prefix
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Unauthorized");
    });

    it("should reject request with extra spaces in Authorization header when session not found", async () => {
      const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);
      mockPrisma.session.findFirst.mockResolvedValue(null);

      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: `Bearer  ${token}`, // Two spaces after Bearer
        },
      });

      // The regex /^Bearer\s+(\S+)$/i allows multiple whitespace characters
      // but should still fail because no session exists
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Unauthorized");
    });

    it("should reject request with empty Authorization header", async () => {
      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: "",
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Unauthorized");
    });
  });

  describe("Token signature validation", () => {
    it("should reject token signed with wrong secret", async () => {
      const token = jwt.sign({ userId: "user-123" }, "wrong-secret");

      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Invalid token signature");
    });

    it("should reject malformed JWT token", async () => {
      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: "Bearer not-a-valid-jwt",
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Invalid token signature");
    });

    it("should reject token with modified signature", async () => {
      const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);
      const modifiedToken = `${token.slice(0, -5)}XXXXX`;

      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: `Bearer ${modifiedToken}`,
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Invalid token signature");
    });
  });

  describe("Session validation", () => {
    it("should reject valid JWT token with no matching session in database", async () => {
      const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);
      mockPrisma.session.findFirst.mockResolvedValue(null);

      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Unauthorized");
    });

    it("should reject valid JWT token with expired session in database", async () => {
      const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);
      const _expiredSession = {
        ...testSession,
        expiredAt: new Date(Date.now() - 1000), // Expired 1 second ago
      };
      mockPrisma.session.findFirst.mockResolvedValue(null); // findFirst returns null for expired sessions

      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe("error");
      expect(json.message).toBe("Unauthorized");
    });
  });

  describe("Successful authentication", () => {
    it("should accept valid token with matching active session", async () => {
      const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);
      mockPrisma.session.findFirst.mockResolvedValue(testSession);

      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.user).toBeDefined();
      expect(json.user.id).toBe("user-123");
      expect(json.user.username).toBe("testuser");
    });

    it("should set user context from session data", async () => {
      const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);
      mockPrisma.session.findFirst.mockResolvedValue(testSession);

      const res = await app.request("/api/v4/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.id).toBe(testUser.id);
      expect(json.user.username).toBe(testUser.username);
      expect(json.user.name).toBe(testUser.name);
    });

    it("should verify session token matches Authorization header", async () => {
      const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);
      mockPrisma.session.findFirst.mockResolvedValue(testSession);

      await app.request("/api/v4/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(mockPrisma.session.findFirst).toHaveBeenCalledWith({
        where: {
          token,
          expiredAt: {
            gte: expect.any(Date),
          },
        },
        include: {
          user: true,
        },
      });
    });
  });

  describe("Public endpoints", () => {
    it("should allow access to /api/v4/callback without authentication", async () => {
      app.post("/api/v4/callback/test", (c) => {
        return c.json({ status: "ok" });
      });

      const res = await app.request("/api/v4/callback/test", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });

    it("should allow access to /api/v4/vod without authentication", async () => {
      app.get("/api/v4/vod/mapping", (c) => {
        return c.json({ status: "ok" });
      });

      const res = await app.request("/api/v4/vod/mapping");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });

    it("should allow callback endpoints even with invalid token", async () => {
      app.post("/api/v4/callback/webhook", (c) => {
        return c.json({ status: "ok" });
      });

      const res = await app.request("/api/v4/callback/webhook", {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid-token",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });

    it("should allow vod endpoints even with invalid token", async () => {
      app.get("/api/v4/vod/stream", (c) => {
        return c.json({ status: "ok" });
      });

      const res = await app.request("/api/v4/vod/stream", {
        headers: {
          Authorization: "Bearer invalid-token",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
    });
  });
});
