/** Only the fixed backend's API namespaces may be proxied. */
export function getApiProxyTarget(path: string, upstream: string): string {
  const base = new URL(upstream);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  ) {
    throw new Error("API_UPSTREAM_URL must be an HTTP(S) origin");
  }
  if (!/^\/api\/(auth|v4)(\/|\?|$)/.test(path) || path.includes("\\")) {
    throw new Error("Unsupported API proxy path");
  }
  const target = new URL(path, base);
  if (
    target.origin !== base.origin ||
    !/^\/api\/(auth|v4)(\/|$)/.test(target.pathname)
  ) {
    throw new Error("Unsupported API proxy path");
  }
  return target.href;
}
