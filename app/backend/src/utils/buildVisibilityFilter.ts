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
  variants?: {
    some?: {
      status?: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
    };
  };
  OR?: FilterSchema[];
  AND?: FilterSchema[];
};

type AccessFilterOptions = {
  includeLimitedViewers?: boolean;
  includeUnlisted?: boolean;
  // Require a READY variant on non-author clauses: from upload start until
  // encoding finishes a movie is private for everyone but its author and
  // admins, regardless of the stored visibility. FAILED is not READY.
  requireReadyVariant?: boolean;
};

const readyVariantClause = (requireReadyVariant?: boolean): FilterSchema =>
  requireReadyVariant ? { variants: { some: { status: "READY" } } } : {};

const anyoneClause = (opts?: AccessFilterOptions): FilterSchema => {
  const ready = readyVariantClause(opts?.requireReadyVariant);
  return opts?.includeUnlisted
    ? { visibility: { in: ["PUBLIC", "UNLISTED"] }, ...ready }
    : { visibility: "PUBLIC", ...ready };
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
    return anyoneClause(opts);
  }
  if (user.role === "ADMIN") {
    return {};
  }
  const or: FilterSchema[] = [anyoneClause(opts), { authorId: user.id }];
  if (opts?.includeLimitedViewers) {
    or.push({
      visibility: "LIMITED",
      viewers: { some: { userId: user.id } },
      ...readyVariantClause(opts?.requireReadyVariant),
    });
  }
  return { OR: or };
};

/**
 * Movies only become watchable once a variant is READY: from upload start
 * until encoding finishes they behave as private for everyone except their
 * author and admins, regardless of the stored visibility. FAILED is treated
 * the same way (not READY). Admins see everything.
 */
export const readyOrOwnMovieFilter = (user?: User): FilterSchema => {
  if (user?.role === "ADMIN") {
    return {};
  }
  const conditions: FilterSchema[] = [
    { variants: { some: { status: "READY" } } },
  ];
  if (user) {
    conditions.push({ authorId: user.id });
  }
  return { OR: conditions };
};

/**
 * Where clause for movies the requester may see inside an already-viewable
 * container: nested `movies` includes (series detail, playlist detail, etc.)
 * and per-series movie listings. UNLISTED movies are included here (they are
 * link-shared and shown inside their container, like YouTube playlists)
 * while PRIVATE and non-shared LIMITED movies stay hidden. Others' movies
 * also need a READY variant, so in-flight uploads never leak through embeds.
 */
export const buildMovieAccessWhere = (user?: User): FilterSchema => {
  return buildAccessFilter(user, {
    includeLimitedViewers: true,
    includeUnlisted: true,
    requireReadyVariant: true,
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
