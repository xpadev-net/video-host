import { client } from "@/lib/client";

export type AuthConfig = {
  passwordAuthEnabled: boolean;
  ssoEnabled: boolean;
  ssoDisplayName: string;
  ssoProviderId: string | null;
  accountLinkingEnabled: boolean;
  signupEnabled: boolean;
  requireSignupCode: boolean;
};

/**
 * Fetches the public auth configuration.
 * Returns null when unavailable; the UI reports configuration failure.
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
