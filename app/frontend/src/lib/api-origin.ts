import { ApiEndpoint } from "@/contexts/env";

/** Do not attach browser credentials to third-party media or signed S3 URLs. */
export function isApiUrl(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const api = new URL(ApiEndpoint || "/", window.location.origin);
    return new URL(url, window.location.origin).origin === api.origin;
  } catch {
    return false;
  }
}
