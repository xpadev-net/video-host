import { Hono } from "hono";
import type { Env, HonoApp } from "@/@types/hono";
import {
  OIDC_DISPLAY_NAME,
  OIDC_ENABLED,
  PASSWORD_AUTH_ENABLED,
  SIGNUP_CODE,
  SIGNUP_ENABLED,
} from "@/env";
import { accountLinkingEnabled, ssoProviderId } from "@/lib/auth";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();

// Credential and session operations belong exclusively to /api/auth/*.
export const authRoute = app.get("/config", (c) =>
  ok(c, {
    passwordAuthEnabled: PASSWORD_AUTH_ENABLED,
    ssoEnabled: OIDC_ENABLED,
    ssoDisplayName: OIDC_DISPLAY_NAME,
    signupEnabled: SIGNUP_ENABLED,
    requireSignupCode: Boolean(SIGNUP_CODE),
    ssoProviderId,
    accountLinkingEnabled,
  }),
);

export const registerAuthRoute = (app: HonoApp) => {
  app.route("/auth", authRoute);
};
