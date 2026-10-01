import { resolveApiEndpoint, resolveRuntimeFlag } from "@/utils/runtimeEnv";

// Empty means same-origin API proxy; cross-origin deployments must explicitly
// configure their credentialed CORS and cookie policy on the backend.
export const ApiEndpoint = resolveApiEndpoint(
  import.meta.env.VITE_API_ENDPOINT,
);
export const SiteName = import.meta.env.VITE_SITE_NAME ?? "Video Host";
export const EnableComments = resolveRuntimeFlag(
  import.meta.env.VITE_ENABLE_COMMENTS,
);
export const RequireSignupCode = resolveRuntimeFlag(
  import.meta.env.VITE_REQUIRE_SIGNUP_CODE,
);
