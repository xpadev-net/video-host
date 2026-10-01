import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import type { FilteredUser, PaginatedResponse } from "@/@types/models";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { meRoute } from "@/routes/api/v4/users/me";
import { ok } from "@/utils/response/ok";
import { userRoute } from "./[user]";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

const QuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default("1")
    .transform((v) => parseInt(v, 10)),
  limit: z
    .string()
    .optional()
    .default(DEFAULT_PAGE_SIZE.toString())
    .transform((v) => Math.min(parseInt(v, 10), MAX_PAGE_SIZE)),
  query: z.string().optional(),
});

const app = new Hono<Env>();

export const usersRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const { page, limit, query } = c.req.valid("query");

    const where = query
      ? {
          OR: [
            { username: { contains: query } },
            { name: { contains: query } },
          ],
        }
      : {};

    const totalCount = await prisma.user.count({ where });

    const users = await prisma.user.findMany({
      where,
      take: limit,
      skip: (page - 1) * limit,
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const response: PaginatedResponse<FilteredUser> = {
      items: users.map(filterUser),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext,
        hasPrev,
      },
    };

    return ok(c, response);
  })
  .route("/", meRoute)
  .route("/", userRoute);

export const registerUsersRoute = (app: HonoApp) => {
  app.route("/users", usersRoute);
};
