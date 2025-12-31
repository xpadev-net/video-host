import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import type { FilteredUser, PaginatedResponse } from "@/@types/models";
import { filterUser } from "@/lib/filter";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { meRoute } from "@/routes/api/v4/users/me";
import { badRequest } from "@/utils/response";
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

const PostSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must not exceed 32 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscores, and hyphens",
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/\d/, "Password must contain at least one number"),
  name: z.string().optional(),
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
  .post("/", zValidator("json", PostSchema), async (c) => {
    const data = c.req.valid("json");
    const { username, password, name } = data;

    const existing = await prisma.user.findUnique({
      where: {
        username,
      },
    });

    if (existing) {
      return badRequest(c, "Username already exists");
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        name: name || username,
        role: "USER",
      },
    });

    const token = await createSession(user.id);

    return ok(c, {
      user: filterUser(user),
      token,
    });
  })
  .route("/", meRoute)
  .route("/", userRoute);

export const registerUsersRoute = (app: HonoApp) => {
  // Mount routes to maintain compatibility order matters?
  // Original:
  // registerUsersMeRoute(api);
  // registerUsersDetailsRoute(api);
  // registerGetIndexRoute(api);
  // registerPostRoute(api);

  // New route chains get/post first, then me, then user.
  // Hono routing order: first registered matched.
  // if get /me matches get /:user, userRoute would capture it if registered first.
  // But here I chained .get('/') first.
  // Then .route('/', meRoute) -> mounts `/me`
  // Then .route('/', userRoute) -> mounts `/:user`
  // `/me` is more specific than `/:user`?
  // Hono uses regex. `me` is exact match. `/:user` is param.
  // If `me` is registered BEFORE `/:user`, it matches `me`.
  // So `meRoute` MUST be before `userRoute`.
  // I did `.route('/', meRoute)` then `.route('/', userRoute)`.
  // So `me` is first.

  // For export compability:
  app.route("/users", usersRoute);
};
