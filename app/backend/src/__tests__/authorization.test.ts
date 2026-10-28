import type { User } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildMovieAccessWhere,
  buildProfileAccessFilter,
  buildVisibilityFilter,
  canViewMovie,
  canViewOwnedEntity,
  canViewProfile,
  readyOrOwnMovieFilter,
} from "../utils/buildVisibilityFilter";

/**
 * Tests for authorization and visibility filtering.
 * These tests verify that content visibility is correctly enforced based on:
 * - User authentication status (logged in vs. anonymous)
 * - User role (regular user vs. admin)
 * - Content visibility settings (PUBLIC, UNLISTED, PRIVATE, LIMITED)
 * - The author profile's visibility (content is never more visible than its author)
 */
describe("Authorization - Visibility Filtering", () => {
  const regularUser: User = {
    id: "user-123",
    username: "regularuser",
    name: "Regular User",
    role: "USER",
    avatarUrl: null,
    visibility: "PUBLIC",
    kind: "HUMAN",
    authUserId: null,
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminUser: User = {
    id: "admin-456",
    username: "adminuser",
    name: "Admin User",
    role: "ADMIN",
    avatarUrl: null,
    visibility: "PUBLIC",
    kind: "HUMAN",
    authUserId: null,
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const otherUser: User = {
    id: "other-789",
    username: "otheruser",
    name: "Other User",
    role: "USER",
    avatarUrl: null,
    visibility: "PUBLIC",
    kind: "HUMAN",
    authUserId: null,
    externalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // The author-profile cap nested under `author` for a non-admin requester.
  const profileCap = {
    OR: [
      { visibility: "PUBLIC" },
      { id: "user-123" },
      {
        visibility: { in: ["LIMITED", "PRIVATE"] },
        profileViewers: { some: { userId: "user-123" } },
      },
    ],
  };
  const unlistedProfileCap = {
    OR: [
      { visibility: { in: ["PUBLIC", "UNLISTED"] } },
      { id: "user-123" },
      {
        visibility: { in: ["LIMITED", "PRIVATE"] },
        profileViewers: { some: { userId: "user-123" } },
      },
    ],
  };

  describe("Unauthenticated users (no user context)", () => {
    it("should only see PUBLIC content by PUBLIC authors", () => {
      const filter = buildVisibilityFilter(undefined);

      expect(filter).toEqual({
        visibility: "PUBLIC",
        author: { visibility: "PUBLIC" },
      });
    });

    it("should only see PUBLIC content matching search query", () => {
      const filter = buildVisibilityFilter(undefined, "test query");

      expect(filter).toEqual({
        visibility: "PUBLIC",
        author: { visibility: "PUBLIC" },
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
        author: { visibility: "PUBLIC" },
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
        author: { visibility: "PUBLIC" },
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
          { visibility: "PUBLIC", author: profileCap },
          { authorId: "user-123" }, // Own content
        ],
      });
    });

    it("should see PUBLIC and own PRIVATE content", () => {
      const filter = buildVisibilityFilter(regularUser);

      // User should be able to see:
      // 1. All PUBLIC content by visible authors (regardless of author)
      // 2. All own content (PUBLIC, UNLISTED, or PRIVATE)
      expect(filter.OR).toContainEqual({
        visibility: "PUBLIC",
        author: profileCap,
      });
      expect(filter.OR).toContainEqual({ authorId: regularUser.id });
    });

    it("should NOT see other users' PRIVATE content", () => {
      const filter = buildVisibilityFilter(regularUser);

      // Filter should not include other authors' IDs
      expect(filter.OR).not.toContainEqual({ authorId: otherUser.id });
    });

    it("should see PUBLIC and own content matching search query", () => {
      const filter = buildVisibilityFilter(regularUser, "my video");

      expect(filter).toEqual({
        AND: [
          {
            OR: [
              { visibility: "PUBLIC", author: profileCap },
              { authorId: "user-123" },
            ],
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
        OR: [
          { visibility: "PUBLIC", author: profileCap },
          { authorId: "user-123" },
        ],
        authorId: "other-789",
      });
    });

    it("should see own content when filtering by own authorId", () => {
      const filter = buildVisibilityFilter(
        regularUser,
        undefined,
        regularUser.id,
      );

      expect(filter).toEqual({
        OR: [
          { visibility: "PUBLIC", author: profileCap },
          { authorId: "user-123" },
        ],
        authorId: "user-123",
      });
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

      expect(filterWithEmpty).toEqual(filterWithUndefined);
    });

    it("should handle null user same as undefined user", () => {
      const filter = buildVisibilityFilter(null as unknown as undefined);

      expect(filter).toEqual({
        visibility: "PUBLIC",
        author: { visibility: "PUBLIC" },
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

      expect(filter.AND?.[1]?.OR?.[0]).toEqual({
        title: { contains: specialQuery },
      });
    });
  });

  describe("Filter structure validation", () => {
    it("should create valid Prisma query structure for unauthenticated users", () => {
      const filter = buildVisibilityFilter(undefined, "query", "author-id");

      expect(filter).toHaveProperty("visibility");
      expect(filter).toHaveProperty("author");
      expect(filter).toHaveProperty("authorId");
      expect(filter).toHaveProperty("OR");
      expect(Array.isArray(filter.OR)).toBe(true);
    });

    it("should create valid Prisma query structure for regular users", () => {
      const filter = buildVisibilityFilter(regularUser, "query", "author-id");

      expect(filter).toHaveProperty("AND");
      expect(Array.isArray(filter.AND)).toBe(true);
      expect(filter.AND?.length).toBe(2);
    });

    it("should create valid Prisma query structure for admins", () => {
      const filter = buildVisibilityFilter(adminUser, "query", "author-id");

      expect(filter).toHaveProperty("authorId");
      expect(filter).toHaveProperty("OR");
      expect(filter).not.toHaveProperty("visibility");
    });

    it("should handle single OR condition correctly", () => {
      const filter = buildVisibilityFilter(regularUser);

      expect(filter).toHaveProperty("OR");
      expect(Array.isArray(filter.OR)).toBe(true);
    });

    it("should handle multiple OR conditions with AND", () => {
      const filter = buildVisibilityFilter(regularUser, "query");

      expect(filter).toHaveProperty("AND");
      expect(Array.isArray(filter.AND)).toBe(true);
      expect(filter.AND?.length).toBe(2);
    });
  });

  describe("LIMITED visibility (movies)", () => {
    it("should include LIMITED viewer clause when includeLimitedViewers is true", () => {
      const filter = buildVisibilityFilter(
        regularUser,
        undefined,
        undefined,
        true,
      );

      expect(filter).toEqual({
        OR: [
          { visibility: "PUBLIC", author: profileCap },
          { authorId: "user-123" },
          {
            visibility: "LIMITED",
            viewers: { some: { userId: "user-123" } },
            author: profileCap,
          },
        ],
      });
    });

    it("should not include viewer clause when includeLimitedViewers is false", () => {
      const filter = buildVisibilityFilter(regularUser);

      expect(filter).toEqual({
        OR: [
          { visibility: "PUBLIC", author: profileCap },
          { authorId: "user-123" },
        ],
      });
    });

    it("should keep PUBLIC-only filter for anonymous users", () => {
      const filter = buildVisibilityFilter(
        undefined,
        undefined,
        undefined,
        true,
      );

      expect(filter).toEqual({
        visibility: "PUBLIC",
        author: { visibility: "PUBLIC" },
      });
    });

    it("should apply no filter for admins even with includeLimitedViewers", () => {
      const filter = buildVisibilityFilter(
        adminUser,
        undefined,
        undefined,
        true,
      );

      expect(filter).toEqual({});
    });

    it("should combine viewer clause with query for regular users", () => {
      const filter = buildVisibilityFilter(
        regularUser,
        "shared",
        undefined,
        true,
      );

      expect(filter).toEqual({
        AND: [
          {
            OR: [
              { visibility: "PUBLIC", author: profileCap },
              { authorId: "user-123" },
              {
                visibility: "LIMITED",
                viewers: { some: { userId: "user-123" } },
                author: profileCap,
              },
            ],
          },
          {
            OR: [
              { title: { contains: "shared" } },
              { description: { contains: "shared" } },
            ],
          },
        ],
      });
    });
  });

  describe("buildMovieAccessWhere", () => {
    it("should restrict anonymous users to PUBLIC and UNLISTED by visible authors", () => {
      expect(buildMovieAccessWhere(undefined)).toEqual({
        visibility: { in: ["PUBLIC", "UNLISTED"] },
        variants: { some: { status: "READY" } },
        author: { visibility: { in: ["PUBLIC", "UNLISTED"] } },
      });
    });

    it("should allow regular users PUBLIC, UNLISTED, own, and shared LIMITED movies", () => {
      expect(buildMovieAccessWhere(regularUser)).toEqual({
        OR: [
          {
            visibility: { in: ["PUBLIC", "UNLISTED"] },
            variants: { some: { status: "READY" } },
            author: unlistedProfileCap,
          },
          { authorId: "user-123" },
          {
            visibility: "LIMITED",
            viewers: { some: { userId: "user-123" } },
            variants: { some: { status: "READY" } },
            author: unlistedProfileCap,
          },
        ],
      });
    });

    it("should allow admins everything", () => {
      expect(buildMovieAccessWhere(adminUser)).toEqual({});
    });
  });

  describe("readyOrOwnMovieFilter", () => {
    it("should restrict anonymous users to READY movies", () => {
      expect(readyOrOwnMovieFilter(undefined)).toEqual({
        OR: [{ variants: { some: { status: "READY" } } }],
      });
    });

    it("should allow regular users READY or own movies", () => {
      expect(readyOrOwnMovieFilter(regularUser)).toEqual({
        OR: [
          { variants: { some: { status: "READY" } } },
          { authorId: "user-123" },
        ],
      });
    });

    it("should allow admins everything", () => {
      expect(readyOrOwnMovieFilter(adminUser)).toEqual({});
    });
  });

  describe("canViewMovie", () => {
    const publicMovie = {
      visibility: "PUBLIC" as const,
      authorId: "other-789",
    };
    const unlistedMovie = {
      visibility: "UNLISTED" as const,
      authorId: "other-789",
    };
    const privateMovie = {
      visibility: "PRIVATE" as const,
      authorId: "other-789",
    };
    const limitedMovie = {
      visibility: "LIMITED" as const,
      authorId: "other-789",
      viewers: [{ userId: "user-123" }],
    };

    it("should allow anyone to view PUBLIC movies", () => {
      expect(canViewMovie(publicMovie, undefined)).toBe(true);
      expect(canViewMovie(publicMovie, regularUser)).toBe(true);
    });

    it("should allow anyone to view UNLISTED movies", () => {
      expect(canViewMovie(unlistedMovie, undefined)).toBe(true);
    });

    it("should restrict PRIVATE movies to author and admin", () => {
      expect(canViewMovie(privateMovie, undefined)).toBe(false);
      expect(canViewMovie(privateMovie, regularUser)).toBe(false);
      expect(canViewMovie(privateMovie, otherUser)).toBe(true);
      expect(canViewMovie(privateMovie, adminUser)).toBe(true);
    });

    it("should restrict LIMITED movies to author, admin, and listed viewers", () => {
      expect(canViewMovie(limitedMovie, undefined)).toBe(false);
      expect(canViewMovie(limitedMovie, regularUser)).toBe(true);
      expect(canViewMovie(limitedMovie, otherUser)).toBe(true);
      expect(canViewMovie(limitedMovie, adminUser)).toBe(true);
    });

    it("should deny LIMITED movies to non-viewers", () => {
      const movieSharedWithSomeoneElse = {
        visibility: "LIMITED" as const,
        authorId: "other-789",
        viewers: [{ userId: "someone-else" }],
      };
      expect(canViewMovie(movieSharedWithSomeoneElse, regularUser)).toBe(false);
    });

    it("should deny LIMITED movies with empty viewer list to non-owners", () => {
      const movieNoViewers = {
        visibility: "LIMITED" as const,
        authorId: "other-789",
        viewers: [],
      };
      expect(canViewMovie(movieNoViewers, regularUser)).toBe(false);
      expect(canViewMovie(movieNoViewers, adminUser)).toBe(true);
    });

    it("should cap a PUBLIC movie by its PRIVATE author profile", () => {
      const movie = {
        visibility: "PUBLIC" as const,
        authorId: "other-789",
        author: { id: "other-789", visibility: "PRIVATE" as const },
      };
      expect(canViewMovie(movie, undefined)).toBe(false);
      expect(canViewMovie(movie, regularUser)).toBe(false);
      expect(canViewMovie(movie, otherUser)).toBe(true);
      expect(canViewMovie(movie, adminUser)).toBe(true);
    });

    it("should cap a PUBLIC movie by its LIMITED author profile", () => {
      const movie = {
        visibility: "PUBLIC" as const,
        authorId: "other-789",
        author: {
          id: "other-789",
          visibility: "LIMITED" as const,
          profileViewers: [{ userId: "user-123" }],
        },
      };
      expect(canViewMovie(movie, undefined)).toBe(false);
      expect(canViewMovie(movie, regularUser)).toBe(true);
      expect(canViewMovie(movie, otherUser)).toBe(true);
    });

    it("should still let the author view their PRIVATE-profile PUBLIC movie", () => {
      const movie = {
        visibility: "PUBLIC" as const,
        authorId: "user-123",
        author: { id: "user-123", visibility: "PRIVATE" as const },
      };
      expect(canViewMovie(movie, regularUser)).toBe(true);
    });
  });

  describe("canViewOwnedEntity", () => {
    it("should cap a PUBLIC series by an UNLISTED author profile", () => {
      const series = {
        visibility: "PUBLIC" as const,
        authorId: "other-789",
        author: { id: "other-789", visibility: "UNLISTED" as const },
      };
      expect(canViewOwnedEntity(series, undefined)).toBe(true);
      expect(canViewOwnedEntity(series, regularUser)).toBe(true);
    });

    it("should cap a PUBLIC series by a PRIVATE author profile", () => {
      const series = {
        visibility: "PUBLIC" as const,
        authorId: "other-789",
        author: { id: "other-789", visibility: "PRIVATE" as const },
      };
      expect(canViewOwnedEntity(series, regularUser)).toBe(false);
      expect(canViewOwnedEntity(series, otherUser)).toBe(true);
      expect(canViewOwnedEntity(series, adminUser)).toBe(true);
    });
  });

  describe("canViewProfile", () => {
    it("allows PUBLIC and UNLISTED profiles to everyone", () => {
      expect(canViewProfile({ id: "p", visibility: "PUBLIC" }, undefined)).toBe(
        true,
      );
      expect(
        canViewProfile({ id: "p", visibility: "UNLISTED" }, undefined),
      ).toBe(true);
    });

    it("restricts PRIVATE profiles to owner and admin (no viewers)", () => {
      const profile = { id: "other-789", visibility: "PRIVATE" as const };
      expect(canViewProfile(profile, undefined)).toBe(false);
      expect(canViewProfile(profile, regularUser)).toBe(false);
      expect(canViewProfile(profile, otherUser)).toBe(true);
      expect(canViewProfile(profile, adminUser)).toBe(true);
    });

    it("allows PRIVATE profiles to their listed viewers", () => {
      const profile = {
        id: "other-789",
        visibility: "PRIVATE" as const,
        profileViewers: [{ userId: "user-123" }],
      };
      expect(canViewProfile(profile, undefined)).toBe(false);
      expect(canViewProfile(profile, regularUser)).toBe(true);
      expect(canViewProfile(profile, otherUser)).toBe(true);
      expect(canViewProfile(profile, adminUser)).toBe(true);
    });

    it("restricts LIMITED profiles to listed viewers", () => {
      const profile = {
        id: "other-789",
        visibility: "LIMITED" as const,
        profileViewers: [{ userId: "user-123" }],
      };
      expect(canViewProfile(profile, undefined)).toBe(false);
      expect(canViewProfile(profile, regularUser)).toBe(true);
      expect(canViewProfile(profile, otherUser)).toBe(true);
      expect(canViewProfile(profile, adminUser)).toBe(true);
    });
  });

  describe("buildProfileAccessFilter", () => {
    it("keeps anonymous to PUBLIC profiles only", () => {
      expect(buildProfileAccessFilter(undefined)).toEqual({
        visibility: "PUBLIC",
      });
    });

    it("lets non-admin see PUBLIC, own, and shared non-public profiles", () => {
      expect(buildProfileAccessFilter(regularUser)).toEqual({
        OR: [
          { visibility: "PUBLIC" },
          { id: "user-123" },
          {
            visibility: { in: ["LIMITED", "PRIVATE"] },
            profileViewers: { some: { userId: "user-123" } },
          },
        ],
      });
    });

    it("lets admins see everything", () => {
      expect(buildProfileAccessFilter(adminUser)).toEqual({});
    });

    it("includes UNLISTED when requested", () => {
      expect(
        buildProfileAccessFilter(undefined, { includeUnlisted: true }),
      ).toEqual({ visibility: { in: ["PUBLIC", "UNLISTED"] } });
    });
  });
});
