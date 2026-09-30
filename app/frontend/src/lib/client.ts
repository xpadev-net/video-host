import type { AppRouter } from "@video-host/backend";
import { hc } from "hono/client";
import { AuthTokenLocalStorageKey } from "@/atoms/Auth";

const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;
if (!apiEndpoint) {
  throw new Error("NEXT_PUBLIC_API_ENDPOINT is not defined");
}

const customFetch = async (
  input: RequestInfo | URL,
  requestInit?: RequestInit,
) => {
  const storedToken =
    typeof window !== "undefined"
      ? localStorage.getItem(AuthTokenLocalStorageKey)
      : null;
  const token = storedToken
    ? storedToken.startsWith('"')
      ? storedToken.slice(1, -1)
      : storedToken
    : null;

  const headers = new Headers(requestInit?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...requestInit, headers });
};

export const client = hc<AppRouter>(apiEndpoint, { fetch: customFetch });
