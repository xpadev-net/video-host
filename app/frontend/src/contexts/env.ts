import {
  resolveApiEndpoint,
  resolveRuntimeFlag,
  resolveRuntimeString,
} from "@/utils/runtimeEnv";

// Empty means same-origin API proxy; cross-origin deployments must explicitly
// configure their credentialed CORS and cookie policy on the backend.
export const ApiEndpoint = resolveApiEndpoint(
  import.meta.env.VITE_API_ENDPOINT,
);
const runtimeSiteName = import.meta.env.VITE_SITE_NAME;
export const SiteName = import.meta.env.SSR
  ? runtimeSiteName || "Video Host"
  : resolveRuntimeString(runtimeSiteName, "Video Host");
export const EnableComments = resolveRuntimeFlag(
  import.meta.env.VITE_ENABLE_COMMENTS,
);
