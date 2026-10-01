import { createAuthClient } from "better-auth/react";
import { ApiEndpoint } from "@/contexts/env";

// Session cookies are HttpOnly. Never persist or copy a session token in browser
// storage. An empty API endpoint uses the same-origin frontend proxy.
export const authClient = createAuthClient({
  ...(ApiEndpoint ? { baseURL: ApiEndpoint } : {}),
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});
