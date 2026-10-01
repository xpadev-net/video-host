import { client } from "@/lib/client";

export type AuthConfig = {
  passwordAuthEnabled: boolean;
  ssoEnabled: boolean;
  ssoDisplayName: string;
  signupEnabled: boolean;
};

/**
 * Fetches the public auth configuration.
 * Returns null when unavailable (e.g. older backend); callers should treat
 * that as password-auth-only for backward compatibility.
 */
export const getAuthConfig = async (): Promise<AuthConfig | null> => {
  try {
    const res = await client.api.v4.auth.config.$get();
    const body = await res.json();
    if (body.status !== "ok") {
      return null;
    }
    return body.data;
  } catch {
    return null;
  }
};
