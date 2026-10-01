import type { Prisma, User } from "@prisma/client";
import type { Visibility } from "@/@types/models";

type FilterSchema = {
  visibility?: Visibility;
  title?: {
    contains?: string;
  };
  description?: {
    contains?: string;
  };
  authorId?: string;
  variants?: {
    some: {
      status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
    };
  };
  OR?: FilterSchema[];
  AND?: FilterSchema[];
};

// A movie only becomes watchable once at least one variant is READY: from the
// moment an upload starts until encoding finishes it behaves as private for
// everyone except its author and admins, regardless of the stored visibility.
// Admins see everything and get no extra constraint.
export const readyOrOwnMovieFilter = (user?: User): Prisma.MovieWhereInput => {
  if (user?.role === "ADMIN") {
    return {};
  }
  const conditions: Prisma.MovieWhereInput[] = [
    { variants: { some: { status: "READY" } } },
  ];
  if (user) {
    conditions.push({ authorId: user.id });
  }
  return { OR: conditions };
};

export const buildVisibilityFilter = (
  user?: User,
  query?: string,
  authorId?: string,
  options?: { requireReadyVariant?: boolean },
) => {
  const where: FilterSchema = {};
  const or: FilterSchema[] = [];
  const readyVariant: Pick<FilterSchema, "variants"> =
    options?.requireReadyVariant
      ? { variants: { some: { status: "READY" } } }
      : {};

  if (!user) {
    where.visibility = "PUBLIC";
    Object.assign(where, readyVariant);
  } else if (user.role !== "ADMIN") {
    or.push({
      OR: [
        {
          visibility: "PUBLIC",
          ...readyVariant,
        },
        {
          authorId: user.id,
        },
      ],
    });
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
