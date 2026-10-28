import { zValidator } from "@hono/zod-validator";
import type { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import type { FilteredUser, PaginatedResponse } from "@/@types/models";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { meRoute } from "@/routes/api/v4/users/me";
import { profilesRoute } from "@/routes/api/v4/users/profiles";
import { paginationQuerySchema } from "@/utils/pagination";
import { ok } from "@/utils/response/ok";
import { userRoute } from "./[user]";

const QuerySchema = paginationQuerySchema().extend({
  query: z.string().optional(),
});

const app = new Hono<Env>();

export const usersRoute = app
  .get("/", zValidator("query", QuerySchema), async (c) => {
    const { page, limit, query } = c.req.valid("query");
    const user = c.get("user");

    // The user search feeds viewer invitations and must not leak non-public
    // profiles: only PUBLIC profiles (default profiles are always public) are
    // searchable, plus the requester's own profiles and everything for admins.
    const conditions: Prisma.UserWhereInput[] = [];
    if (query) {
      conditions.push({
        OR: [{ username: { contains: query } }, { name: { contains: query } }],
      });
    }
    if (!user) {
      conditions.push({ visibility: "PUBLIC" });
    } else if (user.role !== "ADMIN") {
      conditions.push({
        OR: [{ visibility: "PUBLIC" }, { id: user.id }],
      });
    }
    const where: Prisma.UserWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};

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
  .route("/profiles", profilesRoute)
  .route("/", userRoute);

export const registerUsersRoute = (app: HonoApp) => {
  app.route("/users", usersRoute);
};
