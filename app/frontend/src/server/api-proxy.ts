import { defineHandler, proxyRequest } from "nitro/h3";
import { getApiProxyTarget } from "./api-upstream";

export const apiProxy = defineHandler((event) => {
  const target = getApiProxyTarget(
    event.url.pathname + event.url.search,
    process.env.API_UPSTREAM_URL || "http://127.0.0.1:3001",
  );
  return proxyRequest(event, target, {
    // Origin is deliberately preserved for Better Auth's CSRF checks. Do not
    // trust client-supplied forwarding headers or follow upstream redirects
    // server-side with the user's cookies.
    filterHeaders: ["forwarded", "x-forwarded-host", "x-forwarded-proto"],
    fetchOptions: { redirect: "manual", signal: event.req.signal },
  });
});
