/** Better Auth needs an absolute origin when its client runs during SSR. */
export function resolveAuthBaseURL(
  apiEndpoint: string,
  frontendURL: string | undefined,
  browserOrigin: string | undefined,
): string {
  return apiEndpoint || browserOrigin || frontendURL || "http://localhost:3000";
}
