import type { User } from "@prisma/client";
import type { Visibility } from "@/@types/models";

type FilterSchema = {
  visibility?: Visibility | { in?: Visibility[] };
  title?: {
    contains?: string;
  };
  description?: {
    contains?: string;
  };
  authorId?: string;
  viewers?: {
    some?: {
      userId?: string;
    };
  };
  OR?: FilterSchema[];
  AND?: FilterSchema[];
};

type AccessFilterOptions = {
  includeLimitedViewers?: boolean;
  includeUnlisted?: boolean;
};

const anyoneClause = (includeUnlisted?: boolean): FilterSchema => {
  return includeUnlisted
    ? { visibility: { in: ["PUBLIC", "UNLISTED"] } }
    : { visibility: "PUBLIC" };
};

/**
 * Access predicate shared by list queries and nested includes.
 * - anonymous: PUBLIC only (+ UNLISTED when includeUnlisted)
 * - non-admin: PUBLIC, own content (any visibility), and (movies only)
 *   LIMITED entries whose viewer list contains the user
 * - admin: everything
 */
const buildAccessFilter = (user?: User, opts?: AccessFilterOptions) => {
  if (!user) {
    return anyoneClause(opts?.includeUnlisted);
  }
  if (user.role === "ADMIN") {
    return {};
  }
  const or: FilterSchema[] = [
    anyoneClause(opts?.includeUnlisted),
    { authorId: user.id },
  ];
  if (opts?.includeLimitedViewers) {
    or.push({
      visibility: "LIMITED",
      viewers: { some: { userId: user.id } },
    });
  }
  return { OR: or };
};

/**
 * Where clause for movies the requester may see inside an already-viewable
 * container: nested `movies` includes (series detail, playlist detail, etc.)
 * and per-series movie listings. UNLISTED movies are included here (they are
 * link-shared and shown inside their container, like YouTube playlists)
 * while PRIVATE and non-shared LIMITED movies stay hidden.
 */
export const buildMovieAccessWhere = (user?: User): FilterSchema => {
  return buildAccessFilter(user, {
    includeLimitedViewers: true,
    includeUnlisted: true,
  });
};

/**
 * Whether a single entity (series / playlist) is visible to the requester.
 * LIMITED has no viewer list for these entities, so it is treated like
 * PRIVATE (author and admins only).
 */
export const canViewOwnedEntity = (
  entity: { visibility: Visibility; authorId: string },
  user?: User,
): boolean => {
  if (entity.visibility === "PUBLIC" || entity.visibility === "UNLISTED") {
    return true;
  }
  return !!user && (user.role === "ADMIN" || user.id === entity.authorId);
};

/**
 * Whether a single movie is visible to the requester.
 * LIMITED movies are visible to the author, admins, and listed viewers.
 */
export const canViewMovie = (
  movie: {
    visibility: Visibility;
    authorId: string;
    viewers?: { userId: string }[];
  },
  user?: User,
): boolean => {
  if (movie.visibility === "LIMITED") {
    return (
      !!user &&
      (user.role === "ADMIN" ||
        user.id === movie.authorId ||
        (movie.viewers ?? []).some((viewer) => viewer.userId === user.id))
    );
  }
  return canViewOwnedEntity(movie, user);
};

export const buildVisibilityFilter = (
  user?: User,
  query?: string,
  authorId?: string,
  includeLimitedViewers = false,
) => {
  const where: FilterSchema = {};
  const or: FilterSchema[] = [];

  const access = buildAccessFilter(user, { includeLimitedViewers });
  if (access.OR) {
    or.push({ OR: access.OR });
  } else if (access.visibility) {
    where.visibility = access.visibility;
  }

  if (query) {
    or.push({
      OR: [
        {
          title: {
            contains: query,
          },
        },
        {
          description: {
            contains: query,
          },
        },
      ],
    });
  }

  if (authorId) {
    where.authorId = authorId;
  }

  if (or.length === 1) {
    where.OR = or[0].OR;
  } else if (or.length > 1) {
    where.AND = or;
  }

  return where;
};
