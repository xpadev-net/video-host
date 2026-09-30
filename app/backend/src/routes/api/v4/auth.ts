import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import {
  FRONTEND_URL,
  OIDC_DISPLAY_NAME,
  OIDC_ENABLED,
  PASSWORD_AUTH_ENABLED,
  SIGNUP_ENABLED,
} from "@/env";
import {
  buildSsoAuthorizationUrl,
  handleSsoCallback,
  OidcUserNotProvisionedError,
} from "@/lib/oidc";
import { isPasswordValid } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { authRateLimiter } from "@/lib/rateLimiter";
import { createSession } from "@/lib/session";
import { forbidden, unauthorized } from "@/utils/response";
import { ok } from "@/utils/response/ok";

const passwordAuthSchema = z.object({
  username: z.string(),
  password: z.string(),
  type: z.literal("password").optional().default("password"),
});

const tokenAuthSchema = z.object({
  token: z.string(),
  type: z.literal("token").optional().default("token"),
});

const authSchema = z.union([passwordAuthSchema, tokenAuthSchema]);

const app = new Hono<Env>();

const frontendUrl = (path: string) =>
  `${FRONTEND_URL.replace(/\/+$/, "")}${path}`;

const ssoErrorRedirect = (code: string) =>
  frontendUrl(`/login?error=${encodeURIComponent(code)}`);

export const authRoute = app
  .post("/", authRateLimiter, zValidator("json", authSchema), async (c) => {
    const data = c.req.valid("json");
    if (data.type === "token") {
      const { token } = data;
      const session = await prisma.session.findFirst({
        where: {
          token,
          expiredAt: {
            gte: new Date(),
          },
        },
      });
      if (!session) {
        unauthorized("Invalid token");
      }
      const newToken = await createSession(session.userId);
      return ok(c, newToken);
    }
    if (!PASSWORD_AUTH_ENABLED) {
      forbidden("Password authentication is disabled");
    }
    const { username, password } = data;
    const user = await prisma.user.findFirst({
      where: {
        username,
        password: {
          not: null,
        },
      },
    });
    if (!user?.password) {
      unauthorized("Invalid username or password");
    }
    if (!(await isPasswordValid(password, user.password))) {
      unauthorized("Invalid username or password");
    }
    const token = await createSession(user.id);
    return ok(c, token);
  })
  .delete("/", zValidator("json", tokenAuthSchema), async (c) => {
    const token = c.req.valid("json").token;
    if (!token) {
      unauthorized("Not logged in");
    }
    await prisma.session.deleteMany({
      where: {
        token,
      },
    });
    return ok(c, null);
  })
  .get("/config", async (c) => {
    // Public auth configuration consumed by the frontend login/register pages
    return ok(c, {
      passwordAuthEnabled: PASSWORD_AUTH_ENABLED,
      ssoEnabled: OIDC_ENABLED,
      ssoDisplayName: OIDC_DISPLAY_NAME,
      signupEnabled: SIGNUP_ENABLED,
    });
  })
  .get("/sso/login", async (c) => {
    if (!OIDC_ENABLED) {
      return c.redirect(ssoErrorRedirect("sso_unavailable"));
    }
    try {
      const url = await buildSsoAuthorizationUrl(
        c.req.query("callback") ?? null,
      );
      return c.redirect(url.toString());
    } catch (err) {
      console.error("Failed to build SSO authorization URL:", err);
      return c.redirect(ssoErrorRedirect("sso_unavailable"));
    }
  })
  .get("/sso/callback", async (c) => {
    if (!OIDC_ENABLED) {
      return c.redirect(ssoErrorRedirect("sso_unavailable"));
    }
    const idpError = new URL(c.req.url).searchParams.get("error");
    if (idpError) {
      console.error("OIDC provider returned an error:", idpError);
      return c.redirect(ssoErrorRedirect("sso_failed"));
    }
    try {
      const { token, callback } = await handleSsoCallback(c.req.url);
      const params = new URLSearchParams({ token });
      if (callback) {
        params.set("callback", callback);
      }
      // Fragment (not query): keeps the session token out of server logs
      // and Referer headers. The frontend parses it from location.hash.
      return c.redirect(frontendUrl(`/auth/callback#${params.toString()}`));
    } catch (err) {
      if (err instanceof OidcUserNotProvisionedError) {
        return c.redirect(ssoErrorRedirect("sso_user_not_found"));
      }
      console.error("SSO callback failed:", err);
      return c.redirect(ssoErrorRedirect("sso_failed"));
    }
  });

export const registerAuthRoute = (app: HonoApp) => {
  app.route("/auth", authRoute);
};
