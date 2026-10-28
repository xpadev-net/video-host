import type { Prisma, User } from "@prisma/client";
import type { Visibility } from "@/@types/models";

type WhereInput =
  | Prisma.MovieWhereInput
  | Prisma.SeriesWhereInput
  | Prisma.PlaylistWhereInput;

type FilterSchema<T extends WhereInput> = Omit<T, "OR" | "AND" | "NOT"> & {
  OR?: FilterSchema<T>[];
  AND?: FilterSchema<T>[];
};

type AccessFilterOptions = {
  includeLimitedViewers?: boolean;
  includeUnlisted?: boolean;
  // Require a READY variant on non-author clauses: from upload start until
  // encoding finishes a movie is private for everyone but its author and
  // admins, regardless of the stored visibility. FAILED is not READY.
  requireReadyVariant?: boolean;
};

// The author profile fields needed to enforce the profile visibility cap on a
// single, already-fetched entity.
export type ProfileAccess = {
  id: string;
  visibility: Visibility;
  profileViewers?: { userId: string }[];
};

const readyVariantClause = <T extends WhereInput>(
  requireReadyVariant?: boolean,
): FilterSchema<T> =>
  (requireReadyVariant
    ? { variants: { some: { status: "READY" } } }
    : {}) as FilterSchema<T>;

const anyoneClause = <T extends WhereInput>(
  opts?: AccessFilterOptions,
): FilterSchema<T> => {
  const ready = readyVariantClause<T>(opts?.requireReadyVariant);
  return (
    opts?.includeUnlisted
      ? { visibility: { in: ["PUBLIC", "UNLISTED"] }, ...ready }
      : { visibility: "PUBLIC", ...ready }
  ) as FilterSchema<T>;
};

/**
 * Whether a single profile (a User row) is visible to the requester.
 * PUBLIC and UNLISTED profiles are visible to anyone who reaches them;
 * non-public profiles (LIMITED or PRIVATE) grant access to their listed
 * viewers, so those viewers also see the profile's public content.
 */
export const canViewProfile = (
  profile: ProfileAccess,
  user?: User,
): boolean => {
  if (profile.visibility === "PUBLIC" || profile.visibility === "UNLISTED") {
    return true;
  }
  if (!user) return false;
  if (user.role === "ADMIN" || user.id === profile.id) return true;
  return (
    (profile.visibility === "LIMITED" || profile.visibility === "PRIVATE") &&
    (profile.profileViewers ?? []).some((viewer) => viewer.userId === user.id)
  );
};

/**
 * Where clause describing the profiles the requester may see, used to cap
 * content visibility: content can never be more widely visible than its
 * author's profile. Keys ownership off the profile's own `id` (not authorId).
 */
export const buildProfileAccessFilter = (
  user?: User,
  opts?: { includeUnlisted?: boolean },
): Prisma.UserWhereInput => {
  const anyone: Prisma.UserWhereInput = opts?.includeUnlisted
    ? { visibility: { in: ["PUBLIC", "UNLISTED"] } }
    : { visibility: "PUBLIC" };
  if (!user) return anyone;
  if (user.role === "ADMIN") return {};
  return {
    OR: [
      anyone,
      { id: user.id },
      {
        visibility: { in: ["LIMITED", "PRIVATE"] },
        profileViewers: { some: { userId: user.id } },
      },
    ],
  };
};

/**
 * Access predicate shared by list queries and nested includes.
 * - anonymous: PUBLIC only (+ UNLISTED when includeUnlisted)
 * - non-admin: PUBLIC, own content (any visibility), and (movies only)
 *   LIMITED entries whose viewer list contains the user
 * - admin: everything
 * Every branch is additionally capped by the author profile's visibility so
 * content is never exposed more widely than the profile that published it.
 */
const buildAccessFilter = <T extends WhereInput>(
  user?: User,
  opts?: AccessFilterOptions,
): FilterSchema<T> => {
  if (!user) {
    return {
      ...anyoneClause<T>(opts),
      author: buildProfileAccessFilter(undefined, opts),
    } as FilterSchema<T>;
  }
  if (user.role === "ADMIN") {
    return {} as FilterSchema<T>;
  }
  const or: FilterSchema<T>[] = [
    {
      ...anyoneClause<T>(opts),
      author: buildProfileAccessFilter(user, opts),
    } as FilterSchema<T>,
    { authorId: user.id } as FilterSchema<T>,
  ];
  if (opts?.includeLimitedViewers) {
    or.push({
      visibility: "LIMITED",
      viewers: { some: { userId: user.id } },
      ...readyVariantClause<T>(opts?.requireReadyVariant),
      author: buildProfileAccessFilter(user, opts),
    } as FilterSchema<T>);
  }
  return { OR: or } as unknown as FilterSchema<T>;
};

/**
 * Movies only become watchable once a variant is READY: from upload start
 * until encoding finishes they behave as private for everyone except their
 * author and admins, regardless of the stored visibility. FAILED is treated
 * the same way (not READY). Admins see everything.
 */
export const readyOrOwnMovieFilter = (
  user?: User,
): FilterSchema<Prisma.MovieWhereInput> => {
  if (user?.role === "ADMIN") {
    return {};
  }
  const conditions: FilterSchema<Prisma.MovieWhereInput>[] = [
    { variants: { some: { status: "READY" } } },
  ];
  if (user) {
    conditions.push({
      authorId: user.id,
    } as FilterSchema<Prisma.MovieWhereInput>);
  }
  return { OR: conditions } as FilterSchema<Prisma.MovieWhereInput>;
};

/**
 * Where clause for movies the requester may see inside an already-viewable
 * container: nested `movies` includes (series detail, playlist detail, etc.)
 * and per-series movie listings. UNLISTED movies are included here (they are
 * link-shared and shown inside their container, like YouTube playlists)
 * while PRIVATE and non-shared LIMITED movies stay hidden. Others' movies
 * also need a READY variant, so in-flight uploads never leak through embeds.
 */
export const buildMovieAccessWhere = (
  user?: User,
): FilterSchema<Prisma.MovieWhereInput> => {
  return buildAccessFilter<Prisma.MovieWhereInput>(user, {
    includeLimitedViewers: true,
    includeUnlisted: true,
    requireReadyVariant: true,
  });
};

/**
 * Whether a single entity (series / playlist) is visible to the requester.
 * LIMITED has no viewer list for these entities, so it is treated like
 * PRIVATE (author and admins only). Content is additionally capped by the
 * author profile's visibility when that profile is supplied.
 */
export const canViewOwnedEntity = (
  entity: {
    visibility: Visibility;
    authorId: string;
    author?: ProfileAccess;
  },
  user?: User,
): boolean => {
  const contentVisible =
    entity.visibility === "PUBLIC" || entity.visibility === "UNLISTED"
      ? true
      : !!user && (user.role === "ADMIN" || user.id === entity.authorId);
  if (!contentVisible) return false;
  return !entity.author || canViewProfile(entity.author, user);
};

/**
 * Whether a single movie is visible to the requester.
 * LIMITED movies are visible to the author, admins, and listed viewers, and
 * every movie is additionally capped by its author profile's visibility.
 */
export const canViewMovie = (
  movie: {
    visibility: Visibility;
    authorId: string;
    viewers?: { userId: string }[];
    author?: ProfileAccess;
  },
  user?: User,
): boolean => {
  let contentVisible: boolean;
  if (movie.visibility === "LIMITED") {
    contentVisible =
      !!user &&
      (user.role === "ADMIN" ||
        user.id === movie.authorId ||
        (movie.viewers ?? []).some((viewer) => viewer.userId === user.id));
  } else {
    contentVisible =
      movie.visibility === "PUBLIC" || movie.visibility === "UNLISTED"
        ? true
        : !!user && (user.role === "ADMIN" || user.id === movie.authorId);
  }
  if (!contentVisible) return false;
  return !movie.author || canViewProfile(movie.author, user);
};

export const buildVisibilityFilter = <
  T extends WhereInput = Prisma.MovieWhereInput,
>(
  user?: User,
  query?: string,
  authorId?: string,
  includeLimitedViewers = false,
): FilterSchema<T> => {
  const where: Record<string, unknown> = {};
  const or: Record<string, unknown>[] = [];

  const access = buildAccessFilter<T>(user, { includeLimitedViewers });
  if (access.OR) {
    or.push({ OR: access.OR });
  } else {
    // Anonymous (and admin, whose filter is empty) flatten their full access
    // predicate — including the author profile cap — directly into the where.
    Object.assign(where, access);
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

  return where as FilterSchema<T>;
};
