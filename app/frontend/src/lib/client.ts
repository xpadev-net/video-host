import type { AppRouter } from "@video-host/backend";
import { hc } from "hono/client";
import { ApiEndpoint } from "@/contexts/env";

export const getSelectedProfileId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const storedProfile = window.localStorage.getItem(
      "dashboard-selected-profile",
    );
    if (!storedProfile) return null;
    const profileId: unknown = JSON.parse(storedProfile);
    return typeof profileId === "string" ? profileId : null;
  } catch {
    return null;
  }
};

const customFetch = (input: RequestInfo | URL, requestInit?: RequestInit) => {
  const headers = new Headers(requestInit?.headers);
  if (headers.has("X-Profile-Id")) {
    if (!headers.get("X-Profile-Id")) headers.delete("X-Profile-Id");
  } else {
    const profileId = getSelectedProfileId();
    if (profileId) headers.set("X-Profile-Id", profileId);
  }
  if (typeof window !== "undefined" && !headers.has("X-Account-Id")) {
    try {
      const accountId: unknown = JSON.parse(
        window.localStorage.getItem("dashboard-selected-account") ?? "null",
      );
      if (typeof accountId === "string") headers.set("X-Account-Id", accountId);
    } catch {
      /* Ignore invalid local selection. */
    }
  }
  return fetch(input, {
    ...requestInit,
    headers,
    credentials: "include",
  });
};

export const client = hc<AppRouter>(ApiEndpoint, { fetch: customFetch });
