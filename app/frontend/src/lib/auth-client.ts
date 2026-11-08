import { createAuthClient } from "better-auth/react";
import { ApiEndpoint } from "@/contexts/env";
import { resolveAuthBaseURL } from "@/utils/authBaseURL";

// Session cookies are HttpOnly. Never persist or copy a session token in browser
// storage. An empty API endpoint uses the same-origin frontend proxy.
export const authClient = createAuthClient({
  baseURL: resolveAuthBaseURL(
    ApiEndpoint,
    typeof process !== "undefined" ? process.env.FRONTEND_URL : undefined,
    typeof window !== "undefined" ? window.location.origin : undefined,
  ),
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});
