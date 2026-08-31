const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;

if (!apiEndpoint) {
  throw new Error("VITE_API_ENDPOINT is required");
}

export const ApiEndpoint = apiEndpoint;
export const SiteName = import.meta.env.VITE_SITE_NAME ?? "Video Host";
export const EnableComments = import.meta.env.VITE_ENABLE_COMMENTS === "true";
export const RequireSignupCode =
  import.meta.env.VITE_REQUIRE_SIGNUP_CODE === "true";
