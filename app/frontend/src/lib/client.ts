import type { AppRouter } from "@video-host/backend";
import { hc } from "hono/client";
import { ApiEndpoint } from "@/contexts/env";

const customFetch = (input: RequestInfo | URL, requestInit?: RequestInit) =>
  fetch(input, { ...requestInit, credentials: "include" });

export const client = hc<AppRouter>(ApiEndpoint, { fetch: customFetch });
