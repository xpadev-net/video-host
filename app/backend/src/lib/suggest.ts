import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type SuggestTable = "Series" | "Playlist";

type SuggestPage = {
  ids: string[];
  totalCount: number;
};

/**
 * Select one newest row per title before applying pagination. Prisma's
 * `distinct` runs after the database query, so combining it with take/skip
 * produces short pages and a count that does not describe the result set.
 */
export const getDistinctSuggestPage = async ({
  table,
  user,
  query,
  authorId,
  page,
  limit,
}: {
  table: SuggestTable;
  user?: User;
  query?: string;
  authorId?: string;
  page: number;
  limit: number;
}): Promise<SuggestPage> => {
  const conditions: Prisma.Sql[] = [];
  if (!user) {
    conditions.push(
      Prisma.sql`(visibility = 'PUBLIC' AND authorId IN (SELECT id FROM \`User\` WHERE visibility = 'PUBLIC'))`,
    );
  } else if (user.role !== "ADMIN") {
    // Suggestions are capped by the author profile's visibility, exactly like
    // buildVisibilityFilter: own rows always pass, others' PUBLIC rows pass
    // only while the author profile is PUBLIC or shared with this user.
    conditions.push(
      Prisma.sql`(
        (visibility = 'PUBLIC' AND (
          authorId IN (SELECT id FROM \`User\` WHERE visibility = 'PUBLIC')
          OR authorId IN (SELECT profileId FROM \`ProfileViewer\` WHERE userId = ${user.id})
        ))
        OR authorId = ${user.id}
      )`,
    );
  }
  if (query) {
    conditions.push(
      Prisma.sql`(MATCH(title) AGAINST (${query} IN BOOLEAN MODE) OR MATCH(description) AGAINST (${query} IN BOOLEAN MODE))`,
    );
  }
  if (authorId) {
    conditions.push(Prisma.sql`authorId = ${authorId}`);
  }

  const where = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;
  const tableName = Prisma.raw(`\`${table}\``);
  const [countResult, pageRows] = await Promise.all([
    prisma.$queryRaw<Array<{ totalCount: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT title) AS totalCount
      FROM ${tableName}
      ${where}
    `),
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id, updatedAt
      FROM (
        SELECT id, title, updatedAt,
          ROW_NUMBER() OVER (PARTITION BY title ORDER BY updatedAt DESC, id ASC) AS titleRank
        FROM ${tableName}
        ${where}
      ) AS ranked
      WHERE titleRank = 1
      ORDER BY updatedAt DESC, id ASC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `),
  ]);

  return {
    ids: pageRows.map(({ id }) => id),
    totalCount: Number(countResult[0]?.totalCount ?? 0n),
  };
};
