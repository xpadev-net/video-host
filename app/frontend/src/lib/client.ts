import type { AppRouter } from "@video-host/backend";
import { hc } from "hono/client";

const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;
if (!apiEndpoint) {
  throw new Error("NEXT_PUBLIC_API_ENDPOINT is not defined");
}

export const client = hc<AppRouter>(apiEndpoint);
