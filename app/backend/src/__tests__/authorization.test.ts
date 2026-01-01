import type { User } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildVisibilityFilter } from "../utils/buildVisibilityFilter";

/**
 * Tests for authorization and visibility filtering.
 * These tests verify that content visibility is correctly enforced based on:
 * - User authentication status (logged in vs. anonymous)
 * - User role (regular user vs. admin)
 * - Content visibility settings (PUBLIC, UNLISTED, PRIVATE)
 */
describe("Authorization - Visibility Filtering", () => {
  const regularUser: User = {
    id: "user-123",
    username: "regularuser",
    name: "Regular User",
    email: "regular@example.com",
    role: "USER",
    avatarUrl: null,
    password: "hashed-password",
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminUser: User = {
    id: "admin-456",
    username: "adminuser",
    name: "Admin User",
    email: "admin@example.com",
    role: "ADMIN",
    avatarUrl: null,
    password: "hashed-password",
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const otherUser: User = {
    id: "other-789",
    username: "otheruser",
    name: "Other User",
    email: "other@example.com",
    role: "USER",
    avatarUrl: null,
    password: "hashed-password",
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("Unauthenticated users (no user context)", () => {
    it("should only see PUBLIC content when no user is provided", () => {
      const filter = buildVisibilityFilter(undefined);

      expect(filter).toEqual({
        visibility: "PUBLIC",
      });
    });

    it("should only see PUBLIC content matching search query", () => {
      const filter = buildVisibilityFilter(undefined, "test query");

      expect(filter).toEqual({
        visibility: "PUBLIC",
        OR: [
          { title: { contains: "test query" } },
          { description: { contains: "test query" } },
        ],
      });
    });

    it("should only see PUBLIC content from specific author", () => {
      const filter = buildVisibilityFilter(undefined, undefined, "author-123");

      expect(filter).toEqual({
        visibility: "PUBLIC",
        authorId: "author-123",
      });
    });

    it("should combine visibility, query, and author filters for unauthenticated users", () => {
      const filter = buildVisibilityFilter(
        undefined,
        "search term",
        "author-456",
      );

      expect(filter).toEqual({
        visibility: "PUBLIC",
        authorId: "author-456",
        OR: [
          { title: { contains: "search term" } },
          { description: { contains: "search term" } },
        ],
      });
    });
  });

  describe("Regular users (authenticated, non-admin)", () => {
    it("should see PUBLIC content and own content", () => {
      const filter = buildVisibilityFilter(regularUser);

      expect(filter).toEqual({
        OR: [
          { visibility: "PUBLIC" },
          { authorId: "user-123" }, // Own content
        ],
      });
    });

    it("should see PUBLIC and own PRIVATE content", () => {
      const filter = buildVisibilityFilter(regularUser);

      // User should be able to see:
      // 1. All PUBLIC content (regardless of author)
      // 2. All own content (PUBLIC, UNLISTED, or PRIVATE)
      expect(filter.OR).toContainEqual({ visibility: "PUBLIC" });
      expect(filter.OR).toContainEqual({ authorId: regularUser.id });
    });

    it("should NOT see other users' PRIVATE content", () => {
      const filter = buildVisibilityFilter(regularUser);

      // Filter should not include other authors' IDs
      expect(filter.OR).not.toContainEqual({ authorId: otherUser.id });

      // The filter structure ensures that content must be either:
      // - PUBLIC (any author), OR
      // - Owned by the current user (any visibility)
      // This implicitly blocks PRIVATE content from other users
    });

    it("should see PUBLIC and own content matching search query", () => {
      const filter = buildVisibilityFilter(regularUser, "my video");

      expect(filter).toEqual({
        AND: [
          {
            OR: [{ visibility: "PUBLIC" }, { authorId: "user-123" }],
          },
          {
            OR: [
              { title: { contains: "my video" } },
              { description: { contains: "my video" } },
            ],
          },
        ],
      });
    });

    it("should filter by author while maintaining visibility rules", () => {
      const filter = buildVisibilityFilter(regularUser, undefined, "other-789");

      expect(filter).toEqual({
        OR: [{ visibility: "PUBLIC" }, { authorId: "user-123" }],
        authorId: "other-789",
      });

      // This means: Show content where author is "other-789"
      // AND (visibility is PUBLIC OR authorId is user-123)
      // In practice, this will only show "other-789"'s PUBLIC content
      // because content can't simultaneously be authored by "other-789" and "user-123"
    });

    it("should see own content when filtering by own authorId", () => {
      const filter = buildVisibilityFilter(
        regularUser,
        undefined,
        regularUser.id,
      );

      expect(filter).toEqual({
        OR: [{ visibility: "PUBLIC" }, { authorId: "user-123" }],
        authorId: "user-123",
      });

      // This shows all of the user's own content (PUBLIC, UNLISTED, PRIVATE)
    });
  });

  describe("Admin users", () => {
    it("should see ALL content regardless of visibility", () => {
      const filter = buildVisibilityFilter(adminUser);

      expect(filter).toEqual({});
    });

    it("should see all content matching search query", () => {
      const filter = buildVisibilityFilter(adminUser, "admin search");

      expect(filter).toEqual({
        OR: [
          { title: { contains: "admin search" } },
          { description: { contains: "admin search" } },
        ],
      });
    });

    it("should see all content from specific author", () => {
      const filter = buildVisibilityFilter(adminUser, undefined, "any-author");

      expect(filter).toEqual({
        authorId: "any-author",
      });
    });

    it("should combine query and author filters for admin", () => {
      const filter = buildVisibilityFilter(
        adminUser,
        "test",
        "specific-author",
      );

      expect(filter).toEqual({
        authorId: "specific-author",
        OR: [
          { title: { contains: "test" } },
          { description: { contains: "test" } },
        ],
      });
    });

    it("should see PRIVATE content from any user", () => {
      // For admin, no visibility filter is applied at all
      const filter = buildVisibilityFilter(adminUser);

      expect(filter).not.toHaveProperty("visibility");
      expect(filter).not.toHaveProperty("OR");
    });
  });

  describe("Edge cases and complex scenarios", () => {
    it("should handle empty search query same as no query", () => {
      const filterWithEmpty = buildVisibilityFilter(regularUser, "");
      const filterWithUndefined = buildVisibilityFilter(regularUser, undefined);

      // Empty string should be treated as no query
      // The buildVisibilityFilter function checks truthiness with if (query)
      // so "" would be falsy and treated the same as undefined
      expect(filterWithEmpty).toEqual(filterWithUndefined);
    });

    it("should handle null user same as undefined user", () => {
      const filter = buildVisibilityFilter(null as unknown as undefined);

      expect(filter).toEqual({
        visibility: "PUBLIC",
      });
    });

    it("should handle whitespace in search query", () => {
      const filter = buildVisibilityFilter(regularUser, "  search  ");

      // The function doesn't trim whitespace, so it's passed as-is
      expect(filter.AND?.[1]?.OR?.[0]).toEqual({
        title: { contains: "  search  " },
      });
    });

    it("should handle special characters in search query", () => {
      const specialQuery = "test@#$%^&*()";
      const filter = buildVisibilityFilter(regularUser, specialQuery);

      // Special characters should be passed through to the database query
      // The database layer handles escaping
      expect(filter.AND?.[1]?.OR?.[0]).toEqual({
        title: { contains: specialQuery },
      });
    });
  });

  describe("Filter structure validation", () => {
    it("should create valid Prisma query structure for unauthenticated users", () => {
      const filter = buildVisibilityFilter(undefined, "query", "author-id");

      // Validate the structure can be used in a Prisma query
      expect(filter).toHaveProperty("visibility");
      expect(filter).toHaveProperty("authorId");
      expect(filter).toHaveProperty("OR");
      expect(Array.isArray(filter.OR)).toBe(true);
    });

    it("should create valid Prisma query structure for regular users", () => {
      const filter = buildVisibilityFilter(regularUser, "query", "author-id");

      // Validate AND structure for combining multiple OR conditions
      expect(filter).toHaveProperty("AND");
      expect(Array.isArray(filter.AND)).toBe(true);
      expect(filter.AND?.length).toBe(2);
    });

    it("should create valid Prisma query structure for admins", () => {
      const filter = buildVisibilityFilter(adminUser, "query", "author-id");

      // Admin filter should only have authorId and OR (for query)
      expect(filter).toHaveProperty("authorId");
      expect(filter).toHaveProperty("OR");
      expect(filter).not.toHaveProperty("visibility");
    });

    it("should handle single OR condition correctly", () => {
      // When there's only one OR condition, it should be unwrapped
      const filter = buildVisibilityFilter(regularUser);

      // Should have OR at top level, not wrapped in AND
      expect(filter).toHaveProperty("OR");
      expect(Array.isArray(filter.OR)).toBe(true);
    });

    it("should handle multiple OR conditions with AND", () => {
      // When there are multiple OR conditions, they should be in AND
      const filter = buildVisibilityFilter(regularUser, "query");

      expect(filter).toHaveProperty("AND");
      expect(Array.isArray(filter.AND)).toBe(true);
      expect(filter.AND?.length).toBe(2);
    });
  });
});
