import type { User } from "@prisma/client";
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
  OR?: FilterSchema[];
  AND?: FilterSchema[];
};

export const buildVisibilityFilter = (
  user?: User,
  query?: string,
  authorId?: string,
) => {
  const where: FilterSchema = {};
  const or: FilterSchema[] = [];

  if (!user) {
    where.visibility = "PUBLIC";
  } else if (user.role !== "ADMIN") {
    or.push({
      OR: [
        {
          visibility: "PUBLIC",
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
